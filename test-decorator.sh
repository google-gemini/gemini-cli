#!/bin/bash

# Test indicators.py with termux-toast notifications

# Ensure termux-api is installed
if ! pkg list-installed | grep -q "termux-api"; then
  echo "termux-api is not installed. Installing now..."
  pkg install termux-api -y
fi

# Run the indicators.py test
npm test packages/core/tests/indicators.test.ts

if [ $? -eq 0 ]; then
  termux-toast "indicators.py tests passed!"
  echo "indicators.py tests passed!"
else
  termux-toast "indicators.py tests failed!"
  echo "indicators.py tests failed!"
fi