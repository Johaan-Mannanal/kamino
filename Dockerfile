FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PHOTO2SIM_DATA_DIR=/data/jobs

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libegl1 libglib2.0-0 libglfw3 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 10001 --user-group --create-home app \
    && mkdir /data && chown app:app /data

WORKDIR /app
COPY pyproject.toml README.md LICENSE NOTICE ./
COPY requirements/production-py312.txt ./requirements/production-py312.txt
COPY src ./src
RUN python -m pip install --no-cache-dir --constraint requirements/production-py312.txt '.[simulation]'

USER app
EXPOSE 8000
HEALTHCHECK --interval=20s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)"
CMD ["python", "-m", "uvicorn", "photo2sim.api.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
