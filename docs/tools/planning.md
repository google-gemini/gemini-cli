# Gemini CLI planning tools

Planning tools allow the Gemini model to switch into a safe, read-only "Plan
Mode" for researching and planning complex changes, and to signal the
finalization of a plan to the user.

## 1. `enter_plan_mode` (EnterPlanMode)

`enter_plan_mode` switches the CLI to Plan Mode. This tool is typically called
by the agent when you ask it to "start a plan" using natural language. In this
mode, the agent is restricted to read-only tools to allow for safe exploration
and planning.

> **Note:** This tool is not available when the CLI is in YOLO mode.

- **Tool name:** `enter_plan_mode`
- **Display name:** Enter Plan Mode
- **File:** `enter-plan-mode.ts`
- **Parameters:**
  - `reason` (string, optional): A short reason explaining why the agent is
    entering plan mode (e.g., "Starting a complex feature implementation").
- **Behavior:**
  - Switches the CLI's approval mode to `PLAN`.
  - Notifies the user that the agent has entered Plan Mode.
- **Output (`llmContent`):** A message indicating the switch, e.g.,
  `Switching to Plan mode.`
- **Confirmation:** Yes. The user is prompted to confirm entering Plan Mode.

## 2. `exit_plan_mode` (ExitPlanMode)

`exit_plan_mode` signals that the planning phase is complete. It presents the
finalized plan to the user and requests approval to start the implementation.

- **Tool name:** `exit_plan_mode`
- **Display name:** Exit Plan Mode
- **File:** `exit-plan-mode.ts`
- **Parameters:**
  - `plan_path` (string, required): The path to the finalized Markdown plan
    file. This file MUST be located within the project's temporary plans
    directory (e.g., `~/.gemini/tmp/<project>/plans/`).
- **Behavior:**
  - Validates that the `plan_path` is within the allowed directory and that the
    file exists and has content.
  - Presents the plan to the user for review.
  - If the user approves the plan:
    - Switches the CLI's approval mode to the user's chosen approval mode (
      `DEFAULT` or `AUTO_EDIT`).
    - Marks the plan as approved for implementation.
  - If the user rejects the plan:
    - Stays in Plan Mode.
    - Returns user feedback to the model to refine the plan.
- **Output (`llmContent`):**
  - On approval: A message indicating the plan was approved and the new approval
    mode.
  - On rejection: A message containing the user's feedback.
- **Confirmation:** Yes. Shows the finalized plan and asks for user approval to
  proceed with implementation.
