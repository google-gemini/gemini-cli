# Writing hooks for Gemini CLI

This guide will walk you through creating hooks for Gemini CLI, from a simple
logging hook to a comprehensive workflow assistant that demonstrates all hook
events working together.

## Prerequisites

Before you start, make sure you have:

- Gemini CLI installed and configured
- Basic understanding of shell scripting or JavaScript/Node.js
- Familiarity with JSON for hook input/output

## Quick start

Let's create a simple hook that logs all tool executions to understand the
basics.

### Step 1: Create your hook script

Create a directory for hooks and a simple logging script:

```bash
mkdir -p .gemini/hooks
cat > .gemini/hooks/log-tools.sh << 'EOF'
#!/usr/bin/env bash
# Read hook input from stdin
input=$(cat)

# Extract tool name
tool_name=$(echo "$input" | jq -r '.tool_name')

# Log to file
echo "[$(date)] Tool executed: $tool_name" >> .gemini/tool-log.txt

# Return success (exit 0) - output goes to user in transcript mode
echo "Logged: $tool_name"
EOF

chmod +x .gemini/hooks/log-tools.sh
```

### Step 2: Configure the hook

Add the hook configuration to `.gemini/settings.json`:

```json
{
  "hooks": {
    "AfterTool": [
      {
        "matcher": "*",
        "hooks": [
          {
            "name": "tool-logger",
            "type": "command",
            "command": "$GEMINI_PROJECT_DIR/.gemini/hooks/log-tools.sh",
            "description": "Log all tool executions"
          }
        ]
      }
    ]
  }
}
```

### Step 3: Test your hook

Run Gemini CLI and execute any command that uses tools:

```
> Read the README.md file

[Agent uses read_file tool]

Logged: read_file
```

Check `.gemini/tool-log.txt` to see the logged tool executions.

## Practical examples

### Security: Block secrets in commits

Prevent committing files containing API keys or passwords.

**`.gemini/hooks/block-secrets.sh`:**

```bash
#!/usr/bin/env bash
input=$(cat)

# Extract content being written
content=$(echo "$input" | jq -r '.tool_input.content // .tool_input.new_string // ""')

# Check for secrets
if echo "$content" | grep -qE 'api[_-]?key|password|secret'; then
  echo '{"decision":"deny","reason":"Potential secret detected"}' >&2
  exit 2
fi

exit 0
```

**`.gemini/settings.json`:**

```json
{
  "hooks": {
    "BeforeTool": [
      {
        "matcher": "write_file|replace",
        "hooks": [
          {
            "name": "secret-scanner",
            "type": "command",
            "command": "$GEMINI_PROJECT_DIR/.gemini/hooks/block-secrets.sh",
            "description": "Prevent committing secrets"
          }
        ]
      }
    ]
  }
}
```

### Auto-testing after code changes

Automatically run tests when code files are modified.

**`.gemini/hooks/auto-test.sh`:**

```bash
#!/usr/bin/env bash
input=$(cat)

file_path=$(echo "$input" | jq -r '.tool_input.file_path')

# Only test .ts files
if [[ ! "$file_path" =~ \.ts$ ]]; then
  exit 0
fi

# Find corresponding test file
test_file="${file_path%.ts}.test.ts"

if [ ! -f "$test_file" ]; then
  echo "⚠️ No test file found"
  exit 0
fi

# Run tests
if npx vitest run "$test_file" --silent 2>&1 | head -20; then
  echo "✅ Tests passed"
else
  echo "❌ Tests failed"
fi

exit 0
```

**`.gemini/settings.json`:**

```json
{
  "hooks": {
    "AfterTool": [
      {
        "matcher": "write_file|replace",
        "hooks": [
          {
            "name": "auto-test",
            "type": "command",
            "command": "$GEMINI_PROJECT_DIR/.gemini/hooks/auto-test.sh",
            "description": "Run tests after code changes"
          }
        ]
      }
    ]
  }
}
```

### Dynamic context injection

Add relevant project context before each agent interaction.

**`.gemini/hooks/inject-context.sh`:**

```bash
#!/usr/bin/env bash

# Get recent git commits for context
context=$(git log -5 --oneline 2>/dev/null || echo "No git history")

# Return as JSON
cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "BeforeAgent",
    "additionalContext": "Recent commits:\n$context"
  }
}
EOF
```

**`.gemini/settings.json`:**

```json
{
  "hooks": {
    "BeforeAgent": [
      {
        "matcher": "*",
        "hooks": [
          {
            "name": "git-context",
            "type": "command",
            "command": "$GEMINI_PROJECT_DIR/.gemini/hooks/inject-context.sh",
            "description": "Inject git commit history"
          }
        ]
      }
    ]
  }
}
```

## Advanced features

### RAG-based tool filtering

Use `BeforeToolSelection` to intelligently reduce the tool space based on the
current task. Instead of sending all 100+ tools to the model, filter to the most
relevant ~15 tools using semantic search or keyword matching.

This improves:

- **Model accuracy:** Fewer similar tools reduce confusion
- **Response speed:** Smaller tool space is faster to process
- **Cost efficiency:** Less tokens used per request

### Cross-session memory

Use `SessionStart` and `SessionEnd` hooks to maintain persistent knowledge
across sessions:

- **SessionStart:** Load relevant memories from previous sessions
- **AfterModel:** Record important interactions during the session
- **SessionEnd:** Extract learnings and store for future use

This enables the assistant to learn project conventions, remember important
decisions, and share knowledge across team members.

### Hook chaining

Multiple hooks for the same event run in the order declared. Each hook can build
upon previous hooks' outputs:

```json
{
  "hooks": {
    "BeforeAgent": [
      {
        "matcher": "*",
        "hooks": [
          {
            "name": "load-memories",
            "type": "command",
            "command": "./hooks/load-memories.sh"
          },
          {
            "name": "analyze-sentiment",
            "type": "command",
            "command": "./hooks/analyze-sentiment.sh"
          }
        ]
      }
    ]
  }
}
```

## Complete example: Smart Development Workflow Assistant

This comprehensive example demonstrates all hook events working together with
two advanced features:

- **RAG-based tool selection:** Reduces 100+ tools to ~15 relevant ones per task
- **Cross-session memory:** Learns and persists project knowledge

### Architecture

```
SessionStart → Initialize memory & index tools
     ↓
BeforeAgent → Inject relevant memories
     ↓
BeforeModel → Add system instructions
     ↓
BeforeToolSelection → Filter tools via RAG
     ↓
BeforeTool → Validate security
     ↓
AfterTool → Run auto-tests
     ↓
AfterModel → Record interaction
     ↓
SessionEnd → Extract and store memories
```

### Installation

**Prerequisites:**

- Node.js 18+
- Gemini CLI installed

**Setup:**

```bash
# Create hooks directory
mkdir -p .gemini/hooks .gemini/memory

# Install dependencies
npm install --save-dev chromadb @google/generative-ai

# Copy hook scripts (shown below)
# Make them executable
chmod +x .gemini/hooks/*.js
```

### Configuration

**`.gemini/settings.json`:**

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "name": "init-assistant",
            "type": "command",
            "command": "node $GEMINI_PROJECT_DIR/.gemini/hooks/init.js",
            "description": "Initialize Smart Workflow Assistant"
          }
        ]
      }
    ],
    "BeforeAgent": [
      {
        "matcher": "*",
        "hooks": [
          {
            "name": "inject-memories",
            "type": "command",
            "command": "node $GEMINI_PROJECT_DIR/.gemini/hooks/inject-memories.js",
            "description": "Inject relevant project memories"
          }
        ]
      }
    ],
    "BeforeToolSelection": [
      {
        "matcher": "*",
        "hooks": [
          {
            "name": "rag-filter",
            "type": "command",
            "command": "node $GEMINI_PROJECT_DIR/.gemini/hooks/rag-filter.js",
            "description": "Filter tools using RAG"
          }
        ]
      }
    ],
    "BeforeTool": [
      {
        "matcher": "write_file|replace",
        "hooks": [
          {
            "name": "security-check",
            "type": "command",
            "command": "node $GEMINI_PROJECT_DIR/.gemini/hooks/security.js",
            "description": "Prevent committing secrets"
          }
        ]
      }
    ],
    "AfterTool": [
      {
        "matcher": "write_file|replace",
        "hooks": [
          {
            "name": "auto-test",
            "type": "command",
            "command": "node $GEMINI_PROJECT_DIR/.gemini/hooks/auto-test.js",
            "description": "Run tests after code changes"
          }
        ]
      }
    ],
    "AfterModel": [
      {
        "matcher": "*",
        "hooks": [
          {
            "name": "record-interaction",
            "type": "command",
            "command": "node $GEMINI_PROJECT_DIR/.gemini/hooks/record.js",
            "description": "Record interaction for learning"
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "matcher": "exit|logout",
        "hooks": [
          {
            "name": "consolidate-memories",
            "type": "command",
            "command": "node $GEMINI_PROJECT_DIR/.gemini/hooks/consolidate.js",
            "description": "Extract and store session learnings"
          }
        ]
      }
    ]
  }
}
```

### Hook scripts

#### 1. Initialize (SessionStart)

**`.gemini/hooks/init.js`:**

```javascript
#!/usr/bin/env node
const { ChromaClient } = require('chromadb');
const path = require('path');
const fs = require('fs');

async function main() {
  const projectDir = process.env.GEMINI_PROJECT_DIR;
  const chromaPath = path.join(projectDir, '.gemini', 'chroma');

  // Ensure chroma directory exists
  fs.mkdirSync(chromaPath, { recursive: true });

  const client = new ChromaClient({ path: chromaPath });

  // Initialize memory collection
  await client.getOrCreateCollection({
    name: 'project_memories',
    metadata: { 'hnsw:space': 'cosine' },
  });

  // Count existing memories
  const collection = await client.getCollection({ name: 'project_memories' });
  const memoryCount = await collection.count();

  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: `Smart Workflow Assistant initialized with ${memoryCount} project memories.`,
      },
      systemMessage: `🧠 ${memoryCount} memories loaded`,
    }),
  );
}

function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });
}

readStdin().then(main).catch(console.error);
```

#### 2. Inject memories (BeforeAgent)

**`.gemini/hooks/inject-memories.js`:**

```javascript
#!/usr/bin/env node
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { ChromaClient } = require('chromadb');
const path = require('path');

async function main() {
  const input = JSON.parse(await readStdin());
  const { prompt } = input;

  if (!prompt?.trim()) {
    console.log(JSON.stringify({}));
    return;
  }

  // Embed the prompt
  const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genai.getGenerativeModel({ model: 'text-embedding-004' });
  const result = await model.embedContent(prompt);

  // Search memories
  const projectDir = process.env.GEMINI_PROJECT_DIR;
  const client = new ChromaClient({
    path: path.join(projectDir, '.gemini', 'chroma'),
  });

  try {
    const collection = await client.getCollection({ name: 'project_memories' });
    const results = await collection.query({
      queryEmbeddings: [result.embedding.values],
      nResults: 3,
    });

    if (results.documents[0]?.length > 0) {
      const memories = results.documents[0]
        .map((doc, i) => {
          const meta = results.metadatas[0][i];
          return `- [${meta.category}] ${meta.summary}`;
        })
        .join('\n');

      console.log(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'BeforeAgent',
            additionalContext: `\n## Relevant Project Context\n\n${memories}\n`,
          },
          systemMessage: `💭 ${results.documents[0].length} memories recalled`,
        }),
      );
    } else {
      console.log(JSON.stringify({}));
    }
  } catch (error) {
    console.log(JSON.stringify({}));
  }
}

function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });
}

readStdin().then(main).catch(console.error);
```

#### 3. RAG tool filter (BeforeToolSelection)

**`.gemini/hooks/rag-filter.js`:**

```javascript
#!/usr/bin/env node
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function main() {
  const input = JSON.parse(await readStdin());
  const { llm_request } = input;
  const candidateTools =
    llm_request.toolConfig?.functionCallingConfig?.allowedFunctionNames || [];

  // Skip if already filtered
  if (candidateTools.length <= 20) {
    console.log(JSON.stringify({}));
    return;
  }

  // Extract recent user messages
  const recentMessages = llm_request.messages
    .slice(-3)
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join('\n');

  // Use fast model to extract task keywords
  const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genai.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

  const result = await model.generateContent(
    `Extract 3-5 keywords describing needed tool capabilities from this request:\n\n${recentMessages}\n\nKeywords (comma-separated):`,
  );

  const keywords = result.response
    .text()
    .toLowerCase()
    .split(',')
    .map((k) => k.trim());

  // Simple keyword-based filtering + core tools
  const coreTools = ['read_file', 'write_file', 'replace', 'run_shell_command'];
  const filtered = candidateTools.filter((tool) => {
    if (coreTools.includes(tool)) return true;
    const toolLower = tool.toLowerCase();
    return keywords.some(
      (kw) => toolLower.includes(kw) || kw.includes(toolLower),
    );
  });

  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'BeforeToolSelection',
        toolConfig: {
          functionCallingConfig: {
            mode: 'ANY',
            allowedFunctionNames: filtered.slice(0, 20),
          },
        },
      },
      systemMessage: `🎯 Filtered ${candidateTools.length} → ${Math.min(filtered.length, 20)} tools`,
    }),
  );
}

function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });
}

readStdin().then(main).catch(console.error);
```

#### 4. Security validation (BeforeTool)

**`.gemini/hooks/security.js`:**

```javascript
#!/usr/bin/env node

const SECRET_PATTERNS = [
  /api[_-]?key\s*[:=]\s*['"]?[a-zA-Z0-9_-]{20,}['"]?/i,
  /password\s*[:=]\s*['"]?[^\s'"]{8,}['"]?/i,
  /secret\s*[:=]\s*['"]?[a-zA-Z0-9_-]{20,}['"]?/i,
  /AKIA[0-9A-Z]{16}/, // AWS
  /ghp_[a-zA-Z0-9]{36}/, // GitHub
];

async function main() {
  const input = JSON.parse(await readStdin());
  const { tool_input } = input;

  const content = tool_input.content || tool_input.new_string || '';

  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      console.log(
        JSON.stringify({
          decision: 'deny',
          reason:
            'Potential secret detected in code. Please remove sensitive data.',
          systemMessage: '🚨 Secret scanner blocked operation',
        }),
      );
      process.exit(2);
    }
  }

  console.log(JSON.stringify({ decision: 'allow' }));
}

function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });
}

readStdin().then(main).catch(console.error);
```

#### 5. Auto-test (AfterTool)

**`.gemini/hooks/auto-test.js`:**

```javascript
#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function main() {
  const input = JSON.parse(await readStdin());
  const { tool_input } = input;
  const filePath = tool_input.file_path;

  if (!filePath?.match(/\.(ts|js|tsx|jsx)$/)) {
    console.log(JSON.stringify({}));
    return;
  }

  // Find test file
  const ext = path.extname(filePath);
  const base = filePath.slice(0, -ext.length);
  const testFile = `${base}.test${ext}`;

  if (!fs.existsSync(testFile)) {
    console.log(
      JSON.stringify({
        systemMessage: `⚠️ No test file: ${path.basename(testFile)}`,
      }),
    );
    return;
  }

  // Run tests
  try {
    execSync(`npx vitest run ${testFile} --silent`, {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 30000,
    });

    console.log(
      JSON.stringify({
        systemMessage: `✅ Tests passed: ${path.basename(filePath)}`,
      }),
    );
  } catch (error) {
    console.log(
      JSON.stringify({
        systemMessage: `❌ Tests failed: ${path.basename(filePath)}`,
      }),
    );
  }
}

function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });
}

readStdin().then(main).catch(console.error);
```

#### 6. Record interaction (AfterModel)

**`.gemini/hooks/record.js`:**

```javascript
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

async function main() {
  const input = JSON.parse(await readStdin());
  const { llm_request, llm_response } = input;
  const projectDir = process.env.GEMINI_PROJECT_DIR;
  const sessionId = process.env.GEMINI_SESSION_ID;

  const tempFile = path.join(
    projectDir,
    '.gemini',
    'memory',
    `session-${sessionId}.jsonl`,
  );

  fs.mkdirSync(path.dirname(tempFile), { recursive: true });

  // Extract user message and model response
  const userMsg = llm_request.messages
    ?.filter((m) => m.role === 'user')
    .slice(-1)[0]?.content;

  const modelMsg = llm_response.candidates?.[0]?.content?.parts
    ?.map((p) => p.text)
    .filter(Boolean)
    .join('');

  if (userMsg && modelMsg) {
    const interaction = {
      timestamp: new Date().toISOString(),
      user: process.env.USER || 'unknown',
      request: userMsg.slice(0, 500), // Truncate for storage
      response: modelMsg.slice(0, 500),
    };

    fs.appendFileSync(tempFile, JSON.stringify(interaction) + '\n');
  }

  console.log(JSON.stringify({}));
}

function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });
}

readStdin().then(main).catch(console.error);
```

#### 7. Consolidate memories (SessionEnd)

**`.gemini/hooks/consolidate.js`:**

````javascript
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { ChromaClient } = require('chromadb');

async function main() {
  const input = JSON.parse(await readStdin());
  const projectDir = process.env.GEMINI_PROJECT_DIR;
  const sessionId = process.env.GEMINI_SESSION_ID;

  const tempFile = path.join(
    projectDir,
    '.gemini',
    'memory',
    `session-${sessionId}.jsonl`,
  );

  if (!fs.existsSync(tempFile)) {
    console.log(JSON.stringify({}));
    return;
  }

  // Read interactions
  const interactions = fs
    .readFileSync(tempFile, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  if (interactions.length === 0) {
    fs.unlinkSync(tempFile);
    console.log(JSON.stringify({}));
    return;
  }

  // Extract memories using LLM
  const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genai.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

  const prompt = `Extract important project learnings from this session.
Focus on: decisions, conventions, gotchas, patterns.
Return JSON array with: category, summary, keywords

Session interactions:
${JSON.stringify(interactions, null, 2)}

JSON:`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json\n?|\n?```/g, '');
    const memories = JSON.parse(text);

    // Store in ChromaDB
    const client = new ChromaClient({
      path: path.join(projectDir, '.gemini', 'chroma'),
    });
    const collection = await client.getCollection({ name: 'project_memories' });
    const embedModel = genai.getGenerativeModel({
      model: 'text-embedding-004',
    });

    for (const memory of memories) {
      const memoryText = `${memory.category}: ${memory.summary}`;
      const embedding = await embedModel.embedContent(memoryText);
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      await collection.add({
        ids: [id],
        embeddings: [embedding.embedding.values],
        documents: [memoryText],
        metadatas: [
          {
            category: memory.category || 'general',
            summary: memory.summary,
            keywords: (memory.keywords || []).join(','),
            timestamp: new Date().toISOString(),
          },
        ],
      });
    }

    fs.unlinkSync(tempFile);

    console.log(
      JSON.stringify({
        systemMessage: `🧠 ${memories.length} new learnings saved for future sessions`,
      }),
    );
  } catch (error) {
    console.error('Error consolidating memories:', error);
    fs.unlinkSync(tempFile);
    console.log(JSON.stringify({}));
  }
}

function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });
}

readStdin().then(main).catch(console.error);
````

### Example session

```
> gemini

🧠 3 memories loaded

> Fix the authentication bug in login.ts

💭 2 memories recalled:
  - [convention] Use middleware pattern for auth
  - [gotcha] Remember to update token types

🎯 Filtered 127 → 15 tools

[Agent reads login.ts and proposes fix]

✅ Tests passed: login.ts

---

> Add error logging to API endpoints

💭 3 memories recalled:
  - [convention] Use middleware pattern for auth
  - [pattern] Centralized error handling in middleware
  - [decision] Log errors to CloudWatch

🎯 Filtered 127 → 18 tools

[Agent implements error logging]

> /exit

🧠 2 new learnings saved for future sessions
```

### What makes this example special

**RAG-based tool selection:**

- Traditional: Send all 100+ tools causing confusion and context overflow
- This example: Extract intent, filter to ~15 relevant tools
- Benefits: Faster responses, better selection, lower costs

**Cross-session memory:**

- Traditional: Each session starts fresh
- This example: Learns conventions, decisions, gotchas, patterns
- Benefits: Shared knowledge across team members, persistent learnings

**All hook events integrated:**

Demonstrates every hook event with practical use cases in a cohesive workflow.

### Cost efficiency

- Uses `gemini-2.0-flash-exp` for intent extraction (fast, cheap)
- Uses `text-embedding-004` for RAG (inexpensive)
- Caches tool descriptions (one-time cost)
- Minimal overhead per request (<500ms typically)

### Customization

**Adjust memory relevance:**

```javascript
// In inject-memories.js, change nResults
const results = await collection.query({
  queryEmbeddings: [result.embedding.values],
  nResults: 5, // More memories
});
```

**Modify tool filter count:**

```javascript
// In rag-filter.js, adjust the limit
allowedFunctionNames: filtered.slice(0, 30), // More tools
```

**Add custom security patterns:**

```javascript
// In security.js, add patterns
const SECRET_PATTERNS = [
  // ... existing patterns
  /private[_-]?key/i,
  /auth[_-]?token/i,
];
```

## Packaging as an extension

While project-level hooks are great for specific repositories, you might want to
share your hooks across multiple projects or with other users. You can do this
by packaging your hooks as a [Gemini CLI extension](../extensions/index.md).

Packaging as an extension provides:

- **Easy distribution:** Share hooks via a git repository or GitHub release.
- **Centralized management:** Install, update, and disable hooks using
  `gemini extensions` commands.
- **Version control:** Manage hook versions separately from your project code.
- **Variable substitution:** Use `${extensionPath}` and `${process.execPath}`
  for portable, cross-platform scripts.

To package hooks as an extension, follow the
[extensions hook documentation](../extensions/index.md#hooks).

## Learn more

- [Hooks Reference](index.md) - Complete API reference and configuration
- [Best Practices](best-practices.md) - Security, performance, and debugging
- [Configuration](../get-started/configuration.md) - Gemini CLI settings
- [Custom Commands](../cli/custom-commands.md) - Create custom commands
