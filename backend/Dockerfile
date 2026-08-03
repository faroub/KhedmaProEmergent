# Dev Dockerfile — hot-reload friendly. Not optimised for prod.
FROM python:3.11-slim

# Basic runtime helpers + build tooling for a few native wheels.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache the pip layer as long as requirements.txt doesn't change.
COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copy source. In docker-compose.yml this gets shadowed by the bind mount
# so hot-reload works, but this baseline is here for standalone `docker run`.
COPY . .

EXPOSE 8001

# Compose overrides this with `uvicorn --reload`; here we default to prod-ish.
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]
