# Maintainer: Local Tester

pkgname=gemini-cli
pkgver=0.34.0.nightly.20260304.28af4e127
pkgrel=1
pkgdesc='Google Gemini CLI built from a local checkout'
arch=('x86_64' 'aarch64')
url='https://github.com/google-gemini/gemini-cli'
license=('Apache')
depends=('nodejs')
makedepends=('npm' 'rsync')
options=('!strip')
source=()
sha256sums=()

_local_srcdir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

prepare() {
  local _build_srcdir="${srcdir}/gemini-cli-src"
  rm -rf "$_build_srcdir"
  mkdir -p "$_build_srcdir"

  # Build from local files in this checkout (no remote source fetch).
  rsync -a --delete \
    --exclude '.git' \
    --exclude '/src/' \
    --exclude '/pkg/' \
    --exclude '*.pkg.tar*' \
    --exclude 'node_modules' \
    --exclude 'packages/*/node_modules' \
    --exclude 'bundle' \
    --exclude 'dist' \
    --exclude 'coverage' \
    --exclude 'packages/*/coverage' \
    --exclude 'packages/cli/src/generated/' \
    --exclude 'packages/core/src/generated/' \
    --exclude 'packages/devtools/src/_client-assets.ts' \
    --exclude '.integration-tests/' \
    --exclude 'packages/vscode-ide-companion/*.vsix' \
    --exclude 'packages/cli/download-ripgrep*/' \
    --exclude 'junit.xml' \
    --exclude '*.tsbuildinfo' \
    --exclude '.eslintcache' \
    --exclude 'evals/logs/' \
    --exclude '.docker' \
    "$_local_srcdir/" "$_build_srcdir/"
}

build() {
  local _build_srcdir="${srcdir}/gemini-cli-src"
  cd "$_build_srcdir"

  # Avoid lifecycle hooks during dependency installation; run explicit bundle step.
  npm ci --ignore-scripts
  npm run bundle
}

package() {
  local _build_srcdir="${srcdir}/gemini-cli-src"
  cd "$_build_srcdir"

  install -d "$pkgdir/usr/lib/$pkgname"
  cp -a bundle "$pkgdir/usr/lib/$pkgname/"

  install -Dm644 LICENSE "$pkgdir/usr/share/licenses/$pkgname/LICENSE"
  install -Dm644 README.md "$pkgdir/usr/share/doc/$pkgname/README.md"

  install -d "$pkgdir/usr/bin"
  cat > "$pkgdir/usr/bin/gemini" <<'LAUNCHER'
#!/usr/bin/env bash
exec node /usr/lib/gemini-cli/bundle/gemini.js "$@"
LAUNCHER
  chmod 755 "$pkgdir/usr/bin/gemini"
}
