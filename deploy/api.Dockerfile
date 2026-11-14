# syntax=docker/dockerfile:1.7
FROM python:3.13-slim-trixie

COPY --from=ghcr.io/astral-sh/uv:0.12.22 /uv /bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY apps/api/pyproject.toml apps/api/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev --no-install-project

COPY apps/api/src ./src
COPY apps/api/data ./data
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev

RUN useradd --system --uid 10001 app && mkdir -p /var/lib/app && chown app /var/lib/app
USER app

ENV PATH="/app/.venv/bin:$PATH" \
    API_ENVIRONMENT=production \
    API_DATA_DIR=/app/data \
    API_DB_PATH=/var/lib/app/app.sqlite3 \
    FORWARDED_ALLOW_IPS="*"

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=5 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)"]
CMD ["fastapi", "run", "src/api/main.py", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
