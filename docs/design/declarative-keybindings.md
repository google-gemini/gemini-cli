# **Declarative Keybindings**

This high-level design document outlines a significant change to the Gemini
CLI codebase. It is intended to facilitate collaboration between human
developers, domain experts, code reviewers, and AI coding assistants to ensure
a safe and correct implementation.

## **Process**

The process begins by seeding this document with high-level prompts. These
prompts will be shared with both coding assistants and human technical leads
to establish a mutual understanding of the project requirements.

The coding assistant will then update this document with a detailed overview
of the recommended approach, including risks, alternatives considered, and a
step-by-step plan for implementing and testing the changes.

We will share this document with human reviewers early in the process to
gather feedback from experts on this area of the Gemini CLI codebase.

After implementation, this document will be retained as a record of the design
process and serve as a reference for future projects.

After completion of this project, this document should no longer be materially
updated, though it can be appended with a record of related subsequent work if
that proves useful.

## **Initial Prompt**

We're going to work on a large project together to make it easier to add,
update, and discover keybindings for gemini-cli.

I anticipate that the best approach will be to rewrite the code that handles
specific keybindings. Instead of hardcoded logic, this code will create and
call a internal new API. This API will allow different parts of the
application to declare named callbacks, which will be recorded in a central
registry. A separate configuration file will then map specific keystrokes to
these named callbacks.

This approach will make keybindings discoverable, either by reading the
configuration file or by introspecting the registry at runtime. It will also
make it easier to detect conflicting key assignments.

This will be a major project. I want you to thoroughly analyze the problem,
understand the existing code and current implementations of keybindings within
the codebase, and help us decide whether this project is feasible.

In particular, I'd like to know if we can reimplement _all_ existing logic
without making breaking changes. I don't want to get partway down this path
only to discover during a rewrite that some critical existing piece of
functionality will no longer work.

We should use this as an opportunity to write very clean code and use the
process itself as an example for others.

## **Preliminary Discovery by Gemini**

### **1. Overview**

The current implementation of keybindings in the Gemini CLI relies on the
`useInput` hook from the `ink` library. This hook is used in various
components to handle keyboard input. The main application component,
`App.tsx`, handles global keybindings, while other components (like dialogs)
handle their own specific key events. This decentralized approach makes it
difficult to discover, manage, and update keybindings. It also increases the
risk of conflicting key assignments.

The proposed refactoring will introduce a centralized keybinding system. This
system will consist of:

- **A Keybinding Registry:** A central registry will store all available
  keybinding actions. Each action will have a unique name, a description, and
  a callback function.
- **A Configuration File:** A configuration file (e.g., `keybindings.json`)
  will map specific key combinations to the named actions in the registry.
  This will allow users to customize their keybindings.
- **A Keybinding Service:** A service will be responsible for reading the
  configuration file, listening for key presses, and invoking the appropriate
  callbacks from the registry.

### **2. Plan**

1. **Create the Keybinding Registry:**

   - Define a `Keybinding` interface with properties like `name`,
     `description`, `callback`, and `defaultKey`.
   - Implement a `KeybindingRegistry` class with methods to `register` and
     `get` keybindings.
   - The registry will be a singleton, accessible throughout the application.

1. **Implement the Keybinding Service:**

   - Create a `KeybindingService` that reads the keybinding configuration from
     a file.
   - The service will use a single `useInput` hook at the top level of the
     application (`App.tsx`).
   - When a key is pressed, the service will look up the corresponding action
     in the configuration and execute the callback from the registry.

1. **Refactor Existing Keybindings:**

   - Gradually refactor existing `useInput` hooks to use the new keybinding
     system.
   - For each keybinding, register it with the `KeybindingRegistry` and add an
     entry to the configuration file.
   - This can be done component by component to minimize disruption.

1. **Implement Keybinding Discovery:**

   - Add a `/help` command or a dedicated help view that displays all
     registered keybindings and their current assignments. This will use the
     information from the `KeybindingRegistry`.

### **3. Risks and Alternatives**

- **Risk:** Introducing a new system could be complex and might introduce new
  bugs.
  - **Mitigation:** We will implement the new system behind a feature flag
    initially. We will also write comprehensive tests for the new system.
- **Alternative:** Instead of a JSON configuration file, we could use a
  TypeScript file. This would provide better type safety but would be less
  user-friendly for customization. We believe a JSON file is a better choice
  for user-facing configuration.

### **4. Feasibility**

The proposed plan is feasible and will not result in any breaking changes for
users. We can reimplement all existing keybinding functionality using the new
system. The gradual refactoring approach will allow us to manage the
complexity and ensure a smooth transition.

## **Feedback from Human Reviewers**

## **Feedback from Human Reviewers**

Our human and AI reviewers provided detailed feedback on the initial design.
This section summarizes their key points, which will be used to shape the
final implementation plan.

### **Key Themes from Feedback**

#### **1. Context and Scope Management**

A primary concern raised by reviewers was the management of context-sensitive
keybindings. The initial design proposed a single, global `useInput` hook,
which does not account for scenarios where keybindings should only be active
within a specific UI context, such as a dialog, a text input field, or other
specialized components like `InputPrompt` and `TextBuffer`.

- **Challenge:** How does the system determine which keybinding to execute
  when multiple contexts are active or when a component-specific keybinding
  should override a global one?
- **Suggestion:** The design must incorporate a more sophisticated approach to
  context. This could involve a "lighter weight" solution where callers can
  resolve whether a specific input matches a keybinding, rather than a single
  service that takes full control of all keyboard input. This aligns better
  with the existing codebase, where `useInput` is used in multiple components.

#### **2. Separation of Concerns: Actions vs. Mappings**

Reviewers pointed out that the proposed `Keybinding` interface mixed the
_definition_ of an action (what it does) with its _mapping_ (how it's
triggered) by including a `defaultKey` property.

- **Challenge:** This approach creates ambiguity. It's unclear how a
  `defaultKey` would interact with a user's custom mapping in
  `keybindings.json`. Which one should take precedence in case of a conflict?
- **Suggestion:** The keybinding registry should only be concerned with being
  a collection of available **actions** (e.g., name, description, callback).
  The mapping of keys to these actions should be handled exclusively by a
  separate configuration layer. The `defaultKey` concept should be removed
  from the core interface and instead be used to generate a default
  `keybindings.json` file that users can then customize.

#### **3. Lifecycle Management**

The plan for gradual refactoring implies that components will register their
own keybindings. The initial design did not specify the lifecycle of these
registrations.

- **Challenge:** Without a clear lifecycle, the application could suffer from
  memory leaks (e.g., callbacks referencing unmounted components) or bugs
  where keybindings for inactive UI elements are still processed.
- **Suggestion:** The design must explicitly define when keybindings are
  registered and unregistered. This lifecycle should likely be tied to
  component lifecycle hooks (e.g., `useEffect` in React) and integrated with
  the context management system.

#### **4. Implementation and Discovery Details**

- **Complex Components:** The solution must be robust enough to handle the
  most complex existing keybinding implementations, such as those in
  `InputPrompt` and `TextBuffer`.
- **Discovery Command:** The proposal to use `/help` for keybinding discovery
  was questioned. A more specific or dedicated command might be more
  appropriate.
- **Feature Flag:** The suggestion to put the new system behind a feature flag
  was deemed unnecessary.

### **Summary of Reviewer Recommendations**

1. **Refine the Core Service:** Move away from a single, monolithic
   `KeybindingService` that controls all input. Instead, design a more
   flexible system that allows different parts of the application to resolve
   keybindings based on the current context.
1. **Clarify the `Keybinding` Definition:** Separate the action from the
   mapping. The registry should store actions, and the configuration file
   should store mappings.
1. **Define Keybinding Lifecycle:** Specify how and when keybindings are
   registered and unregistered, tying it to the component lifecycle to prevent
   bugs and memory leaks.
1. **Address Complex Cases:** Ensure the design explicitly accounts for the
   most complex keybinding scenarios in the current codebase.
1. **Provide Concrete Examples:** The final design would benefit from code
   snippets or more concrete examples to illustrate how the proposed system
   will work in practice.

## **Final Design**

## **Final Design**

This final design incorporates feedback from all reviewers and a detailed
analysis of the existing codebase, including the complex input handling in
`App.tsx` and `InputPrompt.tsx`. The goal is to create a system that is
centralized, configurable, context-aware, and capable of handling all existing
functionality without breaking changes.

### **1. Core Concepts**

The new system will be built on three core concepts:

1. **Keybinding Actions:** An "Action" is a command that can be executed
   within the application. It is a pure definition of *what* can be done, not
   *how* it is triggered. Each action has a unique ID, a description for help
   menus, and a callback function.

1. **Keybinding Contexts:** A "Context" is a named set of active key-to-action
   mappings. Contexts are the cornerstone of this design, allowing keybindings
   to behave differently depending on the application's state (e.g., `global`,
   `dialog`, `prompt`).

1. **The Keybinding Manager:** A central singleton service responsible for
   managing a stack of active contexts, processing raw keyboard input, and
   dispatching the correct Action based on the current context.

### **2. The Keybinding Manager and Context Stack**

The `KeybindingManager` will be the single source of truth for input handling.
It will contain a stack of active `KeybindingContext` objects.

- **Context Stack:** When a component becomes active (e.g., a dialog opens),
  it will **push** its context onto the stack. When it becomes inactive, it
  will **pop** its context. This ensures a clean lifecycle tied to the
  component's lifecycle (e.g., via a `useEffect` hook).
- **Input Handling:** The Manager will use a single, top-level `useInput` hook
  in `App.tsx`. When a key is pressed, the Manager will iterate down the
  context stack from the top. The first context that has a mapping for the
  pressed key will handle the event. This creates a natural system of
  precedence: a "dialog" context's keybindings will override a "global"
  context's keybindings.
- **Fallback:** A `global` context will always exist at the bottom of the
  stack to handle application-wide shortcuts.

### **3. Data Structures and Interfaces**

```typescript
// In a new file, e.g., packages/core/src/keybindings/types.ts

/**
 * Defines a command that can be executed.
 * It does NOT include a key mapping.
 */
export interface KeybindingAction {
  id: string; // e.g., 'application.quit', 'prompt.submit', 'prompt.cursor.moveHome'
  description: string;
  callback: (context?: any) => void; // Contextual data can be passed to the callback
}

/**
 * Defines a mapping from a key sequence to an Action ID.
 * This is the structure of our keybindings.json file.
 * Example: { "ctrl+c": "application.quit", "enter": "prompt.submit" }
 */
export type KeybindingMap = Record<string, string>;

/**
 * Represents a named context with its own set of key mappings.
 */
export interface KeybindingContext {
  id: string; // e.g., 'global', 'dialog', 'prompt'
  keymap: KeybindingMap;
}
```

### **4. Implementation Plan**

1. **Create Core Services (`KeybindingManager`):**

   - Implement the `KeybindingManager` class. It will manage the context
     stack, hold a registry of all `KeybindingAction`s, and expose methods
     like `registerAction(action: KeybindingAction)`,
     `pushContext(context: KeybindingContext)`,
     `popContext(contextId: string)`, and `handleKey(key, input)`.
   - It will be responsible for reading `keybindings.json` and a default,
     built-in keymap. User-defined keymaps will override the defaults.

1. **Create a React Hook (`useKeybindingContext`):**

   - Develop a `useKeybindingContext(context: KeybindingContext)` hook.
   - This hook will automatically call `pushContext` on component mount and
     `popContext` on unmount, simplifying lifecycle management for developers.
   - **Example Usage:**
     ```tsx
     const MyDialog = () => {
       const myDialogContext = {
         id: 'my-dialog',
         keymap: { 'escape': 'dialog.close' }
       };
       useKeybindingContext(myDialogContext);

       return <Text>This is a dialog.</Text>;
     };
     ```

1. **Refactor `App.tsx` (Global Context):**

   - First, refactor the global keybindings in `App.tsx`.
   - Define actions like `application.quit` (`Ctrl+C`),
     `application.toggleErrorDetails` (`Ctrl+O`), etc.
   - Register these actions with the `KeybindingManager`.
   - Create a `global` context with the default mappings for these actions.
   - Replace the existing `useInput` hook in `App.tsx` with a single call to
     `keybindingManager.handleKey`.

1. **Refactor `InputPrompt.tsx` (Prompt Context):**

   - This is the most critical step. We will define a `prompt` context.
   - Define a comprehensive set of actions for all text-editing operations
     currently in `InputPrompt.tsx` and `useTextBuffer`: `prompt.submit`,
     `prompt.newline`, `prompt.cursor.moveHome`, `prompt.cursor.moveEnd`,
     `prompt.history.next`, `prompt.killLine.right`, etc.
   - The callbacks for these actions will operate directly on the `TextBuffer`
     instance, which will be passed to them.
   - The `InputPrompt` component will use the `useKeybindingContext` hook to
     push the `prompt` context when it is focused.
   - The complex, stateful `handleInput` function in `InputPrompt.tsx` will be
     completely replaced by this declarative system. The logic will be broken
     down into smaller, independent `KeybindingAction` callbacks.

1. **Implement Keybinding Discovery:**

   - Create a new `/keybindings` slash command.
   - This command will access the `KeybindingManager` to get a list of all
     registered `KeybindingAction`s and their descriptions.
   - It will also show the current key mapping for each action by inspecting
     the loaded contexts, making the system fully discoverable at runtime.

### **5. How This Design Addresses Reviewer Feedback**

- **Context and Scope:** The Context Stack is a direct and robust solution for
  managing scope and precedence, fully addressing the need to handle dialogs,
  `InputPrompt`, and other UI states correctly.
- **Separation of Concerns:** The design strictly separates `Actions` (what)
  from `KeybindingMap` (how), as recommended. The registry only knows about
  actions; the manager maps keys to them based on the active context.
- **Lifecycle Management:** The `useKeybindingContext` hook ties the
  registration and unregistration of contexts directly to the component
  lifecycle, preventing memory leaks and bugs.
- **Complex Components:** The design for the `prompt` context shows a clear
  path to refactoring the complex logic of `InputPrompt` into smaller,
  manageable, and declarative actions without losing any functionality.
- **Concrete Examples:** The plan includes examples of the data structures and
  the `useKeybindingContext` hook to make the proposal more concrete.
