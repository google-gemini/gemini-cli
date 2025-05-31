#!/bin/bash

# Create the bundle directory if it doesn't exist
mkdir -p bundle

# Copy specific shell files to the root of the bundle directory
cp "packages/core/src/tools/shell.md" "bundle/shell.md"
cp "packages/core/src/tools/shell.json" "bundle/shell.json"

# Find and copy all .sb files from packages to the root of the bundle directory
find packages -name '*.sb' -exec cp -f {} bundle/ \;

echo "Assets copied to bundle/"