# Copyright 2026 Google LLC
# SPDX-License-Identifier: Apache-2.0

# Standard Hub Dockerfile
FROM node:20-slim

WORKDIR /app

# In a monorepo, we typically don't have a local package-lock.json
# so we use npm install instead of npm ci for individual package builds.
COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 8080

# Use node directly for better signal handling (SIGTERM)
CMD ["node", "dist/index.js"]
