#!/bin/bash

echo "📦 Creating shippable Accelos Mastra bundle..."

# Clean previous bundles
rm -rf ship/
mkdir -p ship/

# Build the Mastra bundle
echo "🔨 Building Mastra bundle..."
npx mastra build

if [ $? -ne 0 ]; then
  echo "❌ Mastra build failed"
  exit 1
fi

# Copy all necessary files from Mastra build
echo "📋 Copying Mastra build files..."
cp .mastra/output/index.mjs ship/
[ -f .mastra/output/mastra.mjs ] && cp .mastra/output/mastra.mjs ship/
cp .mastra/output/tools.mjs ship/
cp .mastra/output/instrumentation.mjs ship/
cp .mastra/output/telemetry-config.mjs ship/
cp .mastra/output/package.json ship/mastra-package.json

# Copy node_modules if they exist (may be needed)
if [ -d ".mastra/output/node_modules" ]; then
  echo "📦 Copying node_modules..."
  cp -r .mastra/output/node_modules ship/
fi

# Create environment template
echo "📝 Creating environment template..."
cat > ship/.env.example << 'EOF'
# Required: At least one API key must be set
GOOGLE_API_KEY=your_google_api_key_here
OPENAI_API_KEY=your_openai_api_key_here  
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Optional: Server configuration
PORT=4111
HOST=0.0.0.0
NODE_ENV=production
EOF

# Create startup script
echo "🚀 Creating startup script..."
cat > ship/start.sh << 'EOF'
#!/bin/bash

echo "🚀 Starting Accelos Server..."

# Check if .env exists
if [ ! -f .env ]; then
  echo "⚠️  No .env file found. Please copy .env.example to .env and set your API keys."
  echo "   cp .env.example .env"
  echo "   # Edit .env with your API keys"
  exit 1
fi

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

# Check if at least one API key is set
if [ -z "$GOOGLE_API_KEY" ] && [ -z "$OPENAI_API_KEY" ] && [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "❌ No API keys found in .env file. Please set at least one API key:"
  echo "   GOOGLE_API_KEY=your_key"
  echo "   OPENAI_API_KEY=your_key" 
  echo "   ANTHROPIC_API_KEY=your_key"
  exit 1
fi

echo "✅ Starting server with configured API keys..."
node index.mjs
EOF

chmod +x ship/start.sh

# Create README for shipping
echo "📖 Creating shipping README..."
cat > ship/README.md << 'EOF'
# 🚀 Accelos Mastra Server

A standalone AI agent server with playground UI and REST API.

## 🎯 Quick Start

1. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env and add your API keys
   ```

2. **Start the server:**
   ```bash
   ./start.sh
   # OR
   node accelos-server.mjs
   ```

3. **Access the services:**
   - Playground UI: http://localhost:4111/
   - REST API: http://localhost:4111/api
   - Swagger UI: http://localhost:4111/swagger-ui
   - OpenAPI Spec: http://localhost:4111/openapi.json

## 🔧 Environment Variables

Required (at least one):
- `GOOGLE_API_KEY` - Google Gemini API key
- `OPENAI_API_KEY` - OpenAI API key
- `ANTHROPIC_API_KEY` - Anthropic Claude API key

Optional:
- `PORT` - Server port (default: 4111)
- `HOST` - Server host (default: 0.0.0.0)
- `NODE_ENV` - Environment (default: production)

## 🤖 Available Agents

- **accelos-google**: Google Gemini 2.0 Flash
- **accelos-openai**: OpenAI GPT-4o
- **accelos-anthropic**: Anthropic Claude 3.5 Sonnet

## 🛠️ Available Tools

- **fileAnalyzer**: Analyze files for content, structure, security
- **webSearch**: Web search functionality
- **codeAnalysis**: Code quality and complexity analysis

## 📋 System Requirements

- Node.js 20+ 
- At least one API key from supported providers
- Network access on port 4111 (or configured port)

## 🚀 API Usage Examples

```bash
# List agents
curl http://localhost:4111/api/agents

# Chat with agent
curl -X POST http://localhost:4111/api/agents/accelos-google/generate \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Hello!"}]}'
```
EOF

echo "✅ Bundle created successfully!"
echo ""
echo "📁 Ship bundle contents:"
ls -la ship/
echo ""
echo "🎯 To test the bundle:"
echo "  cd ship/"
echo "  cp .env.example .env"
echo "  # Edit .env with your API keys"
echo "  ./start.sh"
echo ""
echo "📦 To ship: zip/tar the entire 'ship/' folder"
echo "  tar -czf accelos-mastra-server.tar.gz ship/"