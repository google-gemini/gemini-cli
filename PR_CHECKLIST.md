### API & Network Errors

- [ ] **400 Bad Request**
  - _Test:_ Send a request with an invalid parameter (e.g., a model name that doesn't exist).
    export GEMINI_API_KEY="pepperoni"
  - _Verify:_ The specific error message from the API is displayed to the user.

- [ ] **401 Unauthorized**
  - _Test:_ Use an expired or invalid API key/auth token.
  - _Verify:_ The app prompts for re-authentication with a "Session expired" message.

- [ ] **403 Forbidden**
  - _Test:_ Use valid credentials for a project where the Gemini API is not enabled.
  - _Verify:_ The app displays a clear permission-denied error.

- [ ] **429 - Pro Quota Exceeded (Free Tier User)**
  - _Test:_ As a free-tier user, exceed the daily quota for the Pro model.
  - _Verify:_ The app shows a message about switching to the Flash model and includes an upsell link.

- [ ] **429 - Pro Quota Exceeded (Paid Tier User)**
  - _Test:_ As a paid-tier user, exceed the daily quota for the Pro model.
  - _Verify:_ The app shows a message about switching to the Flash model and mentions using a personal API key.

- [ ] **429 - Generic Quota Exceeded (Free Tier User)**
  - _Test:_ As a free-tier user, trigger a generic daily quota limit.
  - _Verify:_ The app displays a generic "daily quota limit" message with an upsell link.

- [ ] **429 - Generic Quota Exceeded (Paid Tier User)**
  - _Test:_ As a paid-tier user, trigger a generic daily quota limit.
  - _Verify:_ The app displays the generic "daily quota limit" message for paid users.

- [ ] **429 - General Rate Limit (Google Login)**
  - _Test:_ While logged in with Google, send requests rapidly to trigger a general rate limit.
  - _Verify:_ The app displays the "Possible quota limitations" message.

- [ ] **429 - General Rate Limit (Gemini API Key)**
  - _Test:_ Using a Gemini (AI Studio) API key, send requests rapidly.
  - _Verify:_ The app displays the AI Studio-specific rate limit message.

- [ ] **429 - General Rate Limit (Vertex AI Auth)**
  - _Test:_ Using Vertex AI authentication, send requests rapidly.
  - _Verify:_ The app displays the Vertex AI-specific rate limit message.

- [ ] **5xx Server Errors (500, 502, 503)**
  - _Test:_ Mock a 500, 502, or 503 response from the API.
  - _Verify:_ A generic but user-friendly "API Error" message is displayed.

### Fatal Errors (CLI Exit)

- [ ] **`FatalAuthenticationError` (Exit Code 41)**
  - _Test:_ Fail the initial authentication setup.
  - _Verify:_ The CLI exits with code 41.

- [ ] **`FatalInputError` (Exit Code 42)**
  - _Test:_ Provide invalid command-line arguments.
  - _Verify:_ The CLI exits with code 42.

- [ ] **`FatalSandboxError` (Exit Code 44)**
  - _Test:_ Cause a critical failure in a sandbox operation.
  - _Verify:_ The CLI exits with code 44.

- [ ] **`FatalConfigError` (Exit Code 52)**
  - _Test:_ Use a malformed `config.yaml` file.
  - _Verify:_ The CLI exits with code 52.

- [ ] **`FatalTurnLimitedError` (Exit Code 53)**
  - _Test:_ Exceed the maximum number of conversation turns.
  - _Verify:_ The CLI exits with code 53.

- [ ] **`FatalToolExecutionError` (Exit Code 54)**
  - _Test:_ Cause a tool to fail in a way that is designated as fatal.
  - _Verify:_ The CLI exits with code 54.

- [ ] **`FatalCancellationError` (Exit Code 130)**
  - _Test:_ Press `Ctrl+C` during a streaming response.
  - _Verify:_ The CLI exits gracefully with code 130.
