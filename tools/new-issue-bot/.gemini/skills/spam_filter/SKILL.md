---
name: spam_filter
description: Analyzes issue body text to determine if it is spam, gibberish, or lacks enough detail to diagnose.
---
# Skill: Spam & Quality Filter

Evaluate the issue text provided in your context against these rules:
1. **Spam/Gibberish:** If the issue body contains randomized characters (e.g., "asdfasdf"), joke requests, or spam links, flag it as `SPAM`.
2. **Missing Information:** If the description is extremely short (e.g., "doesn't work" or "fix this") and contains no details, stack traces, or reproduction steps, flag it as `INCOMPLETE`.
3. **Legitimate:** Otherwise, flag it as `VALID`.

Output your evaluation in JSON format:
```json
{
  "status": "VALID" | "SPAM" | "INCOMPLETE",
  "reason": "Brief explanation of the decision"
}
```

If the status is `SPAM` or `INCOMPLETE`, draft a polite template message asking the user to provide details using the issue template.
