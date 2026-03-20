#!/bin/bash
# Script to run development version of Gemini CLI from any directory
PROJECT_ROOT="/home/dpavlin/gemini-cli"
node "$PROJECT_ROOT/packages/cli/dist/index.js" "$@"
