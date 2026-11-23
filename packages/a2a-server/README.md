# Gemini CLI A2A Server

## All code in this package is experimental and under active development

This package contains the A2A server implementation for the Gemini CLI.

## Authentication

The server requires a bearer token on every HTTP request. You provide the token
through an environment variable when you start the server, and clients send it
in the `Authorization` header:

```http
Authorization: Bearer YOUR_TOKEN
```

The server reads the token once at startup from the following environment
variables. You must set them in the environment of the server process. The
server doesn't read them from `.env` files.

| Variable                 | Description                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `GEMINI_IPC_SECRET`      | Token provided by the process that launches the server, such as an IDE integration. Takes precedence if both variables are set. |
| `CODER_AGENT_AUTH_TOKEN` | Token used if `GEMINI_IPC_SECRET` isn't set, for example when you start the server manually.                                    |

The server validates each request as follows:

- The `Host` header must be a loopback address (`localhost`, `127.0.0.1`, or
  `[::1]`, with an optional port). If the request includes an `Origin` header,
  it must also be a loopback origin. Otherwise, the server responds with
  `403 Forbidden`.
- The `Authorization` header must contain the configured token. Otherwise, the
  server responds with `401 Unauthorized`.
- If neither variable is set, the server responds to every request with
  `500 Internal Server Error`.

To start the server manually from the repository root, set a token before you
run it:

```bash
CODER_AGENT_AUTH_TOKEN="YOUR_TOKEN" npm run start:a2a-server
```
