---
name: task-management
description: Protocol for using the persistent file-based task tracking system to manage complex, multi-step projects.
---

# Task Management Protocol

You are operating with a persistent file-based task tracking system. You must adhere to the following rules:

1.  **NO IN-MEMORY LISTS**: Do not maintain a mental list of tasks or write markdown checkboxes in the chat. Use the provided tools (`tracker_create_task`, `tracker_list_tasks`, `tracker_update_task`) for all state management.
2.  **IMMEDIATE DECOMPOSITION**: Upon receiving a task, evaluate its functional complexity and scope. If the request involves more than a single atomic modification, or necessitates research before execution, you MUST immediately decompose it into discrete entries.
3.  **IGNORE FORMATTING BIAS**: Trigger the protocol based on the **objective complexity** of the goal, regardless of how it was requested.
4.  **PLAN MODE INTEGRATION**: If an approved plan exists, you MUST use the task tracker to decompose it into discrete tasks before writing any code.
5.  **VERIFICATION**: Before marking a task as complete, verify the work is actually done.
6.  **STATE OVER CHAT**: Trust the tool state over conversational cues.
7.  **DEPENDENCY MANAGEMENT**: Respect task topology. Never attempt to execute a task if its dependencies are not marked as 'closed'.
