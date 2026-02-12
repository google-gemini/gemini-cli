# Stage 1: Build gemini-cli monorepo
FROM node:22-bookworm AS builder
WORKDIR /build
COPY package.json package-lock.json tsconfig.json esbuild.config.js ./
COPY packages/ packages/
COPY scripts/ scripts/
# --ignore-scripts skips the "prepare" hook (husky + bundle) which
# fails without a full git repo and esbuild.config.js.
RUN npm ci --ignore-scripts \
    && npm run generate \
    && npm run build --workspaces \
    && node esbuild.config.js
RUN cd packages/core && npm pack && mv *.tgz /tmp/gemini-core.tgz \
    && cd ../cli && npm pack && mv *.tgz /tmp/gemini-cli.tgz \
    && cd ../a2a-server && npm pack && mv *.tgz /tmp/gemini-a2a-server.tgz

# TODO: hookwise (Rust binary, formerly captain-hook) is temporarily disabled.
# The ort_sys crate (ONNX Runtime) fails to link on both amd64 and arm64 with
# rust:slim-bookworm due to glibc/C++ ABI incompatibilities. Re-enable once
# upstream fixes the build or we find a compatible Rust base image.
# See: https://github.com/badal-io/gemini-cli/pull/2

# Stage 2: Build ai-plugin-translator (was Stage 3)
FROM node:22-bookworm-slim AS translator-builder
RUN npm install -g pnpm
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN git clone https://github.com/epiphytic/ai-plugin-translator.git /build
WORKDIR /build
RUN pnpm install && pnpm build

# Stage 3: Final runtime image (multi-arch: amd64 + arm64)
FROM node:22-bookworm

# Install base runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
      git \
      curl \
      socat \
      ca-certificates \
      gnupg \
      lsb-release \
      unzip \
      python3 \
      python3-pip \
      python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN ARCH="$(dpkg --print-architecture)" && \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=${ARCH} signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list && \
    apt-get update && apt-get install -y --no-install-recommends gh && \
    rm -rf /var/lib/apt/lists/*

# Install Google Cloud SDK (all components)
RUN curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
      | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
      > /etc/apt/sources.list.d/google-cloud-sdk.list && \
    apt-get update && apt-get install -y --no-install-recommends \
      google-cloud-cli \
      google-cloud-cli-gke-gcloud-auth-plugin \
      google-cloud-cli-cloud-run-proxy \
    && rm -rf /var/lib/apt/lists/*

# Install Terraform CLI (latest)
RUN ARCH="$(dpkg --print-architecture)" && \
    curl -fsSL https://apt.releases.hashicorp.com/gpg \
      | gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg && \
    echo "deb [arch=${ARCH} signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" \
      > /etc/apt/sources.list.d/hashicorp.list && \
    apt-get update && apt-get install -y --no-install-recommends terraform vault && \
    rm -rf /var/lib/apt/lists/*

# Install bun
RUN curl -fsSL https://bun.sh/install | bash && \
    ln -s /root/.bun/bin/bun /usr/local/bin/bun && \
    ln -s /root/.bun/bin/bunx /usr/local/bin/bunx

# Set up npm global prefix
RUN mkdir -p /usr/local/share/npm-global
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin

# Install gemini-cli packages globally
COPY --from=builder /tmp/gemini-core.tgz /tmp/gemini-core.tgz
COPY --from=builder /tmp/gemini-cli.tgz /tmp/gemini-cli.tgz
COPY --from=builder /tmp/gemini-a2a-server.tgz /tmp/gemini-a2a-server.tgz
RUN npm install -g /tmp/gemini-core.tgz /tmp/gemini-cli.tgz /tmp/gemini-a2a-server.tgz && \
    npm cache clean --force && \
    rm -f /tmp/gemini-*.tgz && \
    ln -sf ../lib/node_modules/@google/gemini-cli-a2a-server/dist/a2a-server.mjs \
      /usr/local/share/npm-global/bin/gemini-cli-a2a-server

# Install beads (git-backed issue tracker) — https://github.com/steveyegge/beads
RUN npm install -g @beads/bd || true

# Install extensions
RUN mkdir -p /root/.gemini/extensions

# ai-plugin-translator extension
COPY --from=translator-builder /build /root/.gemini/extensions/ai-plugin-translator

# TODO: hookwise extension disabled (see comment at top of file)
# COPY --from=hookwise-builder /build/target/release/hookwise /root/.gemini/extensions/captain-hook/captain-hook
# COPY --from=hookwise-builder /build/.claude-plugin /root/.gemini/extensions/captain-hook/.claude-plugin

# Copy settings and entrypoint
COPY deploy/cloudrun/settings.json /root/.gemini/settings.json
COPY deploy/cloudrun/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

WORKDIR /workspace
EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
