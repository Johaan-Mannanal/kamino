"""Expiring browser access; the shared application credential never enters a cookie."""

import hashlib
import hmac
import secrets
import time

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from photo2sim.api.access_limits import LIMITS, SESSION_SECONDS

COOKIE = "kamino_session"
LIFETIME = 12 * 60 * 60


def bearer_access(request: Request, key: str) -> bool:
    scheme, _, value = request.headers.get("authorization", "").partition(" ")
    return (
        bool(key)
        and scheme.lower() == "bearer"
        and secrets.compare_digest(value.encode(), key.encode())
    )


def signature(value: str, key: str) -> str:
    return hmac.new(
        key.encode(), ("kamino-browser-v1:" + value).encode(), hashlib.sha256
    ).hexdigest()


def cookie_access(request: Request, key: str) -> bool:
    if not key:
        return False
    raw = request.cookies.get(COOKIE, "")
    if len(raw) > 200:
        return False
    try:
        expires, nonce, signed = raw.split(".")
        remaining = int(expires) - time.time()
        return (
            0 < remaining <= LIFETIME
            and len(nonce) == 32
            and secrets.compare_digest(signed, signature(f"{expires}.{nonce}", key))
        )
    except (ValueError, TypeError):
        return False


def authorized(request: Request, key: str) -> bool:
    if not key:
        return True
    # An explicitly supplied bad bearer is never rescued by a browser cookie.
    if request.headers.get("authorization"):
        return bearer_access(request, key)
    return cookie_access(request, key)


def tier_codes(settings):
    return {
        "student": settings.student_code,
        "judge": settings.judge_code,
        "team": settings.team_code,
    }


def bearer_role(request, settings):
    if bearer_access(request, settings.api_token):
        return "team"
    for role, code in tier_codes(settings).items():
        if code and bearer_access(request, code):
            return role
    return None


def access_role(request, settings):
    if not settings.api_token:
        return "team"
    if request.headers.get("authorization"):
        return bearer_role(request, settings)
    raw = request.cookies.get(COOKIE, "")
    if len(raw) > 250:
        return None
    if not raw.startswith("v2."):
        return "team" if cookie_access(request, settings.api_token) else None
    try:
        version, role, expires, nonce, fingerprint, signed = raw.split(".")
        code = tier_codes(settings).get(role)
        if not code or len(nonce) != 32:
            return None
        value = ".".join([version, role, expires, nonce, fingerprint])
        if (
            0 < int(expires) - time.time() <= SESSION_SECONDS[role]
            and secrets.compare_digest(
                fingerprint, signature("code:" + code, settings.api_token)[:16]
            )
            and secrets.compare_digest(signed, signature(value, settings.api_token))
        ):
            return role
    except (ValueError, TypeError, KeyError):
        pass
    return None


def role_details(role):
    return {
        "role": role,
        "session_seconds": SESSION_SECONDS[role],
        "limits": {
            action: {"per_24_hours": maximum, "cooldown_seconds": cooldown}
            for action, (maximum, cooldown) in LIMITS.get(role, {}).items()
        },
    }


def trusted_origin(request: Request, origins: tuple[str, ...], public_origin: str = "") -> bool:
    origin = request.headers.get("origin", "")
    return origin in {public_origin or str(request.base_url).rstrip("/"), *origins}


def register_session_routes(app, settings):
    @app.get("/api/session")
    def status(request: Request):
        role = access_role(request, settings)
        return JSONResponse(
            {
                "required": bool(settings.api_token),
                "authenticated": role is not None,
                **({"public_student_access": True} if settings.public_student_access else {}),
                **(role_details(role) if role and settings.api_token else {}),
            },
            headers={"Cache-Control": "no-store"},
        )

    @app.post("/api/session")
    def sign_in(request: Request):
        if request.headers.get("origin") and not trusted_origin(
            request, settings.cors_origins, settings.public_origin
        ):
            raise HTTPException(403, "Sign in from the Kamino website")
        public_request = settings.public_student_access and "authorization" not in request.headers
        if public_request and not trusted_origin(
            request, settings.cors_origins, settings.public_origin
        ):
            raise HTTPException(403, "Sign in from the Kamino website")
        existing_role = access_role(request, settings) if public_request else None
        if public_request:
            # Keep an existing privileged session; anonymous visitors only receive student access.
            role = existing_role or "student"
        else:
            role = bearer_role(request, settings) if settings.api_token else "team"
        if role is None:
            raise HTTPException(401, "That team access code was not accepted")
        secure = bool(settings.public_origin) or request.url.scheme == "https"
        if not secure and request.url.hostname not in {"localhost", "127.0.0.1", "::1"}:
            raise HTTPException(400, "Sign in over HTTPS")
        result = JSONResponse(
            {"authenticated": True, **role_details(role)}, headers={"Cache-Control": "no-store"}
        )
        if settings.api_token and not existing_role:
            lifetime = SESSION_SECONDS[role]
            value = f"{int(time.time()) + lifetime}.{secrets.token_hex(16)}"
            code = tier_codes(settings)[role]
            if code and not bearer_access(request, settings.api_token):
                fingerprint = signature("code:" + code, settings.api_token)[:16]
                value = f"v2.{role}.{value}.{fingerprint}"
            result.set_cookie(
                COOKIE,
                value + "." + signature(value, settings.api_token),
                max_age=lifetime,
                path="/api",
                secure=secure,
                httponly=True,
                samesite="strict",
            )
        return result

    @app.delete("/api/session")
    def sign_out(request: Request):
        if not trusted_origin(request, settings.cors_origins, settings.public_origin):
            raise HTTPException(403, "Sign out from the Kamino website")
        result = JSONResponse({"authenticated": False}, headers={"Cache-Control": "no-store"})
        result.delete_cookie(
            COOKIE,
            path="/api",
            secure=bool(settings.public_origin) or request.url.scheme == "https",
            httponly=True,
            samesite="strict",
        )
        return result
