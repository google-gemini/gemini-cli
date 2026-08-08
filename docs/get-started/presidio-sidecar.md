# Presidio PII redaction

OpenAI-compatible custom endpoints use a local Microsoft Presidio Analyzer
sidecar before sending any text to the model. The analyzer detects names and
other configured PII, and Gemini CLI replaces each match with an opaque,
restorable token.

Start the bundled sidecar before selecting an OpenAI-compatible endpoint:

```bash
npm run presidio:start
```

The analyzer listens only on `127.0.0.1:5002`. To use a different analyzer, set
its complete `/analyze` endpoint:

```bash
export GEMINI_PRESIDIO_ANALYZER_URL=http://127.0.0.1:5002/analyze
```

Redaction is fail-closed. If the analyzer is unavailable or returns an invalid
response, Gemini CLI stops the custom-endpoint request instead of sending
unanalyzed content. Run `npm run presidio:stop` to stop the bundled sidecar.
