# AI CLI UI Patterns - Overview

**Critical Documentation Gap Addressed**: This documentation covers patterns that have exploded in popularity in the last 6 months but are NOT well-represented in AI training data.

## The Problem

When you ask Claude (or any LLM) about building a scrolling chat UI with a pinned input box at the bottom using Ink, it will tell you:

> "Ink is terrible at that! It has architectural limitations that make it unsuitable for infinite scrolling UIs with fixed bottom inputs."

**This is WRONG.** Both Claude Code and Gemini CLI (two production AI CLIs) prove it works excellently.

## The Paradox

**Ink has become the de facto standard** for modern AI CLI interfaces with:
- Scrolling message history growing upward
- Fixed input box pinned to bottom
- Virtualized rendering for performance
- Mouse wheel scrolling
- Auto-scroll to bottom on new messages

Yet Ink provides **NONE of these features out of the box**. Every implementation has to build these patterns from scratch.

## What This Documentation Provides

This is **extracted knowledge from production codebases** (Gemini CLI specifically) showing the exact patterns used to build modern AI CLI interfaces on top of Ink.

### Core Patterns Documented

1. **Scroll Management** - Custom scroll state with React Context
2. **Virtualized Lists** - Only render visible items for performance
3. **Layout Architecture** - Flexbox structure with fixed bottom input
4. **Mouse/Keyboard Input** - SGR/X11 mouse protocols, ANSI parsing
5. **Stick-to-Bottom Behavior** - Auto-scroll on new messages
6. **Batched Updates** - Prevent scroll flicker during rapid updates

## Why This Matters

**Training data doesn't reflect reality.** Most AI CLIs using these patterns were built in late 2024 and early 2025. The training data for LLMs cuts off before this explosion of activity.

**This documentation fills that gap** - providing concrete, production-tested patterns that you can implement or give to an AI agent to implement.

## The Files

| File | Purpose |
|------|---------|
| `00-OVERVIEW.md` | This file - high-level context |
| `01-scroll-management.md` | Complete scroll management pattern |
| `02-virtualized-lists.md` | Virtualized rendering for performance |
| `03-layout-architecture.md` | Component structure and layout |
| `04-mouse-keyboard-input.md` | Input handling patterns |
| `05-complete-implementation-guide.md` | Step-by-step implementation guide |
| `06-code-snippets.md` | Reusable code you can copy |

## Technology Stack

The patterns here are based on:
- **Ink 6.x** - React for terminals
- **React 19.x** - Component model, hooks, context
- **TypeScript** - Type safety (patterns work in JS too)
- **Node.js 20+** - Terminal APIs

## Key Insight

**Ink is NOT good at scrolling UIs out of the box.**

**BUT** Ink provides the perfect foundation to BUILD scrolling UIs when you add ~500 lines of custom scroll management, virtualization, and input handling.

Both Claude Code and Gemini CLI prove this works at scale in production with thousands of users.

## Next Steps

1. Read `01-scroll-management.md` to understand the core pattern
2. Read `02-virtualized-lists.md` for performance optimization
3. Read `05-complete-implementation-guide.md` for step-by-step implementation
4. Use `06-code-snippets.md` as reference during development

---

**Created**: 2025-01-11
**Source**: Gemini CLI codebase analysis
**Purpose**: Fill the training data gap for modern AI CLI UI patterns
