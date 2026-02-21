# STAGE 1: Builder
FROM docker.io/library/node:20-slim AS builder

WORKDIR /app

# Copy source
COPY . .

# install git for npm scripts/generate-git-commit-info.js
RUN apt-get update && apt-get install -y --no-install-recommends git \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# 1. Install dependencies
RUN npm install

# 2. Build the project
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

# install minimal set of packages for using by agent, then clean up
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

# set up npm global package folder under /usr/local/share
# give it to non-root user node, already set up in base image
RUN mkdir -p /usr/local/share/npm-global \
  && chown -R node:node /usr/local/share/npm-global
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin

# switch to non-root user node
USER node

# Copy artifacts from Builder stage
COPY --from=builder /app/packages/cli/google-gemini-cli-*.tgz /tmp/gemini-cli.tgz
COPY --from=builder /app/packages/core/google-gemini-cli-core-*.tgz /tmp/gemini-core.tgz

# Install global packages
RUN npm install -g /tmp/gemini-cli.tgz /tmp/gemini-core.tgz \
  && npm cache clean --force \
  && rm -f /tmp/gemini-{cli,core}.tgz

# default entrypoint when none specified
CMD ["gemini"]
