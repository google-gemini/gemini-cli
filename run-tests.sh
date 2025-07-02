#!/bin/bash

# Run Jest tests with termux-toast notifications

# Ensure termux-api is installed
if ! pkg list-installed | grep -q "termux-api"; then
  echo "termux-api is not installed. Installing now..."
  pkg install termux-api -y
fi

# Run all Jest tests
npm test

if [ $? -eq 0 ]; then
  termux-toast "All Jest tests passed!"
  echo "All Jest tests passed!"
else
  termux-toast "Some Jest tests failed! Check terminal for details."
  echo "Some Jest tests failed!"
fi