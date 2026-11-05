# Research Mode for Gemini CLI

Perplexity-style deep research inside Gemini CLI. Adds 4 commands:

| Command | Kya karta hai |
|---|---|
| `/research <topic>` | Full research brief: TL;DR, findings, causal (karan) analysis, contradictions, provenance table, open questions |
| `/research:quick <question>` | Fast cited answer (<300 words) with confidence label |
| `/research:compare <A> vs <B>` | Evidence-based comparison matrix with a verdict |
| `/research:bharat <topic>` | India-first research: .gov.in/RBI/SEBI sources, INR pricing, Hinglish output |

## Install

**Option A: manual copy**
```bash
mkdir -p ~/.gemini/extensions
cp -r research-mode ~/.gemini/extensions/
```

**Option B: clone into extensions**
```bash
git clone https://github.com/Himanshu90909/gemini-research-mode ~/.gemini/extensions/research-mode
```

Then restart Gemini CLI (ya `/commands reload` chalao) aur `/help` mein commands dikhenge.

## Notes

- Live search chahiye to Gemini CLI mein built-in `google_web_search` tool enabled hona chahiye (default on with API key auth). Tool na ho to commands offline-knowledge mode mein chalte hain with `[offline knowledge - verify]` labels.
- Structure: `gemini-extension.json` (manifest), `GEMINI.md` (methodology context), `commands/*.toml` (slash commands).
