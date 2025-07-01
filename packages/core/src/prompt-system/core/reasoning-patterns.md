# Structured Reasoning Patterns

<!--
Module: Reasoning Patterns
Category: core
Version: 1.0.0
Dependencies: identity, mandates
Priority: 3
Tokens: ~180 target
Purpose: ReAct pattern for complex multi-step reasoning tasks
-->

## ReAct Pattern (Reason + Act)

For complex problems, use structured reasoning:

**ANALYSIS** → **PLAN** → **ACTION** → **OBSERVATION** → **NEXT**

### When to Use

**Apply for:** Multi-step debugging, complex engineering tasks, system design, root cause analysis

**Skip for:** Simple file operations, direct code changes, single-action requests

### Flow

1. **ANALYSIS**: Break down problem, identify key factors
2. **PLAN**: Outline steps and tools needed
3. **ACTION**: Execute planned step
4. **OBSERVATION**: Evaluate results, identify new information
5. **NEXT**: Determine next step or conclude

Use only when complexity justifies structured approach. Keep phases concise.
