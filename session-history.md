### 2026-08-05 22:55 — main (348fc35f1 "fix(core,cli): repair /compress session reload and quota-fallback tool response loss (#28672)")

- [x] Fixed startup health check hang by reducing timeouts in
      `startup-health-check.sh` from 150s down to 3s.
- [x] Fixed 401 Unauthorized API error on Vertex AI when `GOOGLE_API_KEY`
      environment variable is present by ensuring `apiKey: ''` is set to
      suppress fallback to Developer API key in `contentGenerator.ts`.
- [x] Verified MCP client manager tool discovery and session reloading with unit
      test suites.
- [x] Verified build pipeline (`npm run bundle`) completes cleanly.

---

### 2026-08-05 22:55 — main (348fc35f1 "fix(core,cli): repair /compress session reload and quota-fallback tool response loss (#28672)")

- [x] Fixed startup health check hang by reducing timeouts in
      `startup-health-check.sh` from 150s down to 3s.
- [x] Fixed 401 Unauthorized API error on Vertex AI when `GOOGLE_API_KEY`
      environment variable is present by ensuring `apiKey: ''` is set to
      suppress fallback to Developer API key in `contentGenerator.ts`.
- [x] Verified MCP client manager tool discovery and session reloading with unit
      test suites.
- [x] Verified build pipeline (`npm run bundle`) completes cleanly.

---

### 2026-08-05 22:55 — main (348fc35f1 "fix(core,cli): repair /compress session reload and quota-fallback tool response loss (#28672)")

- [x] Fixed startup health check hang by reducing timeouts in
      `startup-health-check.sh` from 150s down to 3s.
- [x] Fixed 401 Unauthorized API error on Vertex AI when `GOOGLE_API_KEY`
      environment variable is present by ensuring `apiKey: ''` is set to
      suppress fallback to Developer API key in `contentGenerator.ts`.
- [x] Verified MCP client manager tool discovery and session reloading with unit
      test suites.
- [x] Verified build pipeline (`npm run bundle`) completes cleanly.

---
