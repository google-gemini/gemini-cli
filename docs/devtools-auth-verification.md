# DevTools server authentication — verification guide

This document confirms the security fix for the DevTools server (token auth) and
describes how to verify it manually.

## Issue summary

The DevTools server exposed `/ws`, `/events`, and `/` without authentication, so
any local process or webpage could connect and read/send logs. The fix adds a
per-instance shared secret token: only the CLI that started the server can send
logs; only the UI served by that server can read logs.

## Resolution checklist

| Requirement                                                     | Status | Implementation                                                                                             |
| --------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| Server generates random token at startup                        | Done   | `packages/devtools/src/index.ts`: `randomBytes(32).toString('hex')` in `start()`                           |
| WebSocket `/ws` requires token (query param)                    | Done   | `validateToken(request)` on connection; invalid → `ws.close(4003, '...')`                                  |
| SSE `/events` requires token (query or `Authorization: Bearer`) | Done   | `validateToken(req)`; invalid → **403** + "Forbidden: missing or invalid token"                            |
| HTTP `/` injects token into HTML                                | Done   | `INDEX_HTML.replace('__DEVTOOLS_TOKEN_PLACEHOLDER__', this.token)`                                         |
| `getToken(): string` on DevTools class                          | Done   | Returns `this.token` for the CLI                                                                           |
| Client reads token and uses it for SSE                          | Done   | `packages/devtools/client`: `window.__DEVTOOLS_TOKEN__` in HTML; `hooks.ts` uses `?token=` for EventSource |
| CLI gets token after start and passes to transport              | Done   | `devtoolsService.ts`: `devtools.getToken()`, passed to `addNetworkTransport(..., token)`                   |
| activityLogger includes token in WebSocket URL                  | Done   | `activityLogger.ts`: `ws://.../ws?token=${encodeURIComponent(token)}`                                      |

**Conclusion: The issue is resolved.** All requirements from the proposed
solution are implemented.

---

## Manual verification steps

Prerequisites: DevTools and CLI built and runnable from the repo (e.g.
`npm run build` at root, then `npm run start` from root or `npm start` in
packages/cli).

### 1. Start the DevTools server (via CLI)

From the repo root:

```bash
npm run start
```

When the CLI is running, trigger DevTools so the server starts (e.g. press
**F12** if your setup opens DevTools, or use the command that opens the DevTools
panel). The server will listen on `http://127.0.0.1:25417` (or the next free
port if 25417 is in use).

Leave the CLI and DevTools UI open for the next steps.

### 2. Unauthorized access to `/events` is rejected (403)

In a **new terminal** (not inside the CLI), run:

```bash
curl -v http://127.0.0.1:25417/events
```

**Expected:**

- HTTP status **403 Forbidden**
- Response body: `Forbidden: missing or invalid token`
- No event stream or log data in the response

If you see a long stream of `event: snapshot` / `data: ...` and status 200, the
fix is **not** in effect (e.g. old server or wrong port).

### 3. Unauthorized WebSocket to `/ws` is rejected

In the same new terminal (or a Node one-liner):

```bash
node -e "
const WebSocket = require('ws');
const ws = new WebSocket('ws://127.0.0.1:25417/ws');
ws.on('open', () => { console.log('OPEN (unexpected)'); ws.close(); });
ws.on('close', (code, reason) => console.log('CLOSE', code, reason.toString()));
ws.on('error', (e) => console.log('ERROR', e.message));
"
```

**Expected:**

- No `OPEN`; you should see something like: **CLOSE 4003 Forbidden: missing or
  invalid token** (or an error and then close).
- Connection must not stay open and must not accept messages.

If the connection opens and stays open, the fix is **not** in effect.

### 4. Authorized access works (DevTools UI and CLI)

- **DevTools UI:** In the browser, the page at `http://127.0.0.1:25417/` (or the
  URL the CLI opened) should load and show the DevTools UI. The UI gets the
  token from the injected script and uses it for the `/events` SSE connection.
  You should see network/console logs if the CLI is sending them.

- **CLI → server:** The CLI that started the server uses the token in the
  WebSocket URL when sending logs. So logs should appear in the DevTools UI when
  you use the CLI. No extra steps needed beyond starting the CLI and opening
  DevTools as in step 1.

### 5. Authorized `/events` with token (optional)

To double-check that a valid token is required for `/events`:

1. Open `http://127.0.0.1:25417/` in the browser (same tab as the DevTools UI).
2. In the browser **Developer Console** (F12 → Console), run:

   ```js
   // Token is set by the page script
   console.log(window.__DEVTOOLS_TOKEN__);
   ```

   Copy the printed token (hex string).

3. In a terminal:
   ```bash
   curl -v "http://127.0.0.1:25417/events?token=PASTE_TOKEN_HERE"
   ```
   Replace `PASTE_TOKEN_HERE` with the value from the console.

**Expected:** HTTP **200** and an event stream (e.g. `event: snapshot` followed
by data). This confirms that the server only serves `/events` when the token is
present and correct.

---

## Summary

- **Issue:** DevTools server accepted unauthenticated connections on `/ws` and
  `/events`.
- **Fix:** Token generated at server startup; required for `/ws` (query) and
  `/events` (query or `Authorization: Bearer`); injected into the served HTML;
  CLI uses the same token for the log WebSocket.
- **Manual check:** Unauthorized `curl /events` → **403**; unauthorized
  WebSocket to `/ws` → **close with 4003**; authorized UI and CLI continue to
  work.
