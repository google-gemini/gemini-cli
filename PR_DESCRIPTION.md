## Summary

Fixes confusing error message when OAuth authentication succeeds but account
setup requires `GOOGLE_CLOUD_PROJECT`. The error message now correctly reflects
that OAuth succeeded but account configuration requires a project ID, removing
the misleading "Failed to login" prefix.

## Details

When authenticating with a workspace Google account that requires
`GOOGLE_CLOUD_PROJECT`, the OAuth flow succeeds (showing "Authentication
succeeded"), but then `setupUser()` throws `ProjectIdRequiredError` if the
project ID is not set. Previously, this error was caught and displayed with a
"Failed to login. Message:" prefix, which was confusing since OAuth had already
succeeded.

This PR:

- Catches `ProjectIdRequiredError` specifically in all three authentication
  error handling paths
- Displays the error message directly without the "Failed to login" or "Failed
  to authenticate" prefix
- Makes it clear that OAuth succeeded but account setup requires additional
  configuration

**Error handling paths updated:**

1. `performInitialAuth()` - Initial authentication during startup
2. `useAuthCommand()` - Authentication hook in UI
3. `handleAuthSelect()` - Auth selection handler in AppContainer

## Related Issues

Fixes #15749

## How to Validate

1. **Test with workspace account requiring project ID:**

   ```bash
   # Ensure GOOGLE_CLOUD_PROJECT is not set
   unset GOOGLE_CLOUD_PROJECT
   unset GOOGLE_CLOUD_PROJECT_ID

   # Start CLI
   npm start
   ```

2. **Select "Login with Google" and authenticate with a workspace account**

3. **Expected behavior:**
   - See "Authentication succeeded" message
   - Then see error:
     `This account requires setting the GOOGLE_CLOUD_PROJECT or GOOGLE_CLOUD_PROJECT_ID env var. See https://goo.gle/gemini-cli-auth-docs#workspace-gca`
   - **Should NOT** see "Failed to login. Message:" prefix

4. **Verify tests pass:**
   ```bash
   npm test -- packages/cli/src/core/auth.test.ts packages/cli/src/ui/auth/useAuth.test.tsx
   ```

## Pre-Merge Checklist

- [x] Updated relevant documentation and README (if needed)
- [x] Added/updated tests (if needed)
- [ ] Noted breaking changes (if any) - None
- [ ] Validated on required platforms/methods:
  - [ ] MacOS
    - [x] npm run
    - [ ] npx
    - [ ] Docker
    - [ ] Podman
    - [ ] Seatbelt
  - [ ] Windows
    - [ ] npm run
    - [ ] npx
    - [ ] Docker
  - [ ] Linux
    - [ ] npm run
    - [ ] npx
    - [ ] Docker
