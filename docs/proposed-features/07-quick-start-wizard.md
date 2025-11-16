# Feature Proposal: Quick Start Wizard

## Overview

An interactive first-run wizard that guides new users through initial setup, authentication, and personalization in under 5 minutes, ensuring they're ready to be productive immediately.

## Problem Statement

First-time users face multiple barriers:
- Complex authentication setup (OAuth, API keys, Vertex AI)
- Unclear which authentication method to choose
- Don't know how to configure for their workflow
- Overwhelmed by configuration options
- Miss important initial setup steps
- Uncertainty about trusted folders and permissions

This results in:
- Abandoned installations
- Suboptimal configurations
- Security issues (overly permissive settings)
- Frustration and support requests

## Proposed Solution

Implement an interactive Quick Start Wizard that runs on first launch (or via `/quickstart`) to guide users through essential setup with smart defaults and clear explanations.

### Core Features

1. **Progressive Setup Flow**
   - Welcome & overview
   - Authentication method selection
   - Authentication setup
   - Workspace configuration
   - Permissions & trust settings
   - Personalization
   - First task walkthrough

2. **Smart Recommendations**
   - Detect use case (personal, team, enterprise)
   - Suggest optimal authentication method
   - Recommend settings based on context
   - Auto-detect project directories

3. **Validation & Testing**
   - Test authentication immediately
   - Verify permissions
   - Confirm setup with simple test task
   - Provide troubleshooting if issues

4. **Skip & Resume**
   - Allow skipping optional steps
   - Resume interrupted setup
   - Re-run specific sections
   - Update configuration later

### Wizard Flow

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│              Welcome to Gemini CLI! ✨                       │
│                                                              │
│     Your AI assistant for coding, automation,                │
│           and workflow enhancement                           │
│                                                              │
│  This quick setup wizard will help you get started           │
│  in under 5 minutes.                                         │
│                                                              │
│  Press Enter to begin, or type 'skip' to use defaults       │
│                                                              │
└──────────────────────────────────────────────────────────────┘

[Enter]

┌──────────────────────────────────────────────────────────────┐
│ Step 1 of 6: Authentication Setup                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ Choose your authentication method:                          │
│                                                              │
│ ▸ 1. Google Login (OAuth) - Recommended for individuals     │
│     • Free tier: 60 requests/min, 1,000/day                │
│     • No API key needed                                     │
│     • Quick setup (1 click)                                 │
│                                                              │
│   2. Gemini API Key - For developers                        │
│     • Free tier: 100 requests/day                          │
│     • Requires AI Studio account                           │
│     • More control over usage                              │
│                                                              │
│   3. Vertex AI - For teams/enterprise                       │
│     • Scalable, production-ready                           │
│     • Requires Google Cloud account                        │
│     • Compliance features                                  │
│                                                              │
│ ? What's your use case? [1-3]: _                            │
│                                                              │
│ Need help deciding? Type 'help'                             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### Step 1: Authentication

**For OAuth:**
```
┌──────────────────────────────────────────────────────────────┐
│ Google Login Setup                                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ I'll open your browser to log in with Google.               │
│                                                              │
│ Your browser will open automatically in 3 seconds...        │
│                                                              │
│ If it doesn't open, visit:                                  │
│ https://accounts.google.com/o/oauth2/auth?client_id=...     │
│                                                              │
│ Waiting for authentication... ⏳                             │
│                                                              │
└──────────────────────────────────────────────────────────────┘

[User logs in via browser]

┌──────────────────────────────────────────────────────────────┐
│ ✅ Authentication Successful!                                 │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ Logged in as: [email protected]                      │
│ Free tier limits:                                           │
│  • 60 requests per minute                                   │
│  • 1,000 requests per day                                   │
│                                                              │
│ Testing connection... ✓                                     │
│ Access to Gemini 2.5 Pro confirmed ✓                        │
│                                                              │
│ Press Enter to continue                                     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**For API Key:**
```
┌──────────────────────────────────────────────────────────────┐
│ API Key Setup                                                │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ You'll need an API key from Google AI Studio:               │
│                                                              │
│ 1. Visit: https://aistudio.google.com/apikey                │
│ 2. Create new API key                                       │
│ 3. Copy the key                                             │
│                                                              │
│ [O] Open AI Studio in browser                               │
│ [C] Continue with existing key                              │
│ [H] Help with API keys                                      │
│                                                              │
│ Choice [O/C/H]: _                                           │
│                                                              │
└──────────────────────────────────────────────────────────────┘

[User selects C]

┌──────────────────────────────────────────────────────────────┐
│ Enter your Gemini API key:                                   │
│                                                              │
│ Key: ____________________________________                    │
│                                                              │
│ Your key will be securely stored in:                        │
│ ~/.gemini/config.json                                       │
│                                                              │
│ Validating key... ✓                                         │
│ API key is valid and working!                              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### Step 2: Workspace Setup

```
┌──────────────────────────────────────────────────────────────┐
│ Step 2 of 6: Workspace Configuration                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ Where do you want to use Gemini CLI?                        │
│                                                              │
│ I detected these directories:                               │
│                                                              │
│ [x] ~/projects/my-app (current directory)                   │
│ [ ] ~/projects/client-work                                  │
│ [ ] ~/Documents/code                                        │
│                                                              │
│ [Space] to select  [Enter] to continue  [A] Add custom      │
│                                                              │
│ 💡 You can add more directories later with /directory add   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### Step 3: Trust & Permissions

```
┌──────────────────────────────────────────────────────────────┐
│ Step 3 of 6: Safety & Permissions                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ Gemini CLI needs permission to read/write files and run     │
│ shell commands in your workspace.                           │
│                                                              │
│ Security options:                                           │
│                                                              │
│ ▸ 1. Confirm before changes (Recommended)                   │
│     • Ask before writing files                             │
│     • Confirm shell commands                               │
│     • Safe for beginners                                   │
│                                                              │
│   2. Trust this directory                                   │
│     • Automatic file operations                            │
│     • Faster workflow                                      │
│     • For experienced users                                │
│                                                              │
│   3. Custom permissions                                     │
│     • Granular control                                     │
│     • Advanced users                                       │
│                                                              │
│ ? Choose security level [1-3]: _                            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### Step 4: Personalization

```
┌──────────────────────────────────────────────────────────────┐
│ Step 4 of 6: Personalize Your Experience                    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ What would you like to use Gemini CLI for? (Select all)     │
│                                                              │
│ [x] Code writing & debugging                                │
│ [x] Learning & understanding code                           │
│ [ ] Automation & scripting                                  │
│ [ ] Documentation                                           │
│ [ ] Code review                                             │
│ [ ] Testing                                                 │
│                                                              │
│ This helps me suggest relevant features and examples.       │
│                                                              │
│ [Space] toggle  [Enter] continue  [S] Skip                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### Step 5: Optional Features

```
┌──────────────────────────────────────────────────────────────┐
│ Step 5 of 6: Optional Features                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ Enable these helpful features?                              │
│                                                              │
│ [x] Explain Mode - Learn as you use (recommended)           │
│     Shows what Gemini is doing and why                      │
│                                                              │
│ [x] Smart Suggestions - Context-aware tips                  │
│     Suggests commands based on your workflow                │
│                                                              │
│ [x] Learning Path - Track your progress                     │
│     Gamified learning with achievements                     │
│                                                              │
│ [ ] Telemetry - Help improve Gemini CLI                     │
│     Anonymous usage data (opt-in, privacy-first)            │
│                                                              │
│ [Space] toggle  [Enter] continue                            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### Step 6: Try It Out

```
┌──────────────────────────────────────────────────────────────┐
│ Step 6 of 6: Let's Try It!                                  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ ✅ Setup complete! Now let's try a simple task.              │
│                                                              │
│ I'll help you with a quick example. Choose one:             │
│                                                              │
│ 1. Explain a file in your project                          │
│ 2. Generate a git commit message                           │
│ 3. Create a README file                                     │
│ 4. Answer a coding question                                │
│ 5. Skip to free exploration                                │
│                                                              │
│ ? What would you like to try? [1-5]: _                      │
│                                                              │
└──────────────────────────────────────────────────────────────┘

[User selects 1]

Great! Let me find a file in your project...

Found: src/app.ts

I'll explain what this file does:

[Gemini explains the file with Explain Mode enabled]

┌──────────────────────────────────────────────────────────────┐
│ 🎉 You're all set!                                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ Your Gemini CLI is ready to use!                            │
│                                                              │
│ Quick Reference:                                            │
│  • /help - Show all commands                                │
│  • /examples - Browse examples                              │
│  • /tutorial - Interactive tutorials                        │
│  • @file.ts - Include files in prompts                      │
│  • /settings - Adjust configuration                         │
│                                                              │
│ Next Steps:                                                 │
│  1. Try the interactive tutorial: /tutorial                 │
│  2. Browse examples: /examples                              │
│  3. Check out the learning path: /learn                     │
│                                                              │
│ Need help? Type /help anytime!                              │
│                                                              │
│ Press Enter to start using Gemini CLI                       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Commands

```bash
/quickstart               # Run quick start wizard
/quickstart auth          # Re-run authentication setup
/quickstart workspace     # Re-run workspace setup
/quickstart permissions   # Re-run permissions setup
/quickstart reset         # Reset all settings and re-run
/quickstart status        # Show setup status
```

## Technical Implementation

### Directory Structure
```
packages/cli/src/quickstart/
├── index.ts                # Wizard orchestrator
├── steps/
│   ├── welcome.ts
│   ├── authentication.ts
│   ├── workspace.ts
│   ├── permissions.ts
│   ├── personalization.ts
│   ├── features.ts
│   └── first-task.ts
├── validators/
│   ├── auth-validator.ts
│   ├── permission-validator.ts
│   └── workspace-validator.ts
├── ui/
│   ├── prompts.ts          # Interactive prompts
│   ├── progress.ts         # Progress indicators
│   └── formatters.ts       # Output formatting
└── config/
    ├── defaults.ts         # Default configurations
    └── presets.ts          # Preset configurations
```

### Wizard State Management

```typescript
// packages/cli/src/quickstart/index.ts
interface WizardState {
  currentStep: number;
  totalSteps: number;
  completed: boolean;
  skipped: string[];
  config: {
    authMethod?: 'oauth' | 'api-key' | 'vertex';
    workspace?: string[];
    trustLevel?: 'confirm' | 'trusted' | 'custom';
    useCases?: string[];
    features?: {
      explainMode?: boolean;
      suggestions?: boolean;
      learningPath?: boolean;
      telemetry?: boolean;
    };
  };
}

export class QuickStartWizard {
  private state: WizardState;

  async run(): Promise<void> {
    await this.showWelcome();

    const steps = [
      this.setupAuthentication,
      this.setupWorkspace,
      this.setupPermissions,
      this.setupPersonalization,
      this.setupFeatures,
      this.runFirstTask
    ];

    for (let i = 0; i < steps.length; i++) {
      this.state.currentStep = i + 1;
      await this.showProgress();

      const result = await steps[i].call(this);

      if (result === 'skip') {
        this.state.skipped.push(steps[i].name);
      } else if (result === 'back' && i > 0) {
        i -= 2; // Go back one step
      } else if (result === 'quit') {
        await this.savePartialState();
        return;
      }
    }

    await this.complete();
  }

  private async setupAuthentication(): Promise<'continue' | 'skip' | 'back'> {
    const choice = await this.promptAuthMethod();

    switch (choice) {
      case 'oauth':
        await this.setupOAuth();
        break;
      case 'api-key':
        await this.setupApiKey();
        break;
      case 'vertex':
        await this.setupVertexAI();
        break;
    }

    // Validate authentication
    const isValid = await this.validateAuth();

    if (!isValid) {
      const retry = await confirm('Authentication failed. Try again?');
      if (retry) {
        return this.setupAuthentication(); // Retry
      }
    }

    return 'continue';
  }

  private async setupWorkspace(): Promise<'continue' | 'skip' | 'back'> {
    // Auto-detect potential workspaces
    const detected = await this.detectWorkspaces();

    const selected = await checkbox({
      message: 'Select workspace directories:',
      choices: detected.map(d => ({
        name: d.path,
        value: d.path,
        checked: d.isCurrent
      }))
    });

    this.state.config.workspace = selected;

    // Initialize GEMINI.md if needed
    for (const workspace of selected) {
      const hasGeminiMd = await exists(path.join(workspace, 'GEMINI.md'));

      if (!hasGeminiMd) {
        const create = await confirm(`Create GEMINI.md in ${workspace}?`);
        if (create) {
          await this.initializeGeminiMd(workspace);
        }
      }
    }

    return 'continue';
  }

  private async complete(): Promise<void> {
    // Save configuration
    await this.saveConfig();

    // Show completion
    await this.showCompletion();

    // Set first-run flag
    await this.markFirstRunComplete();
  }
}
```

### Smart Defaults

```typescript
// packages/cli/src/quickstart/config/defaults.ts
export class DefaultConfigProvider {
  getRecommendedAuth(context: Context): AuthMethod {
    // Individual developers -> OAuth (easiest)
    if (context.isPersonalUse) {
      return 'oauth';
    }

    // Team with existing Google Cloud -> Vertex AI
    if (context.hasGoogleCloudAccess) {
      return 'vertex';
    }

    // Default to API key
    return 'api-key';
  }

  getRecommendedTrustLevel(context: Context): TrustLevel {
    // New users -> Confirm everything
    if (context.isFirstTime) {
      return 'confirm';
    }

    // Experienced users in personal projects -> Trust
    if (context.isPersonalProject && context.userLevel > 2) {
      return 'trusted';
    }

    return 'confirm';
  }

  getRecommendedFeatures(useCases: string[]): FeatureConfig {
    return {
      explainMode: useCases.includes('learning'),
      suggestions: true, // Always on
      learningPath: useCases.includes('learning'),
      telemetry: false // Opt-in only
    };
  }
}
```

### Workspace Detection

```typescript
// packages/cli/src/quickstart/workspace-detector.ts
export class WorkspaceDetector {
  async detectWorkspaces(): Promise<WorkspaceInfo[]> {
    const workspaces: WorkspaceInfo[] = [];

    // Current directory
    const cwd = process.cwd();
    workspaces.push({
      path: cwd,
      isCurrent: true,
      type: await this.detectProjectType(cwd),
      hasGit: await this.isGitRepo(cwd)
    });

    // Common workspace locations
    const commonPaths = [
      path.join(os.homedir(), 'projects'),
      path.join(os.homedir(), 'code'),
      path.join(os.homedir(), 'workspace'),
      path.join(os.homedir(), 'Documents', 'code')
    ];

    for (const common of commonPaths) {
      if (await exists(common) && common !== cwd) {
        const subdirs = await this.getSubdirectories(common);

        for (const subdir of subdirs.slice(0, 5)) { // Limit to 5
          workspaces.push({
            path: subdir,
            isCurrent: false,
            type: await this.detectProjectType(subdir),
            hasGit: await this.isGitRepo(subdir)
          });
        }
      }
    }

    return workspaces;
  }

  private async detectProjectType(dir: string): Promise<string> {
    if (await exists(path.join(dir, 'package.json'))) return 'node';
    if (await exists(path.join(dir, 'pyproject.toml'))) return 'python';
    if (await exists(path.join(dir, 'Cargo.toml'))) return 'rust';
    if (await exists(path.join(dir, 'go.mod'))) return 'go';
    return 'unknown';
  }
}
```

## Integration Points

### With Existing Features
- **Authentication**: Set up auth method
- **Settings**: Initialize configuration
- **Directory Management**: Set up workspaces
- **GEMINI.md**: Initialize context files

### With Proposed Features
- **Tutorial**: Suggest tutorial after setup
- **Learning Path**: Initialize learning tracking
- **Explain Mode**: Enable by default for beginners
- **Examples**: Show relevant examples based on use case

## User Benefits

### Reduced Friction
- No confusion about authentication
- Clear setup path
- Working configuration in minutes
- Confidence to start using immediately

### Better Configuration
- Optimal settings for use case
- Security best practices by default
- Appropriate permissions
- No overwhelming options

### Faster Time-to-Value
- Productive within 5 minutes
- First success before completion
- Clear next steps
- Reduced abandonment

## Success Metrics

- Setup completion rate (% who finish wizard)
- Time to first successful task
- Authentication success rate
- Configuration optimality score
- Support tickets for setup issues (reduction)
- User satisfaction with onboarding

## Implementation Phases

### Phase 1: Core Wizard (2 weeks)
- Basic flow and UI
- Authentication setup
- Workspace configuration
- Config persistence

### Phase 2: Smart Features (2 weeks)
- Auto-detection
- Smart defaults
- Validation & testing
- Error recovery

### Phase 3: Personalization (1 week)
- Use case detection
- Feature recommendations
- First task walkthrough
- Completion celebration

### Phase 4: Polish (1 week)
- UI/UX refinement
- Help content
- Documentation
- A/B testing

## Open Questions

1. Skip wizard entirely for advanced users?
2. Different wizard variants for different use cases?
3. Team/enterprise-specific wizard features?
4. Update wizard for new features in future releases?

## Resources Required

- **Development**: 1-2 engineers, 6 weeks
- **UX Design**: Wizard flow and UI
- **Content**: Help text and explanations
- **Testing**: User testing with new users

## Alternatives Considered

1. **CLI Flags Only**: Less guided, easy to make mistakes
2. **Interactive Config File**: Too technical for beginners
3. **Web-based Setup**: Context switching, not integrated

## Related Work

- npm init / create-react-app
- git config --global
- VS Code welcome flow
- Heroku CLI onboarding

## Future Enhancements

- Team setup wizard (multi-user)
- Project-specific wizards
- Integration wizard for IDEs
- Update wizard for new versions
- Wizard for specific workflows (CI/CD, deployment)

## Conclusion

The Quick Start Wizard dramatically reduces onboarding friction by providing a guided, intelligent setup experience. By making the first 5 minutes delightful and productive, we significantly improve conversion from installation to active use.

**Recommendation**: Highest priority for new user acquisition and retention. This is the first impression and directly impacts all other metrics. Should be implemented before or alongside other educational features.
