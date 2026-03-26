# --- STAGE 1: Base Runtime ---
FROM docker.io/library/node:20-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 \
  python3-pip \
  python3-venv \
  curl \
  dnsutils \
  less \
  jq \
  ca-certificates \
  git \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# --- STAGE 2: Builder (Compile Main) ---
FROM base AS builder
WORKDIR /build
COPY . .
RUN npm ci --ignore-scripts
RUN npm run bundle
# Run the official release preparation script to move the bundle and assets into packages/cli
RUN node scripts/prepare-npm-release.js

# --- STAGE 3: Development Environment ---
FROM base AS development

WORKDIR /home/node/dev/main

# Set up npm global package folder
RUN mkdir -p /usr/local/share/npm-global \
  && chown -R node:node /usr/local/share/npm-global
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin

# Copy package.json to extract versions for global tools
COPY package.json /tmp/package.json

# Install Build Tools, Global Dev Tools (pinned), and Linters
ARG ACTIONLINT_VER=1.7.7
ARG SHELLCHECK_VER=0.11.0
ARG YAMLLINT_VER=1.35.1

RUN apt-get update && apt-get install -y --no-install-recommends \
  make \
  g++ \
  gh \
  git \
  unzip \
  rsync \
  ripgrep \
  procps \
  psmisc \
  lsof \
  socat \
  tmux \
  docker.io \
  build-essential \
  libsecret-1-dev \
  libkrb5-dev \
  file \
  && curl -sSLo /tmp/actionlint.tar.gz https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VER}/actionlint_${ACTIONLINT_VER}_linux_amd64.tar.gz \
  && tar -xzf /tmp/actionlint.tar.gz -C /usr/local/bin actionlint \
  && curl -sSLo /tmp/shellcheck.tar.xz https://github.com/koalaman/shellcheck/releases/download/v${SHELLCHECK_VER}/shellcheck-v${SHELLCHECK_VER}.linux.x86_64.tar.xz \
  && tar -xf /tmp/shellcheck.tar.xz -C /usr/local/bin --strip-components=1 shellcheck-v${SHELLCHECK_VER}/shellcheck \
  && pip3 install --break-system-packages yamllint==${YAMLLINT_VER} \
  && export TSX_VER=$(node -p "require('/tmp/package.json').devDependencies.tsx") \
  && export VITEST_VER=$(node -p "require('/tmp/package.json').devDependencies.vitest") \
  && export PRETTIER_VER=$(node -p "require('/tmp/package.json').devDependencies.prettier") \
  && export ESLINT_VER=$(node -p "require('/tmp/package.json').devDependencies.eslint") \
  && export CROSS_ENV_VER=$(node -p "require('/tmp/package.json').devDependencies['cross-env']") \
  && npm install -g tsx@$TSX_VER vitest@$VITEST_VER prettier@$PRETTIER_VER eslint@$ESLINT_VER cross-env@$CROSS_ENV_VER typescript@5.3.3 \
  && npm install -g @google/gemini-cli@nightly && mv /usr/local/share/npm-global/bin/gemini /usr/local/share/npm-global/bin/g-nightly \
  && npm install -g @google/gemini-cli@preview && mv /usr/local/share/npm-global/bin/gemini /usr/local/share/npm-global/bin/g-preview \
  && npm install -g @google/gemini-cli@latest  && mv /usr/local/share/npm-global/bin/gemini /usr/local/share/npm-global/bin/g-stable \
  && apt-get purge -y build-essential libsecret-1-dev libkrb5-dev \
  && apt-get autoremove -y \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* /tmp/* /root/.npm

# Copy the bundled CLI package to a permanent location and install it
# We MUST not delete this source folder as 'npm install -g <folder>' 
# often symlinks to it for local folder installs.
COPY --from=builder /build/packages/cli /usr/local/lib/gemini-cli
RUN npm install -g /usr/local/lib/gemini-cli

USER node
CMD ["/bin/bash"]
