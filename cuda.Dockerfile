FROM nvidia/cuda:12.1.1-devel-ubuntu22.04
# Install basic dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20.x
# This is necessary because the base image does not include Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
RUN apt-get install -y nodejs

ARG SANDBOX_NAME="gemini-cli-sandbox"
ARG CLI_VERSION_ARG
ENV SANDBOX="$SANDBOX_NAME"
ENV CLI_VERSION=$CLI_VERSION_ARG

# install minimal set of packages, then clean up
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    iproute2 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Create the 'node' user and group
RUN groupadd -r node  && useradd -m -s /bin/bash -u 1000 -g node node

# Set up npm global package folder under /usr/local/share
# Give it to non-root user node
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

# Add NVIDIA runtime
ENV NVIDIA_VISIBLE_DEVICES all
