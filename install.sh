#!/bin/bash

# Gemini-Cyber-CLI Installation Script
# This script automates the setup of the Gemini-Cyber-CLI project.

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}Starting Gemini-Cyber-CLI Installation...${NC}"

# ---------------------------------------------------------------------------
# 1. Check for Node.js
# ---------------------------------------------------------------------------
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed. Please install Node.js (>=20.0.0).${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2)
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d'.' -f1)
echo -e "${GREEN}Found Node.js v$NODE_VERSION${NC}"

if [ "$NODE_MAJOR" -lt 20 ]; then
    echo -e "${RED}Error: Node.js >= 20.0.0 is required (found v$NODE_VERSION).${NC}"
    exit 1
fi

# ---------------------------------------------------------------------------
# 2. Locate npm — try corepack first, fall back to npm directly
# ---------------------------------------------------------------------------
NPM_CMD=""

if command -v npm &> /dev/null; then
    NPM_CMD="npm"
    echo -e "${GREEN}Found npm: $(npm --version)${NC}"
elif command -v corepack &> /dev/null; then
    echo -e "${BLUE}npm not found directly, enabling via corepack...${NC}"
    mkdir -p .bin
    export PATH="$(pwd)/.bin:$PATH"
    corepack enable --install-directory .bin
    NPM_CMD="$(pwd)/.bin/npm"
else
    # Last resort — try to find npm relative to the node binary
    NODE_BIN_DIR="$(dirname "$(command -v node)")"
    if [ -f "$NODE_BIN_DIR/npm" ]; then
        NPM_CMD="$NODE_BIN_DIR/npm"
        echo -e "${YELLOW}Found npm at $NPM_CMD${NC}"
    elif [ -f "$NODE_BIN_DIR/npm.cmd" ]; then
        NPM_CMD="$NODE_BIN_DIR/npm.cmd"
        echo -e "${YELLOW}Found npm at $NPM_CMD${NC}"
    else
        echo -e "${RED}Error: npm could not be found. Please install npm or use a Node.js version that bundles it.${NC}"
        exit 1
    fi
fi

# ---------------------------------------------------------------------------
# 3. Install Node.js dependencies
# ---------------------------------------------------------------------------
echo -e "${BLUE}Installing Node.js dependencies...${NC}"
$NPM_CMD install

# ---------------------------------------------------------------------------
# 4. Bundle the project
# ---------------------------------------------------------------------------
echo -e "${BLUE}Bundling the project...${NC}"
$NPM_CMD run bundle

# ---------------------------------------------------------------------------
# 5. Install Python MCP dependency (system-wide, no HATS import needed)
# ---------------------------------------------------------------------------
echo -e "${BLUE}Installing Python MCP dependency (fastmcp)...${NC}"
EXTENSION_DIR="packages/cli/cyber-extension"

if command -v python3 &> /dev/null; then
    # Try pipx first (avoids PEP 668 externally-managed-environment error on Kali)
    if command -v pipx &> /dev/null; then
        pipx install fastmcp 2>/dev/null || true
    fi

    # Install into user site-packages (works on Kali without breaking system Python)
    if ! python3 -c "import fastmcp" 2>/dev/null; then
        python3 -m pip install --user --break-system-packages fastmcp 2>/dev/null || \
        python3 -m pip install --user fastmcp 2>/dev/null || \
        python3 -m pip install fastmcp 2>/dev/null || true
    fi

    if python3 -c "import fastmcp" 2>/dev/null; then
        echo -e "${GREEN}✅ fastmcp installed successfully.${NC}"
    else
        echo -e "${YELLOW}⚠ fastmcp not installed. Try manually: pip install --user fastmcp${NC}"
    fi
else
    echo -e "${YELLOW}Warning: python3 not found. MCP server will not start.${NC}"
fi

# ---------------------------------------------------------------------------
# 6. Link Extension to ~/.gemini
# ---------------------------------------------------------------------------
echo -e "${BLUE}Linking cyber-extension...${NC}"
mkdir -p ~/.gemini/extensions
EXTENSION_ABS="$(pwd)/$EXTENSION_DIR"
LINK_TARGET="$HOME/.gemini/extensions/gemini-cyber-builtin"

# Remove stale link/dir before creating new one
if [ -L "$LINK_TARGET" ] || [ -d "$LINK_TARGET" ]; then
    rm -rf "$LINK_TARGET"
fi
ln -s "$EXTENSION_ABS" "$LINK_TARGET"
echo -e "${GREEN}Extension linked: $LINK_TARGET → $EXTENSION_ABS${NC}"

# ---------------------------------------------------------------------------
# 7. Configure Cyber theme in settings.json
# ---------------------------------------------------------------------------
echo -e "${BLUE}Configuring Cyber theme...${NC}"
SETTINGS_FILE="$HOME/.gemini/settings.json"

if [ -f "$SETTINGS_FILE" ]; then
    # Update theme value if a theme key already exists
    if grep -q '"theme"' "$SETTINGS_FILE"; then
        sed -i 's/"theme": *"[^"]*"/"theme": "Cyber"/' "$SETTINGS_FILE"
    else
        # Inject theme into the root JSON object (before the last closing brace)
        sed -i 's/^}$/  "theme": "Cyber"\n}/' "$SETTINGS_FILE"
    fi
else
    mkdir -p "$(dirname "$SETTINGS_FILE")"
    cat > "$SETTINGS_FILE" <<EOF
{
  "theme": "Cyber"
}
EOF
fi
echo -e "${GREEN}Theme set to Cyber (hacker-green).${NC}"

# ---------------------------------------------------------------------------
# 8. Add gemini-cyber alias to shell profile
# ---------------------------------------------------------------------------
echo -e "${BLUE}Adding gemini-cyber alias to shell profile...${NC}"
SHELL_PROFILE=""
case "$SHELL" in
    */zsh)  SHELL_PROFILE="$HOME/.zshrc" ;;
    */bash) SHELL_PROFILE="$HOME/.bashrc" ;;
    *)      SHELL_PROFILE="$HOME/.profile" ;;
esac

BUNDLE_PATH="$(pwd)/bundle/gemini.js"
ALIAS_LINE="alias gemini-cyber='node $BUNDLE_PATH'"

if [ -f "$SHELL_PROFILE" ]; then
    if ! grep -q "alias gemini-cyber=" "$SHELL_PROFILE"; then
        printf "\n# Gemini-Cyber-CLI\n%s\n" "$ALIAS_LINE" >> "$SHELL_PROFILE"
        echo -e "${GREEN}Added alias to $SHELL_PROFILE${NC}"
    else
        sed -i "s|alias gemini-cyber=.*|$ALIAS_LINE|" "$SHELL_PROFILE"
        echo -e "${GREEN}Updated alias in $SHELL_PROFILE${NC}"
    fi
else
    printf "# Gemini-Cyber-CLI\n%s\n" "$ALIAS_LINE" > "$HOME/.gemini_alias"
    echo -e "${YELLOW}Warning: Could not find shell profile. Alias saved to ~/.gemini_alias${NC}"
    echo -e "${YELLOW}Run: source ~/.gemini_alias${NC}"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Gemini-Cyber-CLI Installation Complete ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "HATS MCP server starts automatically with the CLI."
echo ""
echo -e "Verify HATS tools connection:"
echo -e "  ${BLUE}gemini-cyber -p \"/mcp list\"${NC}"
echo ""
echo -e "Manually debug the MCP server:"
echo -e "  ${BLUE}$(pwd)/$EXTENSION_DIR/venv/bin/python3 $(pwd)/$EXTENSION_DIR/hats_mcp_server.py${NC}"
echo ""
echo -e "Restart your terminal or run:"
echo -e "  ${BLUE}source $SHELL_PROFILE${NC}"
echo ""
echo -e "Then launch with: ${GREEN}gemini-cyber${NC}"
