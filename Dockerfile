# --- Builder Stage ---
FROM docker.io/library/node:20-slim AS builder

ARG CLI_VERSION
ARG NPM_REGISTRY_SCOPE
ARG NPM_REGISTRY_URL
ARG CLI_PACKAGE_NAME

# Set up npm global package folder
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin

# Ensure the node user has permissions to write to the global npm directory
RUN mkdir -p /usr/local/share/npm-global && chown -R node:node /usr/local/share/npm-global

# Configure npm to use GitHub Packages
RUN --mount=type=secret,id=GITHUB_TOKEN \
    echo "${NPM_REGISTRY_SCOPE}:registry=${NPM_REGISTRY_URL}" > /home/node/.npmrc && \
    echo "//npm.pkg.github.com/:_authToken=$(cat /run/secrets/GITHUB_TOKEN)" >> /home/node/.npmrc && \
    chown -R node:node /home/node/.npmrc

# Switch to non-root user
USER node

# Install the Gemini CLI package
RUN npm install -g ${CLI_PACKAGE_NAME}@${CLI_VERSION} && \
    npm cache clean --force

# --- Final Stage ---
FROM docker.io/library/node:20-slim

ARG SANDBOX_NAME="gemini-cli-sandbox"
ENV SANDBOX="$SANDBOX_NAME"

# Install runtime dependencies
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

# Set up npm global package folder and user
RUN mkdir -p /usr/local/share/npm-global \
  && chown -R node:node /usr/local/share/npm-global
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin
USER node

# Copy installed package from the builder stage
COPY --from=builder /usr/local/share/npm-global /usr/local/share/npm-global

# Default entrypoint
CMD ["gemini"]
