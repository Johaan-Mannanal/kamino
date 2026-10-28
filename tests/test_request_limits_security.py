"""The body limit counts streamed bytes, not only a declared Content-Length."""

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from photo2sim.api.request_limits import RequestLimits


def test_body_limit_covers_chunked_json_and_preserves_small_requests():
    app = FastAPI()
    app.add_middleware(RequestLimits)

    @app.put("/api/assembly-jobs/fixture/revisions")
    async def receive(request: Request):
        return {"length": len(await request.body())}

    with TestClient(app) as client:
        path = "/api/assembly-jobs/fixture/revisions"
        assert client.put(path, content=b"{}").json() == {"length": 2}
        result = client.put(path, content=iter([b"x" * 1024**2] * 3))
        assert result.status_code == 413
        assert client.put(path, content=b"small").status_code == 200
