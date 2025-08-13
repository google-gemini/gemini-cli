# 📦 Accelos Mastra Server - Deployment Guide

## 🚀 Quick Start - Ship Bundle (Recommended)

### 1. Create Ship Bundle

```bash
# Build the complete ship bundle
./create-ship-bundle.sh
```

### 2. Generated Ship Bundle

After building, you'll have a complete `ship/` folder:

```
ship/
├── index.mjs              # Main Mastra server (517KB)
├── mastra.mjs            # Mastra framework (1.1MB)
├── tools.mjs             # Custom tools
├── instrumentation.mjs   # Telemetry setup
├── telemetry-config.mjs  # Telemetry config
├── node_modules/         # All dependencies
├── .env.example         # Environment template
├── start.sh            # Startup script
└── README.md           # Complete usage guide
```

## 🎯 Deployment Options

### Option 1: Ship Bundle (Recommended)

**Create and ship the bundle:**
```bash
# Create bundle
./create-ship-bundle.sh

# Package for shipping
tar -czf accelos-mastra-server.tar.gz ship/

# Ship to target server
scp accelos-mastra-server.tar.gz user@server:/opt/
```

**On target server:**
```bash
# Extract
tar -xzf accelos-mastra-server.tar.gz
cd ship/

# Setup environment
cp .env.example .env
# Edit .env with your API keys

# Run
./start.sh
```

### Option 2: Direct Copy

**Copy ship folder directly:**
```bash
# Copy entire ship directory
scp -r ship/ user@server:/opt/accelos/

# On target server
cd /opt/accelos
cp .env.example .env
# Edit .env with API keys
./start.sh
```

## 🔧 Environment Variables

Create a `.env` file or set environment variables:

```bash
# Required API keys (set at least one)
GOOGLE_API_KEY=your_google_api_key
OPENAI_API_KEY=your_openai_api_key  
ANTHROPIC_API_KEY=your_anthropic_api_key

# Optional server configuration
PORT=4111
HOST=0.0.0.0
NODE_ENV=production
```

## 🌐 Server Endpoints

Once running, the server exposes:

- **Playground UI**: http://localhost:4111/
- **REST API**: http://localhost:4111/api
- **Swagger UI**: http://localhost:4111/swagger-ui
- **OpenAPI Spec**: http://localhost:4111/openapi.json

## 🤖 Available Agents

- `accelos-google`: Google Gemini 2.0 Flash
- `accelos-openai`: OpenAI GPT-4o
- `accelos-anthropic`: Anthropic Claude 3.5 Sonnet

## 🛠️ Available Tools

- `fileAnalyzer`: Analyze files for content, structure, security
- `webSearch`: Web search functionality  
- `codeAnalysis`: Code quality and complexity analysis

## 📋 System Requirements

- **Node.js**: Version 20+ required
- **Memory**: ~150MB minimum (includes node_modules)
- **Disk**: ~50MB for complete bundle
- **Network**: Port 4111 (configurable via PORT env var)

## 🔄 Process Management

### With systemd (Linux)

Create `/etc/systemd/system/accelos.service`:

```ini
[Unit]
Description=Accelos Mastra Server
After=network.target

[Service]
Type=simple
User=accelos
WorkingDirectory=/opt/accelos/ship
ExecStart=/opt/accelos/ship/start.sh
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable accelos
sudo systemctl start accelos
sudo systemctl status accelos
```

### With PM2 (Node.js)

```bash
cd /opt/accelos/ship
npm install -g pm2
pm2 start index.mjs --name accelos
pm2 startup
pm2 save
```

## 🚀 Testing the Deployment

```bash
# Check server is running
curl http://localhost:4111/

# List agents via API
curl http://localhost:4111/api/agents

# Test agent interaction
curl -X POST http://localhost:4111/api/agents/accelos-google/generate \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Hello!"}]}'

# Access Swagger UI
open http://localhost:4111/swagger-ui
```

## 🎯 Ship Bundle Advantages

✅ **Complete bundle** - All dependencies included  
✅ **Easy deployment** - Single tar.gz file to ship  
✅ **Self-validating** - start.sh checks API keys  
✅ **Production ready** - Optimized Mastra build  
✅ **Full features** - Playground UI, API, Swagger, all tools  
✅ **No build required** - Pre-built and ready to run