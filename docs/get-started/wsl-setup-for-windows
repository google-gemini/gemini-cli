# Setting up Gemini CLI Development on Windows using WSL

Gemini CLI development depends on several Linux-native features that are not
fully supported in a native Windows environment. Using WSL (Windows Subsystem
for Linux) ensures a stable and predictable development experience.

## Why WSL is Required

Gemini CLI development depends on:

- **Native Node.js modules (node-gyp):** Many core dependencies require
  compilation that is standard on Linux.
- **Filesystem sandboxing:** The security model of Gemini CLI leverages
  Linux-specific features for isolation.
- **Linux-style path resolution:** Workspace management and internal linking
  rely on Linux path standards.
- **Workspace linking across packages:** The monorepo structure is optimized for
  Linux/macOS linking.

Running the development build directly on Windows (`process.platform = win32`)
may cause:

- Agent crashes
- Context loader failures
- Sandbox issues
- Native dependency build errors
- CLI freezing during initialization

---

## ✅ Recommended Setup (Primary Method)

### 1️⃣ Install WSL

Open PowerShell as Administrator and run:

```powershell
wsl --install
```

Restart your system when prompted. If WSL is already installed, verify its
status:

```powershell
wsl --status
```

### 2️⃣ Install Ubuntu

If not automatically installed, you can install Ubuntu via:

```powershell
wsl --install -d Ubuntu
```

Launch Ubuntu from the Start Menu. You should see a prompt like:
`username@DESKTOP:~$`

### 3️⃣ Install Node.js (Required Version)

Gemini CLI requires **Node.js ~20.19.0** for development. We recommend
installing via `nvm` inside Ubuntu:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20.19.0
nvm use 20.19.0
```

Verify the installation:

```bash
node -v
```

### 4️⃣ Clone the Repository (Inside WSL)

⚠️ **Important:** Clone inside the Linux home directory (`~`), NOT inside
`/mnt/c/Users/...`. Using the Windows filesystem from WSL causes permission and
performance issues.

```bash
cd ~
git clone https://github.com/google-gemini/gemini-cli.git
cd gemini-cli
```

### 5️⃣ Install Dependencies

```bash
npm install
```

### 6️⃣ Build the Entire Monorepo

This builds all internal packages required for the CLI, Agent Manager, DevTools,
and SDK.

```bash
npm run build
```

### 7️⃣ Open the Project in Your IDE (Correctly)

⚠️ This is where most Windows users make mistakes. You must ensure your IDE is
running in the WSL context.

#### ✅ VS Code / Windsurf

From the Ubuntu terminal inside your project folder:

```bash
code .
```

(VS Code will automatically detect it's in WSL and prompt to install the WSL
extension if missing). Or explicitly:

```bash
code . --remote wsl+Ubuntu
```

#### ✅ Cursor

Cursor does NOT support the `--remote` flag from the terminal. Instead:

1.  Open Cursor.
2.  Press `Ctrl + Shift + P`.
3.  Select **WSL: Connect to WSL**.
4.  Choose **Ubuntu**.
5.  Open the folder: `/home/<username>/gemini-cli`.

### 8️⃣ Verify Runtime

Open an integrated terminal in your IDE and run:

```bash
node -p process.platform
```

**Expected output:** `linux`

If you see `win32`, you have opened the project incorrectly (it is running in
the Windows runtime rather than WSL).

### 9️⃣ Start Development CLI

```bash
npm start
```

---

## 🧩 Common Problems and Troubleshooting

### Problem 1: `process.platform = win32`
- **Cause:** IDE opened the Windows runtime instead of the WSL remote session.
- **Fix:** Reopen the project using the WSL remote connection as described in
  Step 7.

### Problem 2: Native Module Build Errors
- **Symptoms:** `node-gyp failed`, `g++ not found`.
- **Fix:** Install build essentials inside Ubuntu:
  ```bash
  sudo apt update
  sudo apt install build-essential python3 make g++
  rm -rf node_modules
  npm install
  ```

### Problem 3: CLI Freezes After Editing `.gemini/settings.json`
- **Cause:** Invalid `includeDirectories` path.
- **Fix:** Ensure all directory paths exist (e.g., `ls ../your-directory`) or
  remove invalid paths.

### Problem 4: Slow Performance
- **Cause:** Project cloned inside `/mnt/c/`.
- **Fix:** Move the project to `/home/<username>/`. The WSL filesystem is
  significantly faster for Node.js operations.

### Problem 5: `code` or `windsurf` command not found
- **Fix:** Add the Windows binary path to your WSL `PATH`. Find the path in
  Windows, then add to `~/.bashrc`:
  ```bash
  export PATH=$PATH:/mnt/c/Users/<username>/AppData/Local/Programs/<IDE>/bin
  ```

---

## 🧪 Debug Checklist

Before reporting issues, verify:

- `node -v` is `~20.19.0`.
- `node -p process.platform` returns `linux`.
- Project is located inside `/home/`.
- `npm run build` completed successfully.
- IDE shows `WSL: Ubuntu` in the status bar.
