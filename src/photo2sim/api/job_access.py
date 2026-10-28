"""Stable signed browser ownership, independent of expiring access-tier sessions."""

import re
import secrets
import time

from fastapi import HTTPException

from photo2sim.api.browser_session import signature

OWNER_COOKIE = "kamino_owner"
OWNER_LIFETIME = 30 * 86400


def owner_principal(request, settings):
    if not settings.api_token:
        return None
    raw = request.cookies.get(OWNER_COOKIE, "")
    if len(raw) > 180:
        return None
    try:
        expires, principal, signed = raw.split(".")
        value = f"{expires}.{principal}"
        if (
            0 < int(expires) - time.time() <= OWNER_LIFETIME
            and re.fullmatch(r"[0-9a-f]{32}", principal)
            and secrets.compare_digest(signed, signature("owner:" + value, settings.api_token))
        ):
            return principal
    except (ValueError, TypeError):
        pass
    return None


def set_owner_cookie(response, principal, request, settings):
    value = f"{int(time.time()) + OWNER_LIFETIME}.{principal}"
    response.set_cookie(
        OWNER_COOKIE,
        value + "." + signature("owner:" + value, settings.api_token),
        max_age=OWNER_LIFETIME,
        path="/api",
        secure=bool(settings.public_origin) or request.url.scheme == "https",
        httponly=True,
        samesite="strict",
    )


def ensure_owner_cookie(response, request, settings):
    if settings.api_token and owner_principal(request, settings) is None:
        set_owner_cookie(response, secrets.token_hex(16), request, settings)


def request_owner(request):
    return getattr(request.state, "owner_principal_id", None)


async def require_legacy_claim(request):
    try:
        body = await request.json()
    except ValueError:
        body = None
    if (
        not isinstance(body, dict)
        or set(body) != {"acknowledge_legacy_claim"}
        or body["acknowledge_legacy_claim"] is not True
    ):
        raise HTTPException(422, "Explicit legacy recovery acknowledgement required")
