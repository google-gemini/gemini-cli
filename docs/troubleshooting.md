# Troubleshooting

## Antivirus False Positive Detections (Windows)

Some antivirus software may flag Gemini CLI's JSON files as malware (e.g.,
`Generic.PyStealer.AD`, `IDP.HELU.PSE46`). **These are false positives.**

### Why it happens

Gemini CLI writes JSON diagnostic files to `~/.gemini/tmp/`. Heuristic AV
engines may mistake these structured JSON files (containing session IDs,
timestamps, and conversation context) for data exfiltration payloads.

### How to resolve

1. **Add an exclusion** for `~/.gemini/` (or `%USERPROFILE%\.gemini\` on
   Windows) in your antivirus settings.

2. **Report the false positive** to your AV vendor:

   | Vendor               | Submission Link                                                                                                        |
   | -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
   | Bitdefender          | [Submit False Positive](https://www.bitdefender.com/consumer/support/answer/29358/)                                    |
   | Avast / AVG / Norton | [Submit False Positive](https://support.norton.com/sp/en/us/home/current/solutions/v3672136)                           |
   | Windows Defender     | [Submit Sample](https://www.microsoft.com/en-us/wdsi/filesubmission)                                                   |
   | Kaspersky            | [Submit File for Analysis](https://opentip.kaspersky.com/)                                                             |
   | ESET                 | [Submit Sample](https://support.eset.com/en/kb141-submit-a-virus-false-positive-or-other-suspicious-file-for-analysis) |

3. **Restore quarantined files** through your AV's quarantine manager if needed.

When reporting, mention that `@google/gemini-cli` is an open-source Apache 2.0
Node.js CLI tool published on npm.
