"""Transient, explicitly supplied Meshy credentials. Never persisted in a job."""

import re

from fastapi import HTTPException, Request

from photo2sim.integrations.meshy import MeshyProvider
from photo2sim.integrations.reconstruction import ProviderError

HEADER = "X-Meshy-Key"


def user_provider(request: Request, template: MeshyProvider, *, require_credits=True):
    # Read manually so framework validation never echoes secret header inputs.
    keys = request.headers.getlist(HEADER)
    key = keys[0].strip() if len(keys) == 1 else ""
    if not re.fullmatch(r"msy_[A-Za-z0-9_-]{4,508}", key):
        raise HTTPException(422, "Enter your own Meshy API key before creating a mesh.")
    client = template.with_key(key)
    try:
        client.validate_access(require_credits=require_credits)
    except ProviderError as error:
        status = {"meshy_key_rejected": 422, "meshy_credits_exhausted": 402}.get(error.code, 503)
        raise HTTPException(status, error.message) from None
    return client
