# Dev Dockerfile for Expo/Metro. Optional service (docker compose --profile expo).
FROM node:20-slim

# ---- system deps ----
# git + openssh for private repos, watchman for Metro file watching.
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    openssh-client \
    watchman \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g yarn --force

WORKDIR /app

# Cache the yarn install layer.
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Copy the rest — shadowed by the bind mount in compose.
COPY . .

EXPOSE 8081 19000 19001 19002

# Bind to LAN so Metro is reachable from host + Expo Go on phone.
CMD ["yarn", "expo", "start", "--host", "lan", "--port", "8081"]
