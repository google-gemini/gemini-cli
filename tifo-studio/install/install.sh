#!/usr/bin/env bash
# Tifo Studio installer for macOS and Linux — no admin rights needed.
#
#   curl -fsSL https://raw.githubusercontent.com/Anwars3/gemini-cli/main/tifo-studio/install/install.sh | bash
#
# Installs into ~/TifoStudio (override with TIFO_HOME), downloads a portable Node.js if
# needed, the free Piper neural voice engine + British voices, creates a launcher and starts
# the app in your browser. Re-run any time to update (your projects are kept).
#
# Options (environment variables): TIFO_HOME, TIFO_REF (git branch), TIFO_NO_VOICE=1,
# TIFO_NO_START=1, TIFO_FORCE_NODE=1
set -euo pipefail

REPO="Anwars3/gemini-cli"
REFS="${TIFO_REF:-} main claude/focused-meitner-oqnrj2"
DIR="${TIFO_HOME:-$HOME/TifoStudio}"
PIPER_REL="https://github.com/rhasspy/piper/releases/download/2023.11.14-2"
HF="https://huggingface.co/rhasspy/piper-voices/resolve/main"
VOICES="en/en_GB/alan/medium/en_GB-alan-medium en/en_GB/northern_english_male/medium/en_GB-northern_english_male-medium"

step() { printf '\033[1;33m▸\033[0m %s\n' "$*"; }
ok() { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;31m!\033[0m %s\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1 || { warn "Missing '$1' — please install it and run this again."; exit 1; }; }
need curl
need tar

OS=$(uname -s)
ARCH=$(uname -m)
case "$OS" in
  Darwin) PLAT=darwin; PPLAT=macos ;;
  Linux) PLAT=linux; PPLAT=linux ;;
  *) warn "Unsupported system $OS. On Windows use install.ps1."; exit 1 ;;
esac
case "$ARCH" in
  x86_64 | amd64) NARCH=x64; PARCH=x86_64; [ "$PLAT" = darwin ] && PARCH=x64 ;;
  arm64 | aarch64) NARCH=arm64; PARCH=aarch64 ;;
  *) warn "Unsupported CPU $ARCH"; exit 1 ;;
esac

echo
printf '\033[1;33m  TIFO STUDIO\033[0m installer\n\n'
mkdir -p "$DIR"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# ---- 1. app files ----
SRC=""
SELF="${BASH_SOURCE[0]:-}"
if [ -n "$SELF" ] && [ -f "$SELF" ] && [ -f "$(dirname "$SELF")/../server.js" ]; then
  SRC="$(cd "$(dirname "$SELF")/.." && pwd)"
  step "Installing from local folder $SRC"
else
  REF=""
  for r in $REFS; do
    if curl -fsIL "https://raw.githubusercontent.com/$REPO/$r/tifo-studio/server.js" >/dev/null 2>&1; then REF=$r; break; fi
  done
  [ -n "$REF" ] || { warn "Could not find Tifo Studio on GitHub ($REPO)."; exit 1; }
  step "Downloading Tifo Studio ($REF)…"
  curl -fsSL "https://codeload.github.com/$REPO/tar.gz/refs/heads/$REF" | tar -xz -C "$TMP"
  SRC=$(find "$TMP" -maxdepth 2 -type d -name tifo-studio -print -quit)
  [ -n "$SRC" ] || { warn "Download did not contain tifo-studio."; exit 1; }
fi
if [ "$(cd "$SRC" && pwd)" != "$(cd "$DIR" && pwd)" ]; then
  rm -rf "$DIR/public" "$DIR/install"
  for item in public install server.js package.json README.md; do
    [ -e "$SRC/$item" ] && cp -R "$SRC/$item" "$DIR/"
  done
fi
ok "App files in $DIR"

# ---- 2. Node.js ----
NODE=""
if [ -z "${TIFO_FORCE_NODE:-}" ] && command -v node >/dev/null 2>&1; then
  major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
  [ "$major" -ge 18 ] 2>/dev/null && NODE=$(command -v node)
fi
if [ -z "$NODE" ] && [ -x "$DIR/node/bin/node" ]; then NODE="$DIR/node/bin/node"; fi
if [ -z "$NODE" ]; then
  step "Downloading Node.js (portable, no admin needed)…"
  curl -fsSL -o "$TMP/index.json" https://nodejs.org/dist/index.json
  VER=$(tr '{' '\n' < "$TMP/index.json" | awk -F'"version":"' '/"lts":"/ && !f { split($2, a, "\""); print a[1]; f = 1 }')
  [ -n "$VER" ] || { warn "Could not look up the Node.js version."; exit 1; }
  curl -fsSL "https://nodejs.org/dist/$VER/node-$VER-$PLAT-$NARCH.tar.gz" | tar -xz -C "$TMP"
  rm -rf "$DIR/node"
  mv "$TMP/node-$VER-$PLAT-$NARCH" "$DIR/node"
  NODE="$DIR/node/bin/node"
fi
ok "Node.js $("$NODE" -v)"

# ---- 3. AI voice (Piper) ----
if [ -z "${TIFO_NO_VOICE:-}" ]; then
  mkdir -p "$DIR/tts/voices"
  if [ ! -x "$DIR/tts/piper/piper" ]; then
    step "Downloading Piper (free neural text-to-speech)…"
    rm -rf "$DIR/tts/piper"
    curl -fsSL "$PIPER_REL/piper_${PPLAT}_${PARCH}.tar.gz" | tar -xz -C "$DIR/tts" || warn "Piper download failed."
  fi
  for v in $VOICES; do
    f=$(basename "$v")
    [ -s "$DIR/tts/voices/$f.onnx" ] && continue
    step "Downloading voice $f…"
    if curl -fsSL -o "$DIR/tts/voices/$f.onnx.json" "$HF/$v.onnx.json" && curl -fL --progress-bar -o "$DIR/tts/voices/$f.onnx.part" "$HF/$v.onnx"; then
      mv "$DIR/tts/voices/$f.onnx.part" "$DIR/tts/voices/$f.onnx"
    else
      rm -f "$DIR/tts/voices/$f.onnx"*
      warn "Could not download $f."
    fi
  done
  if ! ls "$DIR/tts/voices/"*.onnx >/dev/null 2>&1; then
    step "Trying the backup voice source…"
    curl -fsSL https://github.com/rhasspy/piper/releases/download/v0.0.2/voice-en-gb-alan-low.tar.gz | tar -xz -C "$DIR/tts/voices" || true
    rm -f "$DIR/tts/voices/MODEL_CARD"
  fi
  if [ -x "$DIR/tts/piper/piper" ]; then
    [ "$PLAT" = darwin ] && xattr -dr com.apple.quarantine "$DIR/tts" 2>/dev/null || true
    model=""
    for m in "$DIR/tts/voices/"*.onnx; do [ -f "$m" ] && { model=$m; break; }; done
    if [ -n "$model" ] && echo "Testing." | (cd "$DIR/tts/piper" && ./piper --model "$model" --output_file "$TMP/t.wav") >/dev/null 2>&1 && [ -s "$TMP/t.wav" ]; then
      ok "AI voice ready"
    else
      warn "Piper can't run on this computer — the app will use the built-in system voices instead."
      rm -rf "$DIR/tts/piper"
    fi
  fi
fi

# ---- 4. launcher ----
cat > "$DIR/start.sh" <<EOF
#!/usr/bin/env bash
cd "\$(dirname "\$0")"
exec "$NODE" server.js --open
EOF
chmod +x "$DIR/start.sh"
if [ "$PLAT" = darwin ]; then
  LAUNCH="$HOME/Desktop/Tifo Studio.command"
  printf '#!/usr/bin/env bash\nexec "%s/start.sh"\n' "$DIR" > "$LAUNCH"
  chmod +x "$LAUNCH"
  ok "Launcher: Desktop → Tifo Studio.command"
else
  mkdir -p "$HOME/.local/share/applications"
  DESK="$HOME/.local/share/applications/tifo-studio.desktop"
  cat > "$DESK" <<EOF
[Desktop Entry]
Type=Application
Name=Tifo Studio
Comment=Make Tifo-style football tactics videos
Exec="$DIR/start.sh"
Terminal=true
Categories=AudioVideo;Video;
EOF
  if [ -d "$HOME/Desktop" ]; then cp "$DESK" "$HOME/Desktop/" && chmod +x "$HOME/Desktop/tifo-studio.desktop" || true; fi
  ok "Launcher: app menu → Tifo Studio (or run $DIR/start.sh)"
fi

echo
ok "Tifo Studio is installed in $DIR"
if [ -z "${TIFO_NO_START:-}" ]; then
  step "Starting… your browser will open at http://localhost:5173 (press Ctrl+C here to stop)"
  rm -rf "$TMP"
  trap - EXIT
  cd "$DIR"
  exec "$NODE" server.js --open
fi
