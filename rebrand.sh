#!/bin/bash
# Comprehensive rebrand script from Gemini CLI to LLM CLI

echo "🔄 Starting comprehensive rebrand to LLM-CLI..."

# 1. Update package names in all package.json files
echo "📦 Updating package names..."
find packages -name "package.json" -exec sed -i 's/@google\/gemini-cli/@llmcli/g' {} \;
find packages -name "package.json" -exec sed -i 's/"gemini-cli"/"llm-cli"/g' {} \;
find packages -name "package.json" -exec sed -i 's/Gemini CLI/LLM CLI/g' {} \;
find packages -name "package.json" -exec sed -i 's/google-gemini\/gemini-cli/Root1856\/LLM-cli/g' {} \;

# 2. Update import statements in TypeScript files
echo "🔧 Updating import statements..."
find packages -name "*.ts" -o -name "*.tsx" | xargs sed -i "s/@google\/gemini-cli/@llmcli/g"

# 3. Rename bundle output
echo "📝 Creating bundle rename note..."
echo "Note: bundle/gemini.js will be renamed to bundle/llm.js during build" > bundle-rename.txt

# 4. Update environment variable references (keep old ones for backward compatibility)
echo "🌍 Documenting environment variable updates..."
cat > ENV_MIGRATION.md << 'EOF'
# Environment Variable Migration Guide

## New Variables (Recommended)
- `LLM_API_KEY` - For cloud LLM providers
- `LOCAL_LLM_BASE_URL` - For local LLM endpoints
- `LOCAL_LLM_MODEL` - Model name for local LLM
- `LOCAL_LLM_API_KEY` - Optional API key for local LLM
- `LLM_SANDBOX` - Sandbox mode (docker/podman/false)

## Legacy Variables (Still Supported)
- `GEMINI_API_KEY` - Maps to LLM_API_KEY
- `GEMINI_SANDBOX` - Maps to LLM_SANDBOX

All old GEMINI_* variables will continue to work for backward compatibility.
EOF

echo "✅ Rebrand script completed!"
echo "📋 Next steps:"
echo "  1. Review changes with: git diff"
echo "  2. Update README.md manually"
echo "  3. Test build with: npm run build"
echo "  4. Commit changes"
