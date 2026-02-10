# GCA Proxy

Interactive proxy for intercepting and editing GCA API responses before they
reach the CLI.

## Quick Start

```bash
# First time: install deps and build UI
npm run setup:gca-proxy

# Start proxy + CLI (auto-finds free port)
npm run start:gca-proxy
```

Open `https://localhost:<port>` in your browser (port is shown in terminal
output).

## Usage

1. Toggle endpoint checkboxes in the left panel to enable interception
2. Intercepted requests appear in the center panel
3. For streaming endpoints, chunks preview in real-time as they arrive
4. Once complete, edit the response in the right panel and click **Continue**

Unchecking an endpoint auto-releases any pending requests with original
responses.

## Manual Start

```bash
cd tools/gca-proxy
npm install
npm run build:client
npm start
```

## Environment Variables

| Variable                | Default                               |
| ----------------------- | ------------------------------------- |
| `PORT`                  | `3001`                                |
| `UPSTREAM_GCA_ENDPOINT` | `https://cloudcode-pa.googleapis.com` |
