# --- Security ---
# 1. Do not store secrets in the Dockerfile.
# 2. Do not use a root user.
# 3. Do not use a privileged user.
# 4. Do not use a user with a password.
# 5. Do not use a user with a shell.
# 6. Do not use a user with a home directory.
# 7. Do not use a user with a UID of 0.
# 8. Do not use a user with a GID of 0.
# 9. Do not use a user with a supplementary group.
# 10. Do not use a user with a login shell.

# --- Best Practices ---
# 1. Use official base images.
# 2. Use a non-root user.
# 3. Use a .dockerignore file.
# 4. Use multi-stage builds.
# 5. Use a specific version of the base image.
# 6. Use a specific version of the packages.
# 7. Use a specific version of the dependencies.
# 8. Use a specific version of the plugins.
# 9. Use a specific version of the loaders.
# 10. Use a specific version of the tools.

FROM docker.io/library/node:20-slim

ARG SANDBOX_NAME="gemini-cli-sandbox"
ARG CLI_VERSION_ARG
ENV SANDBOX="$SANDBOX_NAME"
ENV CLI_VERSION=$CLI_VERSION_ARG

# install minimal set of packages, then clean up
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

# install gemini-cli and clean up
COPY packages/cli/dist/google-gemini-cli-*.tgz /usr/local/share/npm-global/gemini-cli.tgz
COPY packages/core/dist/google-gemini-cli-core-*.tgz /usr/local/share/npm-global/gemini-core.tgz
RUN npm install -g /usr/local/share/npm-global/gemini-cli.tgz /usr/local/share/npm-global/gemini-core.tgz \
  && npm cache clean --force \
  && rm -f /usr/local/share/npm-global/gemini-{cli,core}.tgz

# default entrypoint when none specified
CMD ["gemini"]
