FROM docker.io/library/node:20-slim

# install minimal set of packages, then clean up
RUN apt-get update && apt-get install -y --no-install-recommends \
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

# install gemini-code and clean up
COPY packages/cli/dist/gemini-code-cli-*.tgz /usr/local/share/npm-global/gemini-code-cli.tgz
COPY packages/server/dist/gemini-code-server-*.tgz /usr/local/share/npm-global/gemini-code-server.tgz
RUN npm install -g /usr/local/share/npm-global/gemini-code-cli.tgz /usr/local/share/npm-global/gemini-code-server.tgz \
  && npm cache clean --force \
  && rm -f /usr/local/share/npm-global/gemini-code-{cli,server}.tgz
