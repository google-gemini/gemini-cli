#!/bin/bash

# This script creates an alias for the Gemini CLI

# Determine the project directory
PROJECT_DIR=$(cd "$(dirname "$0")/.." && pwd)
ALIAS_COMMAND="alias gemini='node $PROJECT_DIR/scripts/start.js'"

# Detect shell and set config file path
if [[ "$SHELL" == *"/bash" ]]; then
    CONFIG_FILE="$HOME/.bashrc"
elif [[ "$SHELL" == *"/zsh" ]]; then
    CONFIG_FILE="$HOME/.zshrc"
else
    echo "Unsupported shell. Only bash and zsh are supported."
    exit 1
fi

echo "This script will add the following alias to your shell configuration file ($CONFIG_FILE):"
echo "  $ALIAS_COMMAND"
echo ""

# Check if the alias already exists and remove it
if grep -q "alias gemini=" "$CONFIG_FILE"; then
    sed -i '/^alias gemini=/d' "$CONFIG_FILE"
    echo "Removed existing 'gemini' alias."
fi

echo "$ALIAS_COMMAND" >> "$CONFIG_FILE"
echo ""
echo "Alias updated in $CONFIG_FILE."
echo "Please run 'source $CONFIG_FILE' or open a new terminal to use the 'gemini' command."
