# Ripgrep checksum workflow

> For Gemini CLI maintainers working on the vendored ripgrep binaries.

The CLI downloads prebuilt archives from `microsoft/ripgrep-prebuilt` and
verifies them against `ripgrep-checksums.json`. At runtime we abort when the
manifest's `version` does not match the `RIPGREP_VERSION` environment variable,
so refresh the manifest whenever you bump, patch, or hotfix the bundled ripgrep
build.

## When to regenerate the manifest

- `RIPGREP_VERSION` changes in `src/downloadRipGrep.js`.
- Microsoft republishes an archive you want to ship.
- The supported target list in `scripts/generate-checksums.mjs` changes.

## How to regenerate

Run the helper script from the repository root. It streams each asset through a
SHA-256 hash and writes a fresh manifest.

```bash
node third_party/get-ripgrep/scripts/generate-checksums.mjs \
  --version v13.0.0-10 \
  --output third_party/get-ripgrep/ripgrep-checksums.json
```

### Options

- `--repository` (`-r`): Override the GitHub owner/name (defaults to
  `microsoft/ripgrep-prebuilt`).
- `--version` (`-v`): Release tag to hash (typically the same value assigned to
  `RIPGREP_VERSION`).
- `--targets`: Comma-separated list of archive suffixes. Omit to cover the
  default set.
- `--output` (`-o`): Destination for the manifest. The default matches the file
  we ship.

The script writes prettified JSON and timestamps `generatedAt`. Commit the
updated manifest alongside the `RIPGREP_VERSION` change.

## Recommended validation

1.  Ensure `RIPGREP_VERSION` matches the tag you passed to the generator.
2.  Run `npm run test:scripts -- --run downloadRipGrep`. The unit test fails if
    the manifest and version diverge.
3.  (Optional) Delete `${xdgCache}/vscode-ripgrep`, run the CLI, and confirm the
    checksum verification succeeds end to end.

If the CLI reports a version mismatch, regenerate the manifest against the exact
tag you intend to ship and recommit the refresh.
