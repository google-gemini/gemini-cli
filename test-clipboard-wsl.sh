#!/bin/bash

echo "======================================"
echo "WSL Clipboard Image Test"
echo "======================================"
echo ""

# Check if we're in WSL
if grep -qi microsoft /proc/version; then
    echo "✅ Running in WSL"
else
    echo "❌ Not running in WSL"
    exit 1
fi

# Check if PowerShell is available
if command -v powershell.exe &> /dev/null; then
    echo "✅ PowerShell found: $(which powershell.exe)"
else
    echo "❌ PowerShell not found"
    exit 1
fi

# Check if clipboard has an image
echo ""
echo "Checking Windows clipboard..."
HAS_IMAGE=$(powershell.exe -NoProfile -NonInteractive -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::ContainsImage()" | tr -d '\r')

if [ "$HAS_IMAGE" = "True" ]; then
    echo "✅ Clipboard contains an image!"
    echo ""
    echo "Test successful! You can now use Ctrl+V in gemini-cli to paste images."
else
    echo "⚠️  No image in clipboard"
    echo ""
    echo "To test:"
    echo "1. On Windows, press Win+Shift+S"
    echo "2. Take a screenshot"
    echo "3. Run this script again"
    echo "4. Then try Ctrl+V in gemini-cli"
fi

echo ""
echo "======================================"
