# Stage 1: Build gemini-cli monorepo
FROM node:20 AS builder
WORKDIR /build
# Copy only what the build needs — avoids sending the full repo as context
COPY package.json package-lock.json tsconfig.json ./
COPY packages/ packages/
COPY scripts/ scripts/
# --ignore-scripts skips the "prepare" hook (husky + bundle) which
# fails without a full git repo and esbuild.config.js.
# We then run generate (gracefully handles missing git) and build each workspace.
RUN npm ci --ignore-scripts \
    && npm run generate \
    && npm run build --workspaces
RUN cd packages/core && npm pack && mv *.tgz /tmp/gemini-core.tgz \
    && cd ../cli && npm pack && mv *.tgz /tmp/gemini-cli.tgz \
    && cd ../a2a-server && npm pack && mv *.tgz /tmp/gemini-a2a-server.tgz

# Stage 2: Build captain-hook (Rust binary)
FROM rust:slim AS captain-hook-builder
RUN apt-get update && apt-get install -y --no-install-recommends git pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
# Remove Rust docs to save ~500MB disk during build
RUN rm -rf /usr/local/rustup/toolchains/*/share/doc
RUN git clone --depth 1 https://github.com/epiphytic/captain-hook.git /build
WORKDIR /build
RUN cargo build --release && rm -rf target/release/deps target/release/build target/release/.fingerprint

# Stage 3: Build ai-plugin-translator
FROM node:20 AS translator-builder
RUN npm install -g pnpm
RUN git clone https://github.com/epiphytic/ai-plugin-translator.git /build
WORKDIR /build
RUN pnpm install && pnpm build

# Stage 4: Final runtime image
FROM gcr.io/cloudshell-images/cloudshell:latest

# Ensure Node.js 20+ is available
# Cloud Shell may ship an older version; install from NodeSource if needed
RUN if [ "$(node -v 2>/dev/null | cut -d. -f1 | tr -d v)" -lt 20 ] 2>/dev/null || ! command -v node >/dev/null 2>&1; then \
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
      apt-get install -y nodejs; \
    fi && \
    node -v && npm -v

# Install gh CLI if not already present
RUN if ! command -v gh >/dev/null 2>&1; then \
      curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
        | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
        | tee /etc/apt/sources.list.d/github-cli.list > /dev/null && \
      apt-get update && apt-get install -y gh && \
      rm -rf /var/lib/apt/lists/*; \
    fi

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
    rm -f /tmp/gemini-*.tgz

# Install extensions
RUN mkdir -p /root/.gemini/extensions

# ai-plugin-translator extension
COPY --from=translator-builder /build /root/.gemini/extensions/ai-plugin-translator

# captain-hook extension
COPY --from=captain-hook-builder /build/target/release/captain-hook /root/.gemini/extensions/captain-hook/captain-hook
COPY --from=captain-hook-builder /build/.claude-plugin /root/.gemini/extensions/captain-hook/.claude-plugin

# Copy settings and entrypoint
COPY deploy/cloudrun/settings.json /root/.gemini/settings.json
COPY deploy/cloudrun/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

WORKDIR /workspace
EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
