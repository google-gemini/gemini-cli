# Plan: Gemini-Copilot - Fork of Gemini CLI with GitHub Copilot Integration

## Project Overview
**Project Name**: gemini-copilot  
**Description**: A fork of Gemini CLI that uses GitHub Copilot as the default LLM provider via VSCode's Language Model API  
**Default Authentication**: GitHub (via Copilot subscription)  
**Fallback**: Original Gemini models (optional)

## Milestones

### Milestone 1: Project Setup and Fork (Week 1)
**Goal**: Establish the gemini-copilot project foundation

#### Tasks:
1. **Fork Gemini CLI Repository**
   - Fork https://github.com/google-gemini/gemini-cli to new repo `gemini-copilot`
   - Update README.md to reflect new project purpose
   - Add disclaimer: "This is a fork of Google's Gemini CLI. This project is not affiliated with or endorsed by Google."
   - Update package.json: rename to `@your-org/gemini-copilot`
   - Update all references from "gemini" to "gemini-copilot" in documentation

2. **Legal Compliance**
   - Keep original LICENSE file (Apache 2.0)
   - Add copyright headers to all modified files:
     ```
     // Original work Copyright 2025 Google LLC
     // Modified work Copyright 2025 [Your Organization]
     // Licensed under Apache 2.0
     ```
   - Create LEGAL.md documenting:
     - Original project attribution
     - List of modifications
     - Data privacy considerations
     - GitHub Copilot terms compliance

3. **Set Up Development Environment**
   - Clone the forked repository
   - Install Node.js 18+ on all developer machines
   - Run `npm install` in root directory
   - Verify existing Gemini CLI builds: `npm run build`
   - Test that original functionality works: `npm run test`

4. **Create VSCode Extension Subproject**
   - Create new directory: `packages/vscode-bridge/`
   - Initialize VSCode extension: `yo code` (select "New Extension (TypeScript)")
   - Name: "gemini-copilot-bridge"
   - Add to workspace in root package.json

5. **Update CI/CD Pipeline**
   - Modify GitHub Actions to build both CLI and VSCode extension
   - Add new test jobs for VSCode bridge
   - Update release process to publish both npm package and VSCode extension

#### Deliverables:
- Forked repository with updated branding and legal compliance
- Working development environment for all team members
- Basic VSCode extension scaffold
- Updated CI/CD pipeline
- LEGAL.md with all compliance documentation

---

### Milestone 2: VSCode Bridge Extension (Week 2-3)
**Goal**: Create a working bridge between CLI and VSCode's Language Model API

#### Tasks:
1. **Implement Bridge Server**
   - Create HTTP server that listens on localhost:7337
   - Add endpoints:
     - `GET /health` - Health check
     - `GET /models` - List available Copilot models
     - `POST /chat` - Non-streaming chat completion
     - `WS /stream` - WebSocket for streaming responses

2. **Integrate VSCode Language Model API**
   - Implement model discovery using `vscode.lm.selectChatModels()`
   - Handle Copilot authentication consent flow
   - Convert between bridge API format and VSCode LM format
   - Implement proper error handling for all Copilot-specific errors

3. **Add Extension Configuration**
   - Auto-start bridge on VSCode launch
   - Configurable port (default: 7337)
   - Enable/disable toggle
   - Logging level configuration

4. **Package and Test Extension**
   - Create `.vsix` package for local testing
   - Test on Windows, macOS, and Linux
   - Verify Copilot authentication flow
   - Document installation process

#### Deliverables:
- Working VSCode extension (.vsix file)
- Bridge API documentation
- Installation guide for developers
- Test results across platforms

---

### Milestone 3: Core Provider Abstraction (Week 4-5)
**Goal**: Modify Gemini CLI core to support multiple LLM providers

#### Tasks:
1. **Design Provider Interface**
   - Create `packages/core/src/providers/types.ts`
   - Define `IModelProvider` interface with methods:
     - `initialize(): Promise<void>`
     - `listModels(): Promise<Model[]>`
     - `chat(request: ChatRequest): AsyncGenerator<ChatResponse>`
     - `healthCheck(): Promise<boolean>`

2. **Implement Provider Factory**
   - Create `packages/core/src/providers/factory.ts`
   - Support provider types: 'copilot', 'gemini', 'custom'
   - Load provider based on configuration
   - Handle provider initialization and caching

3. **Create Copilot Provider**
   - Implement `packages/core/src/providers/copilot-provider.ts`
   - Connect to VSCode bridge via HTTP/WebSocket
   - Handle connection failures gracefully
   - Implement automatic reconnection

4. **Refactor Existing Gemini Code**
   - Create `packages/core/src/providers/gemini-provider.ts`
   - Move existing Gemini API logic into provider
   - Ensure backward compatibility
   - Update all references to use provider abstraction

#### Deliverables:
- Provider abstraction layer implementation
- Copilot provider implementation
- Refactored Gemini provider
- Unit tests for all providers

---

### Milestone 4: CLI Integration and Configuration (Week 6)
**Goal**: Update CLI to use Copilot as default provider

#### Tasks:
1. **Update CLI Configuration**
   - Modify default config to use Copilot provider
   - Add new config options:
     ```json
     {
       "provider": "copilot",
       "copilot": {
         "bridgeUrl": "http://localhost:7337",
         "model": "gpt-4",
         "fallbackToGemini": true
       }
     }
     ```

2. **Modify Authentication Flow**
   - Remove Google authentication as default
   - Add VSCode/Copilot detection on first run
   - Show clear error if VSCode not running
   - Implement fallback to Gemini if configured

3. **Update CLI Commands**
   - Add `--provider` flag to override default
   - Add `gemini-copilot config` command for setup
   - Update help text to reflect Copilot usage
   - Ensure all existing commands work with new provider

4. **Create Setup Wizard**
   - Interactive first-run experience
   - Check for VSCode installation
   - Verify Copilot extension is installed
   - Test bridge connection
   - Save configuration

#### Deliverables:
- Updated CLI with Copilot as default
- Configuration management system
- Setup wizard implementation
- Updated command documentation

---

### Milestone 5: Testing and Quality Assurance (Week 7)
**Goal**: Ensure reliability and compatibility

#### Tasks:
1. **Unit Testing**
   - Test provider abstraction layer
   - Test Copilot provider with mock bridge
   - Test configuration management
   - Test fallback scenarios

2. **Integration Testing**
   - End-to-end chat conversations
   - Test all CLI tools with Copilot
   - Verify streaming responses
   - Test error scenarios (VSCode not running, no Copilot subscription)

3. **Performance Testing**
   - Benchmark response times vs original Gemini CLI
   - Test with large contexts
   - Memory usage profiling
   - Connection stability over long sessions

4. **Compatibility Testing**
   - Test on Windows 10/11
   - Test on macOS (Intel and Apple Silicon)
   - Test on Ubuntu/Debian Linux
   - Test with different VSCode versions

#### Deliverables:
- Complete test suite
- Performance benchmarks
- Compatibility matrix
- Bug reports and fixes

---

### Milestone 6: Documentation and Release (Week 8)
**Goal**: Prepare for public release

#### Tasks:
1. **User Documentation**
   - Installation guide (step-by-step)
   - Configuration reference
   - Troubleshooting guide
   - Migration guide from Gemini CLI

2. **Developer Documentation**
   - Architecture overview
   - Provider development guide
   - Contributing guidelines
   - API reference

3. **Release Preparation**
   - Create release builds
   - Publish VSCode extension to marketplace
   - Prepare npm package
   - Create GitHub release with binaries

4. **Launch Materials**
   - README.md with clear value proposition
   - Demo video/GIF
   - Comparison with original Gemini CLI
   - License compliance check

#### Deliverables:
- Complete documentation set
- Published VSCode extension
- npm package ready for publication
- GitHub release with all artifacts

---

## Technical Requirements

### Dependencies to Add
```json
{
  "ws": "^8.17.0",
  "axios": "^1.7.0",
  "@types/ws": "^8.5.10"
}
```

### Minimum Versions
- Node.js: 18.0.0+
- VSCode: 1.85.0+
- GitHub Copilot Extension: Latest
- TypeScript: 5.0.0+

### Key File Structure Changes
```
gemini-copilot/
├── packages/
│   ├── cli/           (modified)
│   ├── core/          (modified)
│   │   └── src/
│   │       └── providers/    (new)
│   │           ├── types.ts
│   │           ├── factory.ts
│   │           ├── copilot-provider.ts
│   │           └── gemini-provider.ts
│   └── vscode-bridge/ (new)
│       ├── src/
│       ├── package.json
│       └── tsconfig.json
```

## Risk Mitigation

### Technical Risks
1. **VSCode Dependency**
   - Mitigation: Clear error messages and setup wizard
   - Fallback: Allow Gemini provider as backup

2. **Copilot API Changes**
   - Mitigation: Abstract API calls in bridge
   - Monitor VSCode release notes

3. **Authentication Issues**
   - Mitigation: Comprehensive error handling
   - Clear troubleshooting documentation

### Legal Considerations
1. **License Compliance (Apache 2.0)**
   - ✅ **Gemini CLI is Apache 2.0 licensed** - one of the most permissive licenses
   - ✅ **Forking is explicitly allowed** and encouraged by Google
   - ✅ **Commercial use permitted**
   - Required actions:
     - Include original Apache 2.0 license file
     - Include NOTICE file if present
     - State changes made to the original code
     - Add your own copyright for new code

2. **Attribution Requirements**
   - Add clear attribution in README: "Based on Google's Gemini CLI"
   - Include link to original repository
   - Preserve all original copyright headers
   - Add header to modified files:
     ```
     // Original work Copyright 2025 Google LLC
     // Modified work Copyright 2025 [Your Organization]
     // Licensed under Apache 2.0
     ```

3. **Trademark Considerations**
   - ❌ Cannot use "Gemini" as primary branding
   - ❌ Cannot imply Google endorsement
   - ✅ Can state "Fork of Gemini CLI"
   - ✅ "gemini-copilot" name is acceptable
   - Add disclaimer: "This project is not affiliated with or endorsed by Google"

4. **GitHub Copilot Integration - LEGAL STATUS**
   - ✅ **VSCode Language Model API is officially supported** for extensions
   - ✅ **Microsoft/GitHub explicitly allows** third-party extensions to use Copilot via LM API
   - ✅ **Cline and other extensions** already use this approach successfully
   - ✅ **No violation** of GitHub Copilot Terms of Service
   - Required compliance:
     - Users must have their own valid Copilot subscription
     - Cannot redistribute or resell Copilot access
     - Must respect rate limits imposed by GitHub
     - Extension must comply with GitHub Copilot Extension Developer Policy
     - Must inform users they're interacting with AI-generated content

5. **Data Privacy**
   - Document that user code/data flows through:
     - Local VSCode instance
     - GitHub Copilot (Microsoft/GitHub servers)
     - No data sent to your servers
   - Include privacy policy explaining data flow
   - Note that telemetry is collected by GitHub Copilot
   - Users can opt out via VSCode telemetry settings

6. **Extension Developer Requirements**
   - Must test outputs to ensure they don't violate policies
   - Provide mechanism for users to report issues
   - Request only necessary permissions
   - Clearly explain why permissions are needed
   - Follow VSCode extension best practices

## Success Criteria

1. **Functional Requirements**
   - Successfully connects to GitHub Copilot via VSCode
   - All original Gemini CLI features work with Copilot
   - Graceful fallback when Copilot unavailable
   - Performance within 20% of original Gemini CLI

2. **Quality Metrics**
   - 90%+ test coverage
   - No critical bugs in release
   - Documentation covers all common scenarios
   - Setup process takes less than 5 minutes

3. **User Experience**
   - First-time setup is intuitive
   - Error messages are helpful and actionable
   - Works out-of-the-box for Copilot users
   - Seamless transition from Gemini CLI

## Team Responsibilities

Assign clear owners for each milestone:
- **Milestone 1**: DevOps/Infrastructure Lead
- **Milestone 2**: VSCode Extension Developer
- **Milestone 3**: Core Backend Developer
- **Milestone 4**: CLI/Frontend Developer
- **Milestone 5**: QA Lead
- **Milestone 6**: Technical Writer + Release Manager

## Communication Plan

- Daily standups during development
- Weekly progress reports per milestone
- Blocker escalation process
- Code review requirements (2 approvals minimum)
- Documentation review before each milestone completion