"""Expiring browser access; the shared application credential never enters a cookie."""

import hashlib
import hmac
import secrets
import time

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

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


def trusted_origin(request: Request, origins: tuple[str, ...], public_origin: str = "") -> bool:
    origin = request.headers.get("origin", "")
    return origin in {public_origin or str(request.base_url).rstrip("/"), *origins}


def register_session_routes(app, settings):
    @app.get("/api/session")
    def status(request: Request):
        return JSONResponse(
            {
                "required": bool(settings.api_token),
                "authenticated": authorized(request, settings.api_token),
            },
            headers={"Cache-Control": "no-store"},
        )

    @app.post("/api/session")
    def sign_in(request: Request):
        if request.headers.get("origin") and not trusted_origin(
            request, settings.cors_origins, settings.public_origin
        ):
            raise HTTPException(403, "Sign in from the Kamino website")
        if settings.api_token and not bearer_access(request, settings.api_token):
            raise HTTPException(401, "That team access code was not accepted")
        secure = bool(settings.public_origin) or request.url.scheme == "https"
        if not secure and request.url.hostname not in {"localhost", "127.0.0.1", "::1"}:
            raise HTTPException(400, "Sign in over HTTPS")
        result = JSONResponse({"authenticated": True}, headers={"Cache-Control": "no-store"})
        if settings.api_token:
            value = f"{int(time.time()) + LIFETIME}.{secrets.token_hex(16)}"
            result.set_cookie(
                COOKIE,
                value + "." + signature(value, settings.api_token),
                max_age=LIFETIME,
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
