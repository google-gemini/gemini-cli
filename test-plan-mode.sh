#!/bin/bash

# Simple test to verify plan mode works
echo "Testing plan mode functionality..."

# Start the CLI in the background and pipe commands to it
echo "/plan" | timeout 10s npm start

echo "Test completed. Check the output above to see if plan mode was enabled."
