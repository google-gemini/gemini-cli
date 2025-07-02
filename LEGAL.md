# Legal Compliance Documentation

## Project Attribution

**Gemini Copilot** is a fork of Google's Gemini CLI project:
- **Original Repository**: https://github.com/google-gemini/gemini-cli
- **Original License**: Apache License 2.0
- **Original Copyright**: Copyright 2025 Google LLC

## License Compliance

This project is licensed under the Apache License 2.0, same as the original Gemini CLI project.

### Apache 2.0 License Requirements Met:
- ✅ **Original license file preserved** (LICENSE)
- ✅ **Copyright notices preserved** in all original files
- ✅ **Modifications documented** (this file and git history)
- ✅ **Attribution provided** in README.md
- ✅ **No trademark infringement** (clear disclaimers added)

## Modifications Made

This fork includes the following modifications to the original Gemini CLI:

### 1. **Branding Changes**
- Package name changed from `@google/gemini-cli` to `binora/gemini-copilot`
- Binary name changed from `gemini` to `gemini-copilot`
- README.md updated with fork disclaimers and new functionality
- Repository references updated to point to fork

### 2. **Planned Technical Modifications** (Implementation in progress)
- Addition of VSCode Language Model API integration
- New provider abstraction layer in `packages/core/src/providers/`
- VSCode bridge extension in `packages/vscode-bridge/`
- GitHub Copilot as default LLM provider
- Fallback support for original Gemini API
- Modified authentication flow to prioritize GitHub Copilot

### 3. **Copyright Headers**
All modified files include appropriate copyright headers:
```
// Original work Copyright 2025 Google LLC
// Modified work Copyright 2025 Binny Arora
// Licensed under Apache 2.0
```

## Data Privacy Considerations

### User Data Flow:
1. **Local Processing**: User code and prompts are processed locally in VSCode
2. **GitHub Copilot Integration**: Data flows through GitHub Copilot's servers (Microsoft/GitHub)
3. **No Third-Party Data Collection**: This fork does not collect or store user data
4. **Original Telemetry**: Google's telemetry system remains for fallback Gemini usage

### User Privacy Rights:
- Users must have their own valid GitHub Copilot subscription
- Users can opt out of telemetry via VSCode settings
- Users control what data is sent to GitHub Copilot through their usage
- This project does not redistribute or resell Copilot access

## GitHub Copilot Integration Compliance

### Legal Status:
- ✅ **VSCode Language Model API**: Officially supported by Microsoft/GitHub
- ✅ **Extension Development**: Permitted under GitHub Copilot Extension Developer Policy
- ✅ **Third-Party Integration**: Explicitly allowed (similar to Cline, Cursor, etc.)
- ✅ **No Terms Violation**: Does not violate GitHub Copilot Terms of Service
- ✅ **Subscription Requirement**: Users must have their own valid Copilot subscription

### Compliance Requirements:
- Users must respect GitHub Copilot rate limits
- Extension must inform users they're interacting with AI-generated content
- Must provide mechanism for users to report issues
- Cannot redistribute or resell Copilot access
- Must follow VSCode extension best practices

## Trademark Considerations

### Avoided Trademark Issues:
- ❌ **Not using "Gemini" as primary branding**
- ❌ **No implied Google endorsement**
- ✅ **Clear fork designation**: "gemini-copilot" indicates derivative work
- ✅ **Explicit disclaimers**: "Not affiliated with or endorsed by Google"
- ✅ **Proper attribution**: Links to original project

### Permitted Usage:
- ✅ Can state "Fork of Gemini CLI"
- ✅ Can reference original functionality
- ✅ Can maintain technical compatibility

## Disclaimer

**This project is not affiliated with, endorsed by, or officially connected to Google LLC, GitHub, or Microsoft Corporation. All product names, logos, and brands are property of their respective owners.**

**Users of this software acknowledge that:**
- They must have their own valid GitHub Copilot subscription
- They understand their code/data will be processed by GitHub Copilot
- They agree to GitHub Copilot's terms of service
- They understand this is an independent fork with no official support from Google

## Contact

For legal inquiries or compliance questions, please open an issue in the project repository.

---

*Last updated: 2025-07-02*