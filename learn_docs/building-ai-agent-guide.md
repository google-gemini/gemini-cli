# Building an Investment Research AI Agent - Learning Guide

## Overview

This guide provides a focused learning roadmap for understanding the Gemini CLI architecture and building your own investment research AI agent. It highlights the core agent loop and key components you should study.

---

## 🔄 Core Agent Loop (The Heart of the System)

```
┌─────────────────────────────────────────────────────────────┐
│                    1. USER INPUT                            │
│                 "Analyze AAPL stock"                        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│           2. ORCHESTRATOR (GeminiClient)                    │
│   - Manages conversation state                             │
│   - Coordinates tool execution                              │
│   - Handles retries & errors                                │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│         3. PROMPT CONSTRUCTION (prompts.ts)                 │
│   System Instruction: "You are an investment analyst..."    │
│   + Chat History: [previous messages]                       │
│   + Tool Declarations: [available tools]                    │
│   + User Message: "Analyze AAPL stock"                      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│       4. API CALL (ContentGenerator)                        │
│   → Send to Gemini API (streaming)                          │
│   → Handles auth, retries, rate limits                      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│         5. LLM RESPONSE (Gemini API)                        │
│   Can return:                                               │
│   - Text: "Let me fetch the stock data for AAPL..."        │
│   - Function Calls: fetch_stock_price(ticker="AAPL")       │
│   - Both: Text + Function Calls                             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
            ┌────────┴─────────┐
            │                  │
      Text Only          Has Function Calls?
            │                  │
            │                  ▼
            │      ┌─────────────────────────────────────┐
            │      │  6. TOOL EXECUTION (Turn.run)       │
            │      │  - Parse function call              │
            │      │  - Validate parameters              │
            │      │  - Check policies (optional)        │
            │      │  - Request confirmation (optional)  │
            │      │  - Execute via ToolRegistry         │
            │      │  - Capture results                  │
            │      └──────────────┬──────────────────────┘
            │                     │
            │                     ▼
            │      ┌─────────────────────────────────────┐
            │      │  7. TOOL RESULTS                    │
            │      │  Result: {"price": 178.32, ...}     │
            │      └──────────────┬──────────────────────┘
            │                     │
            │                     ▼
            │      ┌─────────────────────────────────────┐
            │      │  8. SEND RESULTS BACK TO LLM        │
            │      │  Add functionResponse to history    │
            │      │  → Loop back to step 4              │
            │      └──────────────┬──────────────────────┘
            │                     │
            └─────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│         9. STREAM RESPONSE TO USER                          │
│   "AAPL is trading at $178.32, up 2.3% today..."          │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Key Components to Focus On

### **1. Main Orchestrator** ⭐⭐⭐ (CRITICAL)

**File**: `packages/core/src/core/client.ts` (GeminiClient class)

**What it does**:
- **Entry point**: `sendMessageStream()` method (line 419)
- Manages conversation state and history
- Coordinates the agent loop
- Handles compression, retries, errors
- Model routing and selection

**Key methods to study**:
```typescript
async *sendMessageStream(request, signal, prompt_id, turns)
  → Main loop that orchestrates everything

async startChat(extraHistory?)
  → Initializes chat with system prompt + tools

async initialize()
  → Sets up the client
```

**For investment research**: This is your **central controller**. You'll customize this to manage research workflows.

---

### **2. Tool System** ⭐⭐⭐ (CRITICAL)

**Files**:
- `packages/core/src/tools/tool-registry.ts` - Tool management
- `packages/core/src/tools/tools.ts` - Base tool classes
- Individual tools: `packages/core/src/tools/*.ts`

**What it does**:
- **Tool Registry**: Manages available tools (register, discover, execute)
- **Tool Declarations**: Converts tools to function declarations for LLM
- **Tool Execution**: Validates params, executes, returns results

**Key patterns**:
```typescript
class ToolRegistry {
  register(tool: Tool) → Add tool
  getFunctionDeclarations() → For LLM
  getTool(name: string) → Get specific tool
  executeTool(name, params) → Run tool
}
```

**For investment research**: Build custom tools like:
- `fetch_stock_data(ticker, timeframe)`
- `analyze_financials(ticker)`
- `get_news_sentiment(ticker)`
- `calculate_technical_indicators(ticker, indicators[])`
- `compare_stocks(tickers[])`

---

### **3. Turn Management** ⭐⭐ (IMPORTANT)

**File**: `packages/core/src/core/turn.ts` (Turn class)

**What it does**:
- Represents one **turn** in the agent loop
- Handles streaming from API
- Detects and queues function calls
- Emits events (content, tool_call_request, tool_call_response)

**Key method**:
```typescript
async *run(model, request, signal) {
  // Stream API response
  // Parse function calls
  // Emit events
  // Handle tool execution
}
```

**For investment research**: This manages **multi-step reasoning**. The agent might:
1. Fetch stock data
2. Analyze fundamentals
3. Check news sentiment
4. Generate final recommendation

---

### **4. Chat History & Context** ⭐⭐ (IMPORTANT)

**File**: `packages/core/src/core/geminiChat.ts` (GeminiChat class)

**What it does**:
- Maintains conversation history (user ↔ model)
- Manages curated vs comprehensive history
- Handles streaming responses
- Validates content
- Auto-retries on invalid responses

**Key methods**:
```typescript
getHistory(curated: boolean) → Get chat history
addHistory(content) → Add to history
sendMessageStream() → Send message to API
```

**For investment research**: Critical for **context management**. You need to:
- Track previous analyses
- Maintain conversation about specific stocks
- Compress history when it gets too long

---

### **5. Prompt Construction** ⭐⭐⭐ (CRITICAL)

**File**: `packages/core/src/core/prompts.ts`

**What it does**:
- Builds the **system instruction** (agent's personality & rules)
- Includes context (directory, git info, etc.)
- Defines agent capabilities

**Key function**:
```typescript
getCoreSystemPrompt(config, userMemory) → string
```

**For investment research**: Your system prompt might be:
```
You are an expert investment research analyst. Your role is to:
1. Analyze stocks using fundamental and technical analysis
2. Gather market data, news, and sentiment
3. Provide data-driven recommendations
4. Explain your reasoning clearly

Guidelines:
- Always cite data sources
- Consider multiple timeframes
- Assess risk factors
- Provide balanced analysis
```

---

### **6. Content Generator (API Client)** ⭐⭐ (IMPORTANT)

**File**: `packages/core/src/core/contentGenerator.ts`

**What it does**:
- **Abstraction layer** for LLM API calls
- Handles authentication (OAuth, API key, Vertex AI)
- Manages streaming responses
- Retries with backoff

**Interface**:
```typescript
interface ContentGenerator {
  generateContent(request) → Promise<Response>
  generateContentStream(request) → AsyncGenerator
  countTokens(request) → Promise<count>
}
```

**For investment research**: You might swap Gemini for other LLMs (GPT-4, Claude) by implementing this interface.

---

### **7. Configuration System** ⭐ (HELPFUL)

**File**: `packages/core/src/config/config.ts`

**What it does**:
- Centralized configuration (model, tools, settings)
- Service locator pattern
- Settings management

**For investment research**: Configure:
- Model selection (Flash for quick queries, Pro for deep analysis)
- Tool availability
- API keys for data sources
- Risk thresholds

---

### **8. Error Handling & Retries** ⭐⭐ (IMPORTANT)

**Files**:
- `packages/core/src/utils/retry.ts`
- `packages/core/src/utils/errors.ts`

**What it does**:
- Exponential backoff retries
- Handle rate limits, network errors
- Graceful degradation (fallback to Flash model)

**Key pattern**:
```typescript
await retryWithBackoff(apiCall, {
  onPersistent429: handleRateLimitCallback,
  maxAttempts: 3,
});
```

**For investment research**: Critical for **production reliability** when calling market data APIs.

---

## 📚 Learning Roadmap: Study These Files in Order

### **Phase 1: Understand the Core Loop** (Start Here)
1. **`client.ts`** (lines 419-605) - `sendMessageStream()` method
2. **`turn.ts`** (lines 236-350) - `run()` method
3. **`geminiChat.ts`** (lines 239-357) - `sendMessageStream()` method

### **Phase 2: Tool System**
4. **`tools.ts`** - Base tool classes and interfaces
5. **`tool-registry.ts`** - Tool management
6. **`read-file.ts`** or **`web-fetch.ts`** - Example tool implementation

### **Phase 3: System Design**
7. **`prompts.ts`** - System prompt construction
8. **`contentGenerator.ts`** - API abstraction
9. **`config.ts`** - Configuration patterns

### **Phase 4: Production Features**
10. **`retry.ts`** - Retry logic
11. **`chatCompressionService.ts`** - Context management
12. **`loopDetectionService.ts`** - Infinite loop prevention

---

## 🏗️ Building Your Investment Research Agent

### **Minimal Starting Architecture**

```typescript
// 1. Define your investment tools
class StockDataTool extends BaseDeclarativeTool {
  async execute(params: {ticker: string}) {
    // Call Alpha Vantage, Yahoo Finance, etc.
    return { price, volume, marketCap, ... };
  }
}

class NewsAnalysisTool extends BaseDeclarativeTool {
  async execute(params: {ticker: string}) {
    // Fetch news, run sentiment analysis
    return { sentiment, articles, summary };
  }
}

// 2. Create your orchestrator
class InvestmentResearchAgent {
  private client: GeminiClient;
  private toolRegistry: ToolRegistry;

  async initialize() {
    // Register tools
    this.toolRegistry.register(new StockDataTool());
    this.toolRegistry.register(new NewsAnalysisTool());

    // Initialize client with custom system prompt
    this.client = new GeminiClient(config);
    await this.client.initialize();
  }

  async *analyzeStock(ticker: string) {
    // Send message and stream responses
    for await (const event of this.client.sendMessageStream(
      `Analyze ${ticker} stock`,
      signal,
      promptId,
    )) {
      yield event; // Stream to user
    }
  }
}

// 3. Use it
const agent = new InvestmentResearchAgent();
await agent.initialize();
for await (const event of agent.analyzeStock("AAPL")) {
  console.log(event);
}
```

---

## 🎓 Key Takeaways

### **What Makes This Architecture Powerful**:

1. **Agentic Loop**: LLM can call tools, see results, reason, and call more tools
2. **Streaming**: Real-time responses (don't wait for full completion)
3. **Tool Abstraction**: Easy to add new data sources
4. **Error Recovery**: Automatic retries, fallbacks, validation
5. **Context Management**: Compress history when it gets too long
6. **Production-Ready**: Logging, telemetry, policy enforcement

### **For Investment Research**:
- **Data Tools**: Stock prices, financials, news, SEC filings
- **Analysis Tools**: Technical indicators, DCF models, comparisons
- **Reasoning**: LLM chains tools together (fetch → analyze → summarize)
- **Real-time**: Stream results as analysis progresses
- **Reliable**: Retry failed API calls, handle rate limits

---

## 🚀 Getting Started

**Quick Start Steps**:

1. **Read the core loop files** in Phase 1 order
2. **Run the CLI** and observe how it works
3. **Create a simple tool** (start with a basic stock price fetcher)
4. **Register your tool** and test it
5. **Build incrementally** - add more tools as needed

**Start with the `client.ts → turn.ts → tool-registry.ts` triad. That's your foundation. Everything else builds on top!**

---

## 📖 Additional Resources

- **Gemini CLI Documentation**: Check `/docs` folder for official documentation
- **Tool Examples**: Look at `packages/core/src/tools/` for real tool implementations
- **Integration Tests**: See `integration-tests/` for usage examples
- **System Prompts**: Study `packages/core/src/core/prompts.ts` for prompt engineering patterns

---

## 💡 Tips for Investment Research Agent

1. **Start Simple**: Begin with 2-3 basic tools (stock price, company info)
2. **Incremental Development**: Add tools one at a time and test thoroughly
3. **Error Handling**: Market data APIs can be unreliable - implement robust retry logic
4. **Rate Limiting**: Respect API rate limits (use queuing if needed)
5. **Caching**: Cache market data to reduce API calls
6. **Streaming**: Stream analysis results to user in real-time for better UX
7. **Context**: Keep conversation history for follow-up questions
8. **Validation**: Validate ticker symbols before calling APIs

---

*Last Updated: 2025-11-18*
*Based on Gemini CLI codebase analysis*
