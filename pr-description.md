## Summary

This PR implements a seamless migration path for extensions to move to a new
repository and optionally change their name without stranding existing users.

When an extension author sets the `migratedTo` field in their
`gemini-extension.json` and publishes an update to their old repository, the CLI
will detect this during the next update check. The CLI will then automatically
download the extension from the new repository, explicitly warn the user about
the migration (and any renaming) during the consent step, and seamlessly migrate
the installation and enablement status while cleaning up the old installation.

## Details

- **Configuration:** Added `migratedTo` property to `ExtensionConfig` and
  `GeminiCLIExtension` to track the new repository URL.
- **Update checking & downloading:** Updated `checkForExtensionUpdate` and
  `updateExtension` to inspect the `migratedTo` field. If present, the CLI
  queries the new repository URL for an update and swaps the installation source
  so the update resolves from the new location.
- **Migration & renaming logic (`ExtensionManager`):**
  - `installOrUpdateExtension` now fully supports renaming. It transfers global
    and workspace enablement states from the old extension name to the new one
    and deletes the old extension directory.
  - Added safeguards to block renaming if the new name conflicts with a
    different, already-installed extension or if the destination directory
    already exists.
  - Exposed `getEnablementManager()` to `ExtensionManager` for better typing
    during testing.
- **Consent messaging:** Refactored `maybeRequestConsentOrFail` to compute an
  `isMigrating` flag (by detecting a change in the installation source). The
  `extensionConsentString` output now explicitly informs users with messages
  like: _"Migrating extension 'old-name' to a new repository, renaming to
  'new-name', and installing updates."_
- **Documentation:** Documented the `migratedTo` field in
  `docs/extensions/reference.md` and added a comprehensive guide in
  `docs/extensions/releasing.md` explaining how extension maintainers can
  transition users using this feature.
- **Testing:** Added extensive unit tests across `extension-manager.test.ts`,
  `consent.test.ts`, `github.test.ts`, and `update.test.ts` to cover the new
  migration and renaming logic.

## Related issues

N/A

## How to validate

1. **Unit tests:** Run all related tests to confirm everything passes:
   ```bash
   npm run test -w @google/gemini-cli -- src/config/extensions/github.test.ts
   npm run test -w @google/gemini-cli -- src/config/extensions/update.test.ts
   npm run test -w @google/gemini-cli -- src/config/extensions/consent.test.ts
   npm run test -w @google/gemini-cli -- src/config/extension-manager.test.ts
   ```
2. **End-to-end migration test:**
   - Install a local or git extension.
   - Update its `gemini-extension.json` to include a `migratedTo` field pointing
     to a _different_ test repository.
   - Run `gemini extensions check` to confirm it detects the update from the new
     source.
   - Run `gemini extensions update <extension>`.
   - Verify that the consent prompt explicitly mentions the migration.
   - Verify that the new extension is installed, the old directory is deleted,
     and its enablement status carried over.
