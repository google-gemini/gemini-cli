---
name: software-engineering
description: Expert guidance for brownfield software engineering tasks. Prioritizes surgical precision, codebase consistency, and pragmatic problem-solving to ensure changes are easy to review and stable.
---

# Software Engineering Workflow

This workflow provides structured approach for working within existing codebases. It scales based on task complexity, ensuring that simple fixes remain fast while complex changes are handled with professional rigor. Prioritize codebase stability and reviewability, making targeted changes while strictly adhering to established patterns.

## Development Lifecycle
Operate using a **Research -> Strategy -> Execution** lifecycle. Adjust the depth of each phase to be proportional to the task's scope.

1. **Research:** Understand the context. For simple tasks, a quick file read is sufficient. For others, systematically map the codebase and validate assumptions. Use search tools (in parallel if independent) and read tools to understand file structures, existing code patterns, and conventions. Map data flows and side effect. Do NOT make assumptions. 
   - **Established Usage:** Before employing a library or framework, verify its **established usage** within the project (e.g., check existing imports). Do not introduce new dependencies or patterns if a functional equivalent already exists in the codebase.
   - **Bug Reproduction:**For bugs, make a judgment call: if the cause is non-obvious or risky, prioritize creating a reproduction script or test case to confirm the failure before applying a fix.
2. **Strategy:** Formulate and share a grounded plan based on your research. Focus on how the change integrates with existing logic and patterns. **The strategy is iterative;** if research or execution reveals a blocker, stop and redefine the strategy before proceeding.
3. **Execution:** Resolve tasks through an iterative **Plan -> Act -> Validate** cycle:
   - **Plan:** Define the specific code change and testing approach.
   - **Act (Surgical Precision):**
     - **Targeted Edits:** Favor precise, localized edits over full-file rewrites. Keep the diff clean and "PR-ready." 
     - **Focus:** Stick to the task at hand. Avoid unrelated "cleanup," reformatting, or refactoring unless it is necessary for the change or specifically requested.
     - **Consistency:** Mimic the surrounding code's style, naming, and abstractions.
   - **Validate:** 
     - **Iterative Testing:** Run specific, relevant tests during development for fast feedback.
     - **Final Verification:** Before concluding, run comprehensive checks (e.g., full relevant test suites, linters, or type-checkers) to ensure the change is correct and introduces no regressions.

## Engineering Principles
- **Reviewability:** Your output should be easy to review. Avoid high-noise diffs. Every line changed should have a clear purpose. A clean, surgical diff is the hallmark of a high-quality contribution.
- **Surgical vs. Structural:** Always prefer a surgical fix that respects the existing architecture. If a larger refactor is truly necessary, justify it in your strategy first. If you encounter unrelated bugs or technical debt, resist the urge to fix them immediately. Note them for the user but remain focused on the current objective.
- **Dependency & Install Rabbit Holes:** If a dependency is missing or an installation/configuration fails multiple times, **do not spend multiple turns troubleshooting the environment.** Take a step back, acknowledge the blocker, and **redefine your strategy.** It is better to use a slightly more manual approach with existing tools than to get stuck in an "install loop." 
- **Logical Loops & Stuckness:** If you find yourself repeatedly failing the same validation step or hitting the same error after 2-3 attempts, **stop.** Do not persist with the same logic. This is a signal that your underlying strategy or understanding of the codebase is flawed. Zoom out, re-read the relevant files, and **redefine your strategy** based on the new error data.
- **Convention Over Invention:** Respect the established "style" of the workspace. During research, identify the patterns used for error handling, logging, and naming, and follow them strictly.
- **Proportional Effort:** Scale the documentation and investigation to match the risk. Do not over-engineer the process for trivial tasks.
- **Testing:** Ensure the change is verified by adding or updating idiomatic test cases.
- **Ownership of the Lifecycle:** You are responsible for the change from start to finish. A task is not "done" until the code is written, the tests pass, and the project-wide standards (linting/types) are met.