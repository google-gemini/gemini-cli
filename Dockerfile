FROM docker.io/library/node:22-slim

ARG SANDBOX_NAME="gemini-cli-sandbox"
ENV SANDBOX="$SANDBOX_NAME"

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
COPY packages/cli/dist/gemini-cli-cli-*.tgz /usr/local/share/npm-global/gemini-cli-cli.tgz
COPY packages/core/dist/gemini-cli-core-*.tgz /usr/local/share/npm-global/gemini-cli-core.tgz
RUN npm install -g /usr/local/share/npm-global/gemini-cli-cli.tgz /usr/local/share/npm-global/gemini-cli-core.tgz \
  && npm cache clean --force \
  && rm -f /usr/local/share/npm-global/gemini-cli-{cli,core}.tgz

# default entrypoint when none specified
ENTRYPOINT ["gemini"]
