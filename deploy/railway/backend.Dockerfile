FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PHOTO2SIM_DATA_DIR=/data/jobs
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libegl1 libglib2.0-0 libglfw3 gosu \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 10001 --user-group --create-home app
WORKDIR /app
COPY pyproject.toml README.md LICENSE NOTICE ./
COPY requirements/production-py312.txt ./requirements/production-py312.txt
COPY src ./src
RUN python -m pip install --no-cache-dir --constraint requirements/production-py312.txt '.[simulation]'
COPY deploy/railway/start-backend.sh /usr/local/bin/start-backend
RUN chmod 755 /usr/local/bin/start-backend
EXPOSE 8000
ENTRYPOINT ["/usr/local/bin/start-backend"]
