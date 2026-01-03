# STAGE 1: Builder
FROM node:20 AS builder

WORKDIR /app

# Copy source
COPY . .

# 1. Install dependencies
RUN npm install

# 2. Build the project
# FIXED: Changed from 'npm run compile' to 'npm run build'
RUN npm run build

# 3. Create the Tarballs (.tgz)
WORKDIR /app/packages/core
RUN npm pack

WORKDIR /app/packages/cli
RUN npm pack

# STAGE 2: Runtime
FROM node:20-slim

ARG SANDBOX_NAME="gemini-cli-sandbox"
ARG CLI_VERSION_ARG

ENV SANDBOX="$SANDBOX_NAME"
ENV CLI_VERSION=$CLI_VERSION_ARG

# Install dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 \
  make \
  g++ \
  man-db \
  curl \
  dnsutils \
  less \
  jq \
  bc \
  gh \
  git \
  unzip \
  rsync \
  ripgrep \
  procps \
  psmisc \
  lsof \
  socat \
  ca-certificates \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# Setup NPM Global
RUN mkdir -p /usr/local/share/npm-global \
  && chown -R node:node /usr/local/share/npm-global
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin

USER node

# Copy artifacts from Builder stage
COPY --from=builder /app/packages/cli/google-gemini-cli-*.tgz /tmp/gemini-cli.tgz
COPY --from=builder /app/packages/core/google-gemini-cli-core-*.tgz /tmp/gemini-core.tgz

# Install global packages
RUN npm install -g /tmp/gemini-cli.tgz /tmp/gemini-core.tgz \
  && npm cache clean --force \
  && rm -f /tmp/gemini-{cli,core}.tgz

CMD ["gemini"]
