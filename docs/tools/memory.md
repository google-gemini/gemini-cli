# 🧠 Gemini Memory Tool (`save_memory`)

The `save_memory` tool enables the Gemini agent to persist important information across sessions, such as user preferences, project decisions, and reusable context.

---

## 📌 Overview

This tool stores structured memory entries in a global context file (`GEMINI.md`), allowing future sessions to automatically access previously saved information.

It is designed to improve:
- 🔁 Continuity across sessions  
- 🎯 Personalization  
- ⚡ Developer efficiency  

---

## ⚙️ How It Works

### 📍 Storage Location
- File: `~/.gemini/GEMINI.md`
- Section: `## Gemini Added Memories`
- Format: Markdown bullet list

### 🔄 Behavior
- **Append-only** → Each memory is added as a new bullet point  
- **Persistent** → Data survives across sessions  
- **Auto-loaded** → Included in context for future interactions  

---

## 🧾 API Reference

### Function: `save_memory`

#### Parameters

| Name  | Type   | Required | Description |
|-------|--------|----------|------------|
| fact  | string | ✅ Yes   | A clear, self-contained statement in natural language |

---

## ✅ Best Practices

✔ Keep statements concise and unambiguous  
✔ Write context-independent facts  
✔ Store only long-term useful information  

### ✔ Good Example
```text
"I prefer using Python for backend development."
