## Summary

This PR resolves a critical issue (Issue #20129) where the Gemini CLI hangs
indefinitely in Linux environments following a successful browser-based OAuth
sequence. It fixes leaked timers, correctly restores terminal input streams in
Ink, and cleanly detaches keep-alive network and child processes.

## Details

1. **Timer Handling**: We now securely capture the `timerId` for the 5-minute
   browser watchdog fallback and invoke `clearTimeout` in the `finally` block of
   the web auth resolution preventing node event loop tethering.
2. **TTY Ink Resumption**: A `process.stdin.resume()` call is added immediately
   following the cleanup of programmatic raw `data` listener intercepts,
   ensuring that subsequent CLI/TUI renderings from Ink can safely resume
   reading the terminal standard input.
3. **Browser Spawning Detachment**: Used `childProcess.unref?.()` to explicitly
   detach the background desktop subprocess created by `open`.
4. **HTTP Server Teardown**: Replaced standard `server.close()` with explicitly
   terminating sockets by overriding the Keep-Alive network pool using
   `server.closeAllConnections?.()` chained specifically to
   `res.on?.('finish', ...)`.

## Related Issues

Fixes #20129

## How to Validate

We expanded `oauth2.test.ts` to directly simulate this behavior:

1. Validating `vi.getTimerCount()` doesn't increase across the `getOauthClient`
   promise boundary.
2. Validating `process.stdin.listenerCount('data')` accurately handles attaching
   and unmounting terminal watchers cleanly during a successful OAuth stub. You
   can optionally execute `gemini auth` in Docker/Linux.

## Pre-Merge Checklist

- [ ] Updated relevant documentation and README (if needed)
- [x] Added/updated tests (if needed)
- [ ] Noted breaking changes (if any)
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
