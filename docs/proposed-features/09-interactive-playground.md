# Feature Proposal: Interactive Playground Mode

## Overview

A safe, sandboxed environment where users can experiment with Gemini CLI features, try challenges, practice prompts, and learn through hands-on coding exercises without risk to their actual projects.

## Problem Statement

Learning by experimentation is risky:
- Fear of breaking real code
- Hesitation to try new features
- No safe space to make mistakes
- Difficult to practice without consequences
- Limited ability to explore "what if" scenarios

New users need:
- Safe environment to experiment
- Structured challenges to build skills
- Immediate feedback on attempts
- Risk-free exploration of features

## Proposed Solution

Implement an Interactive Playground mode with:
- Isolated sandbox environment
- Pre-built coding challenges
- Step-by-step exercises
- Instant validation and feedback
- Progressive difficulty levels
- Integration with learning path

### Core Features

1. **Sandbox Environment**
   - Isolated from real workspace
   - Pre-populated with sample code
   - No risk to actual files
   - Easy reset to start over
   - Multiple environments (Node.js, Python, etc.)

2. **Coding Challenges**
   - Beginner to advanced levels
   - Real-world scenarios
   - Clear objectives and success criteria
   - Hints and solutions
   - XP rewards for completion

3. **Interactive Lessons**
   - Guided exercises with Gemini
   - Learn by doing
   - Immediate feedback
   - Progressive difficulty
   - Multiple learning paths

4. **Experimentation Mode**
   - Try any command safely
   - Explore tool combinations
   - Test prompt variations
   - No consequences for failure
   - Learn from mistakes

### Commands

```bash
/playground                     # Enter playground mode
/playground list                # List available challenges
/playground start <challenge>   # Start a challenge
/playground reset               # Reset playground
/playground hint                # Get a hint
/playground solution            # Show solution
/playground submit              # Submit solution
/playground exit                # Exit playground
/playground create <env>        # Create custom environment
```

### Challenge Categories

#### 1. **Prompt Engineering** (10 challenges)
- Effective prompt writing
- Using context (@files)
- Multi-step requests
- Prompt optimization

#### 2. **File Operations** (8 challenges)
- Reading and editing files
- Batch operations
- Search and replace
- File organization

#### 3. **Code Generation** (12 challenges)
- Write functions
- Generate tests
- Create components
- Refactor code

#### 4. **Debugging** (8 challenges)
- Find bugs in code
- Fix errors
- Analyze stack traces
- Performance issues

#### 5. **Automation** (10 challenges)
- Shell commands
- Workflow creation
- Custom commands
- Integration tasks

#### 6. **Git & Version Control** (6 challenges)
- Commit messages
- Branch management
- Conflict resolution
- Code review

### User Interface

#### Playground Main Menu

```
$ gemini /playground

┌──────────────────────────────────────────────────────────────┐
│                                                              │
│               🎮 Interactive Playground                      │
│                                                              │
│        A safe space to learn and experiment!                 │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Your Progress:                                             │
│  Level: Beginner                      Challenges: 5/54      │
│  ████████░░░░░░░░░░░░░░░░░░░░░░░░░░ 9%                     │
│                                                              │
│  Available Challenges:                                      │
│                                                              │
│  🟢 Beginner (10 challenges)                                │
│   ✓ Your First Prompt                                      │
│   ✓ Using @files                                           │
│   ✓ Basic File Editing                                     │
│   → Write Your First Function    [Start →]                 │
│   🔒 Generate Unit Tests                                    │
│   🔒 Fix a Simple Bug                                       │
│                                                              │
│  🟡 Intermediate (20 challenges) - 🔒 Unlock at Level 2     │
│  🔴 Advanced (15 challenges) - 🔒 Unlock at Level 3         │
│  ⭐ Expert (9 challenges) - 🔒 Unlock at Level 4            │
│                                                              │
│  🎯 Daily Challenge: "Refactor Legacy Code" (+50 XP)       │
│  🏆 Featured: "Build a CLI Tool" (Multi-part challenge)    │
│                                                              │
│  Commands:                                                  │
│  /playground list           Show all challenges            │
│  /playground start <name>   Start a challenge              │
│  /playground create         Create custom sandbox          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### Challenge Interface

```
$ gemini /playground start write-function

┌──────────────────────────────────────────────────────────────┐
│ Challenge: Write Your First Function                         │
│ Difficulty: 🟢 Beginner                    XP Reward: 15     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ Objective:                                                  │
│ Write a function that checks if a number is prime.          │
│                                                              │
│ Requirements:                                               │
│ ✓ Function name: isPrime                                   │
│ ✓ Input: number                                            │
│ ✓ Output: boolean                                          │
│ ✓ Handle edge cases (negative, 0, 1)                       │
│ ✓ Optimize for performance                                 │
│                                                              │
│ Your Sandbox:                                               │
│ 📁 /playground/write-function/                              │
│   ├── solution.ts     (your code here)                     │
│   ├── test.ts         (test cases)                         │
│   └── README.md       (instructions)                       │
│                                                              │
│ Getting Started:                                            │
│ 1. Ask Gemini to help you understand the problem           │
│ 2. Request code generation or write it yourself            │
│ 3. Review and iterate on the solution                      │
│ 4. Run tests to validate: /playground test                 │
│ 5. Submit when ready: /playground submit                   │
│                                                              │
│ Commands:                                                   │
│ /playground hint       Get a hint (3 available)            │
│ /playground test       Run test suite                      │
│ /playground reset      Start over                          │
│ /playground solution   Show reference solution             │
│                                                              │
└──────────────────────────────────────────────────────────────┘

You're now in playground mode. The sandbox is isolated from
your real workspace. Feel free to experiment!

What would you like to do?
```

#### During Challenge

```
> Help me write the isPrime function

Great! Let's break down the problem:

1. A prime number is only divisible by 1 and itself
2. Numbers less than 2 are not prime
3. We only need to check divisors up to √n

Here's an efficient solution:

```typescript
function isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n === 2) return true;
  if (n % 2 === 0) return false;

  for (let i = 3; i * i <= n; i += 2) {
    if (n % i === 0) return false;
  }

  return true;
}
```

I've written this to solution.ts. Let's test it!

> Run the tests

Running test suite...

✓ isPrime(2) returns true
✓ isPrime(3) returns true
✓ isPrime(4) returns false
✓ isPrime(17) returns true
✓ isPrime(100) returns false
✓ Edge case: isPrime(0) returns false
✓ Edge case: isPrime(1) returns false
✓ Edge case: isPrime(-5) returns false
✗ Performance: isPrime(1000000007) takes too long

8/9 tests passed (89%)

💡 Hint: The performance test is failing. Consider optimizing
   your algorithm for very large numbers.

Want to try again or see the solution?

> /playground submit

Submitting your solution...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 Challenge Complete!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Score: 89/100
✓ Correctness: 100% (all test cases pass)
✓ Code Quality: 85% (clean, readable code)
⚠ Performance: 75% (could be optimized further)

Feedback:
• Great job handling edge cases!
• Consider using memoization for repeated calls
• Your algorithm is O(√n) which is good

+15 XP earned! (Total: 35 XP)

What You Learned:
• Prime number algorithms
• Edge case handling
• Performance optimization basics

Next Challenge: "Generate Unit Tests" (unlocked!)

[N] Next Challenge  [R] Retry for better score  [M] Main Menu
```

### Challenge Definitions

```yaml
# playground/challenges/beginner/write-function.yaml
id: write-function
title: Write Your First Function
category: code-generation
difficulty: beginner
xp: 15
estimated_time: "10-15 minutes"

description: |
  Learn to use Gemini CLI for code generation by writing a
  function that checks if a number is prime.

objectives:
  - Generate working code with Gemini's help
  - Handle edge cases properly
  - Write performant solutions
  - Validate with test cases

sandbox:
  environment: typescript
  files:
    - path: solution.ts
      template: |
        // Write your isPrime function here

    - path: test.ts
      content: |
        import { isPrime } from './solution';

        const tests = [
          { input: 2, expected: true },
          { input: 3, expected: true },
          { input: 4, expected: false },
          // ... more tests
        ];

    - path: README.md
      content: |
        # Prime Number Checker

        Write a function that determines if a number is prime.

hints:
  - text: "A prime number is only divisible by 1 and itself"
    unlocks_after: 5  # minutes

  - text: "You only need to check divisors up to √n"
    unlocks_after: 10

  - text: "Handle the special cases: n < 2, n === 2, even numbers"
    unlocks_after: 15

solution:
  code: |
    function isPrime(n: number): boolean {
      if (n < 2) return false;
      if (n === 2) return true;
      if (n % 2 === 0) return false;

      for (let i = 3; i * i <= n; i += 2) {
        if (n % i === 0) return false;
      }

      return true;
    }

  explanation: |
    This solution efficiently checks primality by:
    1. Handling edge cases first (n < 2, n === 2)
    2. Eliminating even numbers quickly
    3. Only checking odd divisors up to √n

validation:
  tests:
    - input: [2, 3, 17, 97]
      expected: true
      points: 25

    - input: [0, 1, 4, 100]
      expected: false
      points: 25

    - input: [-5, -1]
      expected: false
      points: 20
      description: "Edge cases: negative numbers"

    - input: [1000000007]
      expected: true
      points: 30
      description: "Performance: large prime"
      timeout: 1000  # ms

success_criteria:
  minimum_score: 70
  required_tests: ["edge-cases", "basic-functionality"]

rewards:
  xp: 15
  unlocks:
    - challenge: generate-tests
    - achievement: first-function

tags:
  - functions
  - algorithms
  - testing
  - code-generation
```

### Sandbox Implementation

```typescript
// packages/core/src/playground/sandbox.ts
export class PlaygroundSandbox {
  private sandboxDir: string;
  private originalCwd: string;

  async create(environment: SandboxEnvironment): Promise<void> {
    // Create isolated directory
    this.sandboxDir = await this.createTempDirectory();
    this.originalCwd = process.cwd();

    // Set up environment
    await this.setupEnvironment(environment);

    // Change to sandbox
    process.chdir(this.sandboxDir);
  }

  private async setupEnvironment(
    env: SandboxEnvironment
  ): Promise<void> {
    switch (env.type) {
      case 'typescript':
        await this.setupTypeScript();
        break;
      case 'python':
        await this.setupPython();
        break;
      case 'node':
        await this.setupNode();
        break;
    }

    // Copy template files
    for (const file of env.files) {
      await this.writeFile(file.path, file.content);
    }
  }

  async executeCode(): Promise<ExecutionResult> {
    // Run code in isolated environment
    // Capture output, errors, performance
  }

  async runTests(): Promise<TestResult[]> {
    // Run test suite
    // Validate against expected results
  }

  async reset(): Promise<void> {
    // Clear all changes
    // Restore initial state
  }

  async destroy(): Promise<void> {
    // Return to original directory
    process.chdir(this.originalCwd);

    // Clean up sandbox
    await fs.remove(this.sandboxDir);
  }
}
```

### Challenge Engine

```typescript
// packages/core/src/playground/challenge-engine.ts
export class ChallengeEngine {
  async startChallenge(
    challengeId: string
  ): Promise<ChallengeSession> {
    const challenge = await this.loadChallenge(challengeId);

    // Create sandbox
    const sandbox = new PlaygroundSandbox();
    await sandbox.create(challenge.sandbox);

    // Initialize session
    const session: ChallengeSession = {
      id: generateId(),
      challengeId,
      startedAt: new Date(),
      sandbox,
      hintsUsed: 0,
      attempts: 0,
      status: 'in-progress'
    };

    // Show challenge
    await this.displayChallenge(challenge);

    return session;
  }

  async submitSolution(
    session: ChallengeSession
  ): Promise<ChallengeResult> {
    const challenge = await this.loadChallenge(session.challengeId);

    // Run validation
    const results = await session.sandbox.runTests();

    // Calculate score
    const score = this.calculateScore(results, challenge.validation);

    // Check success criteria
    const passed = score >= challenge.success_criteria.minimum_score;

    if (passed) {
      // Award XP
      await this.awardXP(challenge.rewards.xp);

      // Unlock next challenges
      await this.unlockChallenges(challenge.rewards.unlocks);
    }

    return {
      passed,
      score,
      results,
      feedback: this.generateFeedback(results, challenge)
    };
  }

  async provideHint(
    session: ChallengeSession
  ): Promise<string> {
    const challenge = await this.loadChallenge(session.challengeId);
    const elapsed = Date.now() - session.startedAt.getTime();

    // Find available hints
    const availableHints = challenge.hints.filter(
      h => elapsed >= h.unlocks_after * 60 * 1000
    );

    if (session.hintsUsed >= availableHints.length) {
      return 'No more hints available!';
    }

    const hint = availableHints[session.hintsUsed];
    session.hintsUsed++;

    return hint.text;
  }
}
```

## User Benefits

### Safe Learning
- Experiment without fear
- Make mistakes safely
- Try new features risk-free
- Build confidence through practice

### Structured Practice
- Progressive difficulty
- Clear objectives
- Immediate feedback
- Guided learning path

### Skill Development
- Hands-on coding practice
- Real-world scenarios
- Problem-solving skills
- Best practices reinforcement

### Gamification
- XP rewards
- Achievement unlocks
- Progress tracking
- Competitive elements (leaderboards)

## Technical Implementation

### Directory Structure
```
packages/core/src/playground/
├── index.ts                # Playground manager
├── sandbox.ts             # Sandbox environment
├── challenge-engine.ts    # Challenge logic
├── validator.ts           # Solution validation
├── scorer.ts             # Scoring system
├── challenges/
│   ├── loader.ts
│   ├── beginner/
│   ├── intermediate/
│   ├── advanced/
│   └── expert/
└── environments/
    ├── typescript.ts
    ├── python.ts
    ├── node.ts
    └── go.ts
```

## Integration Points

### With Existing Features
- **Sandboxing**: Use existing sandbox infrastructure
- **Tools**: All tools available in playground
- **Checkpointing**: Save playground progress

### With Proposed Features
- **Learning Path**: Award XP for challenges
- **Tutorial**: Link to playground exercises
- **Examples**: Use examples in challenges
- **Achievements**: Unlock achievements for challenges

## Success Metrics

- Challenge completion rate
- Time spent in playground
- User skill improvement
- Feature adoption after playground
- User satisfaction scores
- Return rate to playground

## Implementation Phases

### Phase 1: Core Infrastructure (3 weeks)
- Sandbox environment
- Basic challenge engine
- 10 beginner challenges
- Simple validation

### Phase 2: Challenge Expansion (3 weeks)
- 30 more challenges
- Multiple environments
- Hint system
- Better feedback

### Phase 3: Advanced Features (2 weeks)
- Daily challenges
- Custom sandboxes
- Leaderboards
- Share solutions

### Phase 4: Polish (1 week)
- UI improvements
- Performance optimization
- Documentation
- User testing

## Open Questions

1. Allow user-created challenges?
2. Multiplayer/competitive challenges?
3. Integration with coding platforms (LeetCode, HackerRank)?
4. Video walkthroughs for challenges?

## Resources Required

- **Development**: 2 engineers, 9 weeks
- **Content**: Create 50+ challenges
- **Testing**: User testing with learners
- **Infrastructure**: Sandbox isolation

## Alternatives Considered

1. **External Platform**: Less integrated
2. **Documentation Only**: Not interactive
3. **Video Tutorials**: Passive learning

## Related Work

- LeetCode / HackerRank (coding challenges)
- Codecademy (interactive learning)
- Exercism (practice exercises)
- Katacoda (interactive tutorials)

## Future Enhancements

- Multiplayer challenges
- Community challenges
- Challenge marketplace
- Video solutions
- Live coding sessions
- Integration with online judges
- Certificate system

## Conclusion

Interactive Playground Mode provides a safe, engaging space for users to build skills through practice. By combining challenges, sandboxing, and gamification, we create an effective learning environment that accelerates skill development.

**Recommendation**: Medium-high priority for education-focused users. This feature significantly enhances the learning experience and provides unique value proposition compared to other CLI tools.
