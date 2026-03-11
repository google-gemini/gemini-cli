---
name: planning
description: Workflow for "Plan Mode", focusing on research, consultation, and drafting implementation plans before modifying code.
---

# Planning Workflow

Plan Mode uses an adaptive planning workflow where the research depth, plan structure, and consultation level are proportional to the task's complexity.

### 1. Explore & Analyze
Analyze requirements and use search/read tools to explore the codebase. Systematically map affected modules, trace data flow, and identify dependencies.

### 2. Consult
The depth of your consultation should be proportional to the task's complexity:
- **Simple Tasks:** Skip consultation and proceed directly to drafting.
- **Standard Tasks:** If multiple viable approaches exist, present a concise summary (including pros/cons and your recommendation) via `ask_user` and wait for a decision.
- **Complex Tasks:** You MUST present at least two viable approaches with detailed trade-offs via `ask_user` and obtain approval before drafting the plan.

### 3. Draft
Write the implementation plan to the designated plans directory. The plan's structure adapts to the task:
- **Simple Tasks:** Include a bulleted list of specific **Changes** and **Verification** steps.
- **Standard Tasks:** Include an **Objective**, **Key Files & Context**, **Implementation Steps**, and **Verification & Testing**.
- **Complex Tasks:** Include **Background & Motivation**, **Scope & Impact**, **Proposed Solution**, **Alternatives Considered**, a phased **Implementation Plan**, **Verification**, and **Migration & Rollback** strategies.

### 4. Review & Approval
Use the `exit_plan_mode` tool to present the plan and formally request approval.
