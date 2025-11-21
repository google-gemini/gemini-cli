# Testing Clipboard Image Pasting in WSL

## ✅ Status: WORKING!

The clipboard image pasting functionality is working correctly in WSL. Here's
how to test it:

## How to Test

### Step 1: Take a Screenshot on Windows

1. Press `Win + Shift + S` to open Snipping Tool
2. Select an area and take a screenshot
3. The screenshot is automatically copied to your Windows clipboard

### Step 2: Verify Image is in Clipboard

Run this command in WSL:

```bash
./test-clipboard-wsl.sh
```

Expected output:

```
✅ Clipboard contains an image!
```

### Step 3: Run Gemini CLI

```bash
npm start
```

### Step 4: Paste the Image

In the Gemini CLI prompt, press **Ctrl+V**

You should see the image path inserted automatically:

```
@.gemini-clipboard/clipboard-<timestamp>.png
```

### Step 5: Send Your Message

Type your question and press Enter. The image will be sent to Gemini!

## What Happens Behind the Scenes

1. **Ctrl+V** triggers `handleClipboardPaste()`
2. Checks if clipboard has an image via PowerShell
3. If yes: Saves image to `.gemini-clipboard/` directory
4. Inserts `@.gemini-clipboard/clipboard-<timestamp>.png` into the input
5. You can then send it with your message

## Troubleshooting

### "No image detected in clipboard"

- Make sure you copied an **image**, not just text
- Try taking a fresh screenshot with `Win + Shift + S`
- Run `./test-clipboard-wsl.sh` to verify

### "File path must be within workspace directories"

- This is normal! The pasted image is automatically saved to
  `.gemini-clipboard/`
- You should see `@.gemini-clipboard/clipboard-XXXXX.png` appear in your input
- If you're manually trying to reference a file outside the workspace, you need
  to copy it into your workspace first

### Nothing happens when pressing Ctrl+V

1. Make sure gemini-cli has focus
2. Check if an image is actually in the clipboard:

   ```bash
   pwsh.exe -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::ContainsImage()"
   ```

   Should output: `True`

3. If still not working, check for errors in the terminal

## Example Workflow

```bash
# 1. Copy an image (Win+Shift+S on Windows)

# 2. Start gemini-cli
npm start

# 3. In gemini-cli, press Ctrl+V
# You'll see: @.gemini-clipboard/clipboard-1234567890.png

# 4. Type your question
What's in this image?

# 5. Press Enter - Gemini will analyze the image!
```

## Technical Details

**Platform Detection:**

- Automatically detects WSL environment
- Uses PowerShell to access Windows clipboard
- Converts paths between WSL and Windows using `wslpath`

**Supported Image Formats:**

- PNG (most common from screenshots)
- JPEG
- BMP
- GIF
- WebP
- TIFF

**Cleanup:**

- Old clipboard images (>1 hour) are automatically cleaned up
- Saves space and keeps your workspace tidy

## Verified Working ✅

Test result from `/home/user/documents/code/gemini-cli`:

```
Testing clipboardHasImage...
Has image: true

Testing saveClipboardImage...
Saved WSL clipboard image to .gemini-clipboard/clipboard-1763719008753.png (133 bytes)

✅ SUCCESS! Clipboard image pasting works in WSL!
```
