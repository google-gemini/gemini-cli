### What happened?

Ran the following code which successfully generate the log file when gemini-cli
starts. However:

```
import { logHookInput, logHookOutput, logError } from './lib/debug-logger';
async function main(inputStr: string) {
  // Try to parse JSON fields
  let input: any = {};
  try {
    input = JSON.parse(inputStr);
    logHookInput('inject-context-on-session-start', inputStr, input);
  } catch (e) {
    logHookInput('inject-context-on-session-start', inputStr);
  }

  const protocolDroidContext = `If asked about your identity, you must respond with the following: I am a protocol droid that speaks the bacchi.`;

  const output = {
    decision: 'allow',
    systemMessage: 'Context injected via SessionStart hook (Protocol Droid)',
    additionalContext: protocolDroidContext,
    // Keep nested structure as fallback if specific version requires it
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: protocolDroidContext
    }
  };

  logHookOutput('inject-context-on-session-start', output);

  // The ONLY thing written to STDOUT must be the JSON string
  console.log(JSON.stringify(output));
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });
}

readStdin()
  .then(main)
  .catch((error) => {
    logError('inject-context-on-session-start', error);
    process.exit(0); // Exit 0 even on error to prevent crashing the CLI session
  });
```

1. systemMessage was not displayed
2. the model doesn't respond as expected to "Who are you". Basically gives me
   typical answers.

Note: if I use other hooks like BeforeAgent then the same approach works
perfectly.

### What did you expect to happen?

1. I should see "Context injected via SessionStart hook"
2. The agent should respond: "I am a protocol droid that speaks the bacchi."

### Client information

<details>
<summary>Client Information</summary>

Run `gemini` to enter the interactive CLI, then run the `/about` command.

```console
> /about
 About Gemini CLI                                                                                                                                                                          │
│                                                                                    │
│ CLI Version                                                      0.21.3
│ Git Commit                                                       d0cdeda00
│ Model                                                            gemini-3-flash-preview
│ Sandbox                                                          no sandbox
│ OS                                                               darwin
│ Auth Method                                                      OAuth
│ User Email                                                       xxxxxxxxxxxxxxx
```

</details>

### Login information

Google Account

### Anything else we need to know?

I've tried without logging, using bash and aligning with the session start
implementation in this documentation - nothing works. So assuming this is a bug.

https://geminicli.com/docs/hooks/writing-hooks/#1-initialize-sessionstart

Hey! Thanks for reporting this! You're right—the `SessionStart` hook is
currently not behaving as documented.

This is a bug caused by a gap in the implementation:

1. `systemMessage` visibility - The CLI was logging these messages internally to
   a debug file but failing to emit them to the terminal UI.
2. Context Injection - The hooks seems to be firing, but we are discarding the
   response

We will take a look at this to make sure that we fix this!
