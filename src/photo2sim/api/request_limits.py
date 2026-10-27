"""Bound streamed HTTP bodies before framework JSON or multipart parsing."""

from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse


class RequestLimits:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] not in {"POST", "PUT", "PATCH"}:
            return await self.app(scope, receive, send)
        path = scope["path"].rstrip("/")
        maximum = 2 * 1024**2
        if path == "/api/jobs":
            maximum = 41 * 1024**2
        elif path in {"/api/assembly-jobs", "/api/assembly-jobs/from-meshes"}:
            maximum = 66 * 1024**2
        elif path.endswith("/mapping-review"):
            maximum = 8 * 1024**2
        headers = dict(scope["headers"])
        try:
            length = int(headers.get(b"content-length", b"0"))
        except ValueError:
            length = maximum + 1
        if length < 0 or length > maximum:
            return await JSONResponse({"detail": "Request body limit exceeded"}, 413)(
                scope, receive, send
            )
        received = 0

        async def bounded_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > maximum:
                    raise HTTPException(413, "Request body limit exceeded")
            return message

        await self.app(scope, bounded_receive, send)
