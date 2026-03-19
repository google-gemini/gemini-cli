# Copyright 2026 Google LLC
# SPDX-License-Identifier: Apache-2.0

# Stage 1: Build shpool
FROM rust:1.81-slim-bookworm AS builder

RUN apt-get update && apt-get install -y build-essential curl && rm -rf /var/lib/apt/lists/*
RUN cargo install shpool

# Stage 2: Final Image
FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    rsync \
    vim \
    tmux \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install gh -y

# Copy shpool from builder
COPY --from=builder /usr/local/cargo/bin/shpool /usr/local/bin/shpool

# Install global dev tools
RUN npm install -g tsx eslint vitest typescript prettier @google/gemini-cli@nightly

# Create workspace directory
WORKDIR /home/node/workspace
RUN chown -R node:node /home/node/workspace

# Entrypoint script
COPY --chown=node:node entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER node

# Environment variables
ENV GEMINI_CLI_WORKSPACE=1
ENV PATH=$PATH:/usr/local/bin

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["/bin/bash"]
