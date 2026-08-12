# Project State

## Status

- **Last Session:** 2026-08-12 14:35
- **Branch:** main
- **Last Commit:** fee21ee79 "refactor(core): implement canonical model
  resolution and switch tests to Bun" quota-fallback tool response loss
  (#28672)"
- **Deploy State:** unknown

## What Was Done

- [x] Fixed startup health check hang by reducing timeouts in
      `startup-health-check.sh` from 150s down to 3s.
- [x] Fixed 401 Unauthorized API error on Vertex AI when `GOOGLE_API_KEY`
      environment variable is present by ensuring `apiKey: ''` is set to
      suppress fallback to Developer API key in `contentGenerator.ts`.
- [x] Verified MCP client manager tool discovery and session reloading with unit
      test suites.
- [x] Verified build pipeline (`npm run bundle`) completes cleanly.

## Open Items

- None

## Next Session

- Ready for PR creation or deployment verification.

## Key Decisions

- Reduced startup health check timeouts in `startup-health-check.sh` to 3s to
  prevent CLI startup latency and background process hanging.
- Explicitly pass `apiKey: ''` to `GoogleGenAI` when `useVertex` is enabled and
  `GOOGLE_API_KEY` is present in process environment to force OAuth2/ADC
  credential resolution.
