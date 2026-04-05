# Session Resume Prompt

## Objective

Prompt the user with an interactive dialog when they submit their very first
prompt in a new session if that prompt exactly matches the first user message of
an existing `/chat` session. The dialog will ask whether to resume the matched
session or start a fresh request. This applies regardless of whether the prompt
was typed manually or navigated to via `Ctrl+R` or `Up`/`Down` arrows.

## Key Files & Context

- `packages/cli/src/ui/AppContainer.tsx`: Handles `handleFinalSubmit`. We will
  intercept the very first prompt submission here.
- `packages/cli/src/ui/contexts/UIStateContext.tsx`: Manages UI state. We need
  to add state for the new dialog request.
- `packages/cli/src/ui/contexts/UIActionsContext.tsx`: Contains `UIActions`. We
  will add a handler for the dialog choices.
- `packages/cli/src/ui/components/DialogManager.tsx`: Renders dialogs based on
  UI state.
- `packages/cli/src/ui/components/SessionResumePromptDialog.tsx` (new): The UI
  component for the confirmation dialog.

## Implementation Steps

1. **Update State Interfaces (`UIStateContext.tsx`, `UIActionsContext.tsx`)**:
   - Add `sessionResumePromptRequest` to `UIState`, which holds
     `{ matchedSession: SessionInfo, submittedValue: string }`.
   - Add `handleSessionResumePromptChoice(resume: boolean)` to `UIActions`.

2. **Intercept First Prompt (`AppContainer.tsx`)**:
   - In `handleFinalSubmit(submittedValue: string, bypassSessionCheck = false)`:
     - If `bypassSessionCheck` is false and this is the very first user prompt
       (`historyManager.history` has no user messages):
       - Asynchronously read all previous sessions via
         `getSessionFiles(chatsDir)`.
       - If a session is found where
         `firstUserMessage === submittedValue.trim()`:
         - Trigger the `sessionResumePromptRequest` with the matched session and
           the `submittedValue`.
         - Return early, stopping the current execution.

3. **Handle Dialog Choice (`AppContainer.tsx`)**:
   - Implement `handleSessionResumePromptChoice`:
     - Clear the `sessionResumePromptRequest`.
     - If `resume` is true: Call `handleResumeSession(matchedSession)`.
     - If `resume` is false: Call `handleFinalSubmit(submittedValue, true)` to
       execute normally.

4. **Create Dialog Component (`SessionResumePromptDialog.tsx`)**:
   - Create a generic full-frame dialog using `ink` and `@inkjs/ui` or custom
     select menus.
   - Display a message: "A previous session exactly matches your first prompt.
     Would you like to resume it?"
   - Provide two options: "Resume previous session" and "Send as new request".

5. **Register Dialog (`DialogManager.tsx`)**:
   - Render `SessionResumePromptDialog` when
     `uiState.sessionResumePromptRequest` is not null.

## Verification & Testing

- Start a fresh session, type a prompt that exactly matches a previous session's
  first prompt (e.g. from history using `Ctrl+R` or typed out), and verify the
  dialog appears.
- Select "Resume previous session" and verify the old session loads correctly.
- Select "Send as new request" and verify the prompt executes as a normal new
  session.
- Type a completely novel prompt as the first message and verify it executes
  immediately without a dialog.
- Enter a matching prompt as the _second_ message of a session and verify it
  does NOT trigger the dialog.
