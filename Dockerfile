FROM docker.io/library/node:20-slim AS base

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

FROM base AS builder

# switch to non-root user node for npm installs
USER node

# install build tooling needed by git-based dependencies
RUN npm install -g typescript

# pull in pre-built package tarballs
COPY packages/cli/dist/google-gemini-cli-*.tgz /tmp/gemini-cli.tgz
COPY packages/core/dist/google-gemini-cli-core-*.tgz /tmp/gemini-core.tgz

# install packages into a temporary prefix (non-global) so git dependencies can build correctly
RUN npm install --prefix /tmp/gemini-install /tmp/gemini-cli.tgz /tmp/gemini-core.tgz \
  && mkdir -p /tmp/gemini-install/lib \
  && mv /tmp/gemini-install/node_modules /tmp/gemini-install/lib/node_modules \
  && mkdir -p /tmp/gemini-install/bin \
  && if [ -d /tmp/gemini-install/lib/node_modules/.bin ]; then \
    for bin in /tmp/gemini-install/lib/node_modules/.bin/*; do \
      name=$(basename "$bin"); \
      ln -sf "../lib/node_modules/.bin/${name}" "/tmp/gemini-install/bin/${name}"; \
    done; \
  fi \
  && npm cache clean --force \
  && rm -f /tmp/gemini-{cli,core}.tgz

FROM base

# copy the pre-built global installation from the builder stage
COPY --from=builder /tmp/gemini-install/lib /usr/local/share/npm-global/lib
COPY --from=builder /tmp/gemini-install/bin /usr/local/share/npm-global/bin

# ensure node user owns the global npm prefix contents
RUN chown -R node:node /usr/local/share/npm-global

# switch to non-root user node
USER node

# default entrypoint when none specified
CMD ["gemini"]
