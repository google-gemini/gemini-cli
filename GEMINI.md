## Building and running

Before submitting any changes, it is crucial to validate them by running the full preflight check. This command will build the repository, run all tests, check for type errors, and lint the code.

To run the full suite of checks, execute the following command:

```bash
npm run preflight
```

This single command ensures that your changes meet all the quality gates of the project. While you can run the individual steps (`build`, `test`, `typecheck`, `lint`) separately, it is highly recommended to use `npm run preflight` to ensure a comprehensive validation.

## Writing Tests

This project uses **Vitest** as its primary testing framework. When writing tests, aim to follow existing patterns. Key conventions include:

### Test Structure and Framework

- **Framework**: All tests are written using Vitest (`describe`, `it`, `expect`, `vi`).
- **File Location**: Test files (`*.test.ts` for logic, `*.test.tsx` for React components) are co-located with the source files they test.
- **Configuration**: Test environments are defined in `vitest.config.ts` files.
- **Setup/Teardown**: Use `beforeEach` and `afterEach`. Commonly, `vi.resetAllMocks()` is called in `beforeEach` and `vi.restoreAllMocks()` in `afterEach`.

### Mocking (`vi` from Vitest)

- **ES Modules**: Mock with `vi.mock('module-name', async (importOriginal) => { ... })`. Use `importOriginal` for selective mocking.
  - _Example_: `vi.mock('os', async (importOriginal) => { const actual = await importOriginal(); return { ...actual, homedir: vi.fn() }; });`
- **Mocking Order**: For critical dependencies (e.g., `os`, `fs`) that affect module-level constants, place `vi.mock` at the _very top_ of the test file, before other imports.
- **Hoisting**: Use `const myMock = vi.hoisted(() => vi.fn());` if a mock function needs to be defined before its use in a `vi.mock` factory.
- **Mock Functions**: Create with `vi.fn()`. Define behavior with `mockImplementation()`, `mockResolvedValue()`, or `mockRejectedValue()`.
- **Spying**: Use `vi.spyOn(object, 'methodName')`. Restore spies with `mockRestore()` in `afterEach`.

### Commonly Mocked Modules

- **Node.js built-ins**: `fs`, `fs/promises`, `os` (especially `os.homedir()`), `path`, `child_process` (`execSync`, `spawn`).
- **External SDKs**: `@google/genai`, `@modelcontextprotocol/sdk`.
- **Internal Project Modules**: Dependencies from other project packages are often mocked.

### React Component Testing (CLI UI - Ink)

- Use `render()` from `ink-testing-library`.
- Assert output with `lastFrame()`.
- Wrap components in necessary `Context.Provider`s.
- Mock custom React hooks and complex child components using `vi.mock()`.

### Asynchronous Testing

- Use `async/await`.
- For timers, use `vi.useFakeTimers()`, `vi.advanceTimersByTimeAsync()`, `vi.runAllTimersAsync()`.
- Test promise rejections with `await expect(promise).rejects.toThrow(...)`.

### General Guidance

- When adding tests, first examine existing tests to understand and conform to established conventions.
- Pay close attention to the mocks at the top of existing test files; they reveal critical dependencies and how they are managed in a test environment.

## Git Repo

The main branch for this project is called "main"

## JavaScript/TypeScript

When contributing to this React, Node, and TypeScript codebase, please prioritize the use of plain JavaScript objects with accompanying TypeScript interface or type declarations over JavaScript class syntax. This approach offers significant advantages, especially concerning interoperability with React and overall code maintainability.

### Preferring Plain Objects over Classes

JavaScript classes, by their nature, are designed to encapsulate internal state and behavior. While this can be useful in some object-oriented paradigms, it often introduces unnecessary complexity and friction when working with React's component-based architecture. Here's why plain objects are preferred:

- Seamless React Integration: React components thrive on explicit props and state management. Classes' tendency to store internal state directly within instances can make prop and state propagation harder to reason about and maintain. Plain objects, on the other hand, are inherently immutable (when used thoughtfully) and can be easily passed as props, simplifying data flow and reducing unexpected side effects.

- Reduced Boilerplate and Increased Conciseness: Classes often promote the use of constructors, this binding, getters, setters, and other boilerplate that can unnecessarily bloat code. TypeScript interface and type declarations provide powerful static type checking without the runtime overhead or verbosity of class definitions. This allows for more succinct and readable code, aligning with JavaScript's strengths in functional programming.

- Enhanced Readability and Predictability: Plain objects, especially when their structure is clearly defined by TypeScript interfaces, are often easier to read and understand. Their properties are directly accessible, and there's no hidden internal state or complex inheritance chains to navigate. This predictability leads to fewer bugs and a more maintainable codebase.

- Simplified Immutability: While not strictly enforced, plain objects encourage an immutable approach to data. When you need to modify an object, you typically create a new one with the desired changes, rather than mutating the original. This pattern aligns perfectly with React's reconciliation process and helps prevent subtle bugs related to shared mutable state.

- Better Serialization and Deserialization: Plain JavaScript objects are naturally easy to serialize to JSON and deserialize back, which is a common requirement in web development (e.g., for API communication or local storage). Classes, with their methods and prototypes, can complicate this process.

### Embracing ES Module Syntax for Encapsulation

Rather than relying on Java-esque private or public class members, which can be verbose and sometimes limit flexibility, we strongly prefer leveraging ES module syntax (`import`/`export`) for encapsulating private and public APIs.

- Clearer Public API Definition: With ES modules, anything that is exported is part of the public API of that module, while anything not exported is inherently private to that module. This provides a very clear and explicit way to define what parts of your code are meant to be consumed by other modules.

- Enhanced Testability (Without Exposing Internals): By default, unexported functions or variables are not accessible from outside the module. This encourages you to test the public API of your modules, rather than their internal implementation details. If you find yourself needing to spy on or stub an unexported function for testing purposes, it's often a "code smell" indicating that the function might be a good candidate for extraction into its own separate, testable module with a well-defined public API. This promotes a more robust and maintainable testing strategy.

- Reduced Coupling: Explicitly defined module boundaries through import/export help reduce coupling between different parts of your codebase. This makes it easier to refactor, debug, and understand individual components in isolation.

### Avoiding `any` Types and Type Assertions; Preferring `unknown`

TypeScript's power lies in its ability to provide static type checking, catching potential errors before your code runs. To fully leverage this, it's crucial to avoid the `any` type and be judicious with type assertions.

- **The Dangers of `any`**: Using any effectively opts out of TypeScript's type checking for that particular variable or expression. While it might seem convenient in the short term, it introduces significant risks:
  - **Loss of Type Safety**: You lose all the benefits of type checking, making it easy to introduce runtime errors that TypeScript would otherwise have caught.
  - **Reduced Readability and Maintainability**: Code with `any` types is harder to understand and maintain, as the expected type of data is no longer explicitly defined.
  - **Masking Underlying Issues**: Often, the need for any indicates a deeper problem in the design of your code or the way you're interacting with external libraries. It's a sign that you might need to refine your types or refactor your code.

- **Preferring `unknown` over `any`**: When you absolutely cannot determine the type of a value at compile time, and you're tempted to reach for any, consider using unknown instead. unknown is a type-safe counterpart to any. While a variable of type unknown can hold any value, you must perform type narrowing (e.g., using typeof or instanceof checks, or a type assertion) before you can perform any operations on it. This forces you to handle the unknown type explicitly, preventing accidental runtime errors.

  ```
  function processValue(value: unknown) {
     if (typeof value === 'string') {
        // value is now safely a string
        console.log(value.toUpperCase());
     } else if (typeof value === 'number') {
        // value is now safely a number
        console.log(value * 2);
     }
     // Without narrowing, you cannot access properties or methods on 'value'
     // console.log(value.someProperty); // Error: Object is of type 'unknown'.
  }
  ```

- **Type Assertions (`as Type`) - Use with Caution**: Type assertions tell the TypeScript compiler, "Trust me, I know what I'm doing; this is definitely of this type." While there are legitimate use cases (e.g., when dealing with external libraries that don't have perfect type definitions, or when you have more information than the compiler), they should be used sparingly and with extreme caution.
  - **Bypassing Type Checking**: Like `any`, type assertions bypass TypeScript's safety checks. If your assertion is incorrect, you introduce a runtime error that TypeScript would not have warned you about.
  - **Code Smell in Testing**: A common scenario where `any` or type assertions might be tempting is when trying to test "private" implementation details (e.g., spying on or stubbing an unexported function within a module). This is a strong indication of a "code smell" in your testing strategy and potentially your code structure. Instead of trying to force access to private internals, consider whether those internal details should be refactored into a separate module with a well-defined public API. This makes them inherently testable without compromising encapsulation.

### Embracing JavaScript's Array Operators

To further enhance code cleanliness and promote safe functional programming practices, leverage JavaScript's rich set of array operators as much as possible. Methods like `.map()`, `.filter()`, `.reduce()`, `.slice()`, `.sort()`, and others are incredibly powerful for transforming and manipulating data collections in an immutable and declarative way.

Using these operators:

- Promotes Immutability: Most array operators return new arrays, leaving the original array untouched. This functional approach helps prevent unintended side effects and makes your code more predictable.
- Improves Readability: Chaining array operators often lead to more concise and expressive code than traditional for loops or imperative logic. The intent of the operation is clear at a glance.
- Facilitates Functional Programming: These operators are cornerstones of functional programming, encouraging the creation of pure functions that take inputs and produce outputs without causing side effects. This paradigm is highly beneficial for writing robust and testable code that pairs well with React.

By consistently applying these principles, we can maintain a codebase that is not only efficient and performant but also a joy to work with, both now and in the future.

## React (mirrored and adjusted from [react-mcp-server](https://github.com/facebook/react/blob/4448b18760d867f9e009e810571e7a3b8930bb19/compiler/packages/react-mcp-server/src/index.ts#L376C1-L441C94))

### Role

You are a React assistant that helps users write more efficient and optimizable React code. You specialize in identifying patterns that enable React Compiler to automatically apply optimizations, reducing unnecessary re-renders and improving application performance.

### Follow these guidelines in all code you produce and suggest

Use functional components with Hooks: Do not generate class components or use old lifecycle methods. Manage state with useState or useReducer, and side effects with useEffect (or related Hooks). Always prefer functions and Hooks for any new component logic.

Keep components pure and side-effect-free during rendering: Do not produce code that performs side effects (like subscriptions, network requests, or modifying external variables) directly inside the component's function body. Such actions should be wrapped in useEffect or performed in event handlers. Ensure your render logic is a pure function of props and state.

Respect one-way data flow: Pass data down through props and avoid any global mutations. If two components need to share data, lift that state up to a common parent or use React Context, rather than trying to sync local state or use external variables.

Never mutate state directly: Always generate code that updates state immutably. For example, use spread syntax or other methods to create new objects/arrays when updating state. Do not use assignments like state.someValue = ... or array mutations like array.push() on state variables. Use the state setter (setState from useState, etc.) to update state.

Accurately use useEffect and other effect Hooks: whenever you think you could useEffect, think and reason harder to avoid it. useEffect is primarily only used for synchronization, for example synchronizing React with some external state. IMPORTANT - Don't setState (the 2nd value returned by useState) within a useEffect as that will degrade performance. When writing effects, include all necessary dependencies in the dependency array. Do not suppress ESLint rules or omit dependencies that the effect's code uses. Structure the effect callbacks to handle changing values properly (e.g., update subscriptions on prop changes, clean up on unmount or dependency change). If a piece of logic should only run in response to a user action (like a form submission or button click), put that logic in an event handler, not in a useEffect. Where possible, useEffects should return a cleanup function.

Follow the Rules of Hooks: Ensure that any Hooks (useState, useEffect, useContext, custom Hooks, etc.) are called unconditionally at the top level of React function components or other Hooks. Do not generate code that calls Hooks inside loops, conditional statements, or nested helper functions. Do not call Hooks in non-component functions or outside the React component rendering context.

Use refs only when necessary: Avoid using useRef unless the task genuinely requires it (such as focusing a control, managing an animation, or integrating with a non-React library). Do not use refs to store application state that should be reactive. If you do use refs, never write to or read from ref.current during the rendering of a component (except for initial setup like lazy initialization). Any ref usage should not affect the rendered output directly.

Prefer composition and small components: Break down UI into small, reusable components rather than writing large monolithic components. The code you generate should promote clarity and reusability by composing components together. Similarly, abstract repetitive logic into custom Hooks when appropriate to avoid duplicating code.

Optimize for concurrency: Assume React may render your components multiple times for scheduling purposes (especially in development with Strict Mode). Write code that remains correct even if the component function runs more than once. For instance, avoid side effects in the component body and use functional state updates (e.g., setCount(c => c + 1)) when updating state based on previous state to prevent race conditions. Always include cleanup functions in effects that subscribe to external resources. Don't write useEffects for "do this when this changes" side effects. This ensures your generated code will work with React's concurrent rendering features without issues.

Optimize to reduce network waterfalls - Use parallel data fetching wherever possible (e.g., start multiple requests at once rather than one after another). Leverage Suspense for data loading and keep requests co-located with the component that needs the data. In a server-centric approach, fetch related data together in a single request on the server side (using Server Components, for example) to reduce round trips. Also, consider using caching layers or global fetch management to avoid repeating identical requests.

Rely on React Compiler - useMemo, useCallback, and React.memo can be omitted if React Compiler is enabled. Avoid premature optimization with manual memoization. Instead, focus on writing clear, simple components with direct data flow and side-effect-free render functions. Let the React Compiler handle tree-shaking, inlining, and other performance enhancements to keep your code base simpler and more maintainable.

Design for a good user experience - Provide clear, minimal, and non-blocking UI states. When data is loading, show lightweight placeholders (e.g., skeleton screens) rather than intrusive spinners everywhere. Handle errors gracefully with a dedicated error boundary or a friendly inline message. Where possible, render partial data as it becomes available rather than making the user wait for everything. Suspense allows you to declare the loading states in your component tree in a natural way, preventing “flash” states and improving perceived performance.

### Process

1. Analyze the user's code for optimization opportunities:
   - Check for React anti-patterns that prevent compiler optimization
   - Look for component structure issues that limit compiler effectiveness
   - Think about each suggestion you are making and consult React docs for best practices

2. Provide actionable guidance:
   - Explain specific code changes with clear reasoning
   - Show before/after examples when suggesting changes
   - Only suggest changes that meaningfully improve optimization potential

### Optimization Guidelines

- State updates should be structured to enable granular updates
- Side effects should be isolated and dependencies clearly defined

## Comments policy

Only write high-value comments if at all. Avoid talking to the user through comments.

## General style requirements

Use hyphens instead of underscores in flag names (e.g. `my-flag` instead of `my_flag`).

-                                                                                                   │
  │ 220 + ## TODO │
  │ 221 + │
  │ 222 + - Reflect on the implementation of the `/paste` command. │
  │ 223 + - **Specification**: │
  │ 224 + - The `/paste` command was designed to provide a way for users to input multimodal │
  │ data, specifically images, by pasting base64 data URIs directly into the terminal. │
  │ 225 + - It includes a `--clear` flag to remove any images that have been staged for the next │
  │ prompt. │
  │ 226 + - **Implementation**: │
  │ 227 + - The command's logic is centered around a state management system in the main │
  │ `App.tsx` component. A new `inputMode` state (`'normal'` or `'paste'`) was introduced. │
  │ 228 + - When a user types `/paste`, the `pasteCommand` action switches the `inputMode` to │
  │ `'paste'`. │
  │ 229 + - This change in state triggers the conditional rendering of a new component, │
  │ `PasteHandler.tsx`. │
  │ 230 + - The `PasteHandler` component is responsible for capturing the pasted input. It uses │
  │ a `buffer` to accumulate the text and listens for the "Enter" key to signal completion. │
  │ 231 + - **Bracketed Paste Patch**: │
  │ 232 + - A significant challenge was handling "bracketed paste" mode, a terminal feature that │
  │ wraps pasted text with special escape sequences (`\x1b[200~` and `\x1b[201~`) to prevent │
  │ accidental code execution. │
  │ 233 + - The initial implementation stripped these markers, but a bug was reported where │
  │ valid base64 strings were being rejected. │
  │ 234 + - The root cause was that terminals can also add leading or trailing newlines around │
  │ the pasted content, which caused the validation to fail. │
  │ 235 + - The fix was to `trim()` the input string _before_ stripping the bracketed paste │
  │ markers. This ensures that any extraneous whitespace is removed, allowing for a reliable │
  │ check of the paste markers and the `data:image/...` prefix. │
  │ 236 + - **Performance Optimization**: │
  │ 237 + - Rendering a potentially very large base64 string directly in the terminal would │
  │ cause significant performance issues and UI lag. │
  │ 238 + - To avoid this, the `PasteHandler` component does not display the content of its │
  │ input buffer. Instead, it provides user feedback by rendering `**********` as soon as the │
  │ buffer contains any data, confirming that input is being received without the performance │
  │ overhead. │
  │ 239 + - **Testing Challenges & Reflection**: │
  │ 240 + - The initial tests for this feature were brittle. They failed because they were │
  │ mocking `useInput` at a high level and didn't correctly simulate the sequence of events │
  │ (paste followed by "Enter"). │
  │ 241 + - Subsequent attempts to fix the tests by directly calling the mocked input handler │
  │ also failed due to issues with how React's state updates were being handled in the test │
  │ environment. │
  │ 242 + - The final, correct solution was to use the `stdin.write()` method from the │
  │ `ink-testing-library`. This more accurately simulates a user typing or pasting text and │
  │ then pressing Enter, which triggers the component's state updates and event handlers in │
  │ the way they would run in a real application. This experience highlighted the importance │
  │ of writing tests that mimic real user interaction as closely as possible.

## /paste Command Implementation Reflection

The implementation of the `/paste` command introduced a new modality for providing input to the CLI, specifically for handling large, multi-line base64 data URIs for images. This section reflects on the design, challenges, and key learnings from its development.

### Specification and Design

- **Goal**: To allow users to paste base64 image data directly into the terminal as part of a prompt.
- **Command**: A `/paste` command was introduced to switch the CLI into a special "paste" input mode. A `--clear` flag was added to allow users to discard any images they had staged.
- **State Management**: The core of the implementation involved new state in the main `App.tsx` component:
  - `inputMode`: A state to toggle between `'normal'` and `'paste'` modes.
  - `pastedContent`: An array to store the base64 strings of the staged images.
- **Component-based Handling**: When `inputMode` is switched to `'paste'`, a dedicated `PasteHandler.tsx` component is rendered. This component is responsible for:
  - Capturing all subsequent keyboard input into a buffer.
  - Listening for the "Enter" key to signal the end of the paste operation.
  - Calling back to the main `App` component to add the processed base64 string to the `pastedContent` state.
  - Switching the `inputMode` back to `'normal'`.

### Key Challenges and Solutions

1.  **Bracketed Paste Mode**:
    - **Problem**: Modern terminals use "bracketed paste" mode to prevent accidental execution of pasted code. This wraps pasted text with special escape sequences (e.g., `\x1b[200~...~`). Additionally, terminals often add their own leading/trailing newlines around the pasted content. An initial naive implementation would fail to validate the `data:image/...` prefix because of this extra wrapping.
    - **Solution**: The `PasteHandler` implements a two-step cleaning process. First, it calls `.trim()` on the raw input buffer to remove any extraneous whitespace added by the terminal. Second, it explicitly checks for and removes the standard bracketed paste start and end markers. This robust approach ensures that the core base64 string can be reliably validated and processed.

2.  **Performance with Large Inputs**:
    - **Problem**: Base64 strings for images can be extremely large. Attempting to render this entire string in the Ink-based UI on every keystroke during the paste operation would cause severe performance degradation and UI lag, making the application unusable.
    - **Solution**: To provide user feedback without the performance hit, the `PasteHandler` does not render the content of its input buffer. Instead, as soon as the buffer is non-empty, it renders a simple placeholder (`**********`). This confirms to the user that their input is being captured without the expensive re-rendering of the large data string.

3.  **Build and Test Failures (The Preflight Process)**:
    - The `npm run preflight` command was instrumental in catching several issues before they could become bigger problems.
    - **Type Errors**: A type error was caught because the `Part` type, needed for multimodal input, was not being exported from the `@google/gemini-cli-core` package. This was fixed by adding it to the export list in `packages/core/src/index.ts`.
    - **Brittle Tests**: The tests for `CommandService.test.ts` failed because they contained hardcoded assertions about the number of commands. Adding the new `/paste` command broke these assertions. The fix was to update the expected number in the tests. This served as a reminder that tests should be made as resilient as possible to changes, for example, by dynamically checking for the presence of a command rather than asserting a fixed count.

### Final Learnings

The implementation of `/paste` was a valuable exercise in handling non-trivial user input in a terminal application. It highlighted the importance of understanding terminal-specific features like bracketed paste, the need for performance-conscious UI updates, and the critical role of a comprehensive preflight check in maintaining code quality and catching integration issues early.

A final, subtle bug was discovered after the initial implementation. The logic for submitting a prompt was modified to always wrap the input in a `Part[]` array to support multimodal inputs (text and images). However, the slash command processing logic was only designed to check for commands when the input was a raw `string`. This meant that typing `/paste` would wrap it as `[{ text: '/paste' }]`, causing it to bypass the command handler and be sent directly to the model as a query. The model, in turn, would try to _help implement_ the command instead of executing it.

The fix was to add a special case in the `handleFinalSubmit` function in `App.tsx`. If the input is a slash command and there is no other content (i.e., no pasted images), the input is sent as a raw string, ensuring it is correctly intercepted and executed by the slash command processor. This incident underscored the importance of considering all code paths when refactoring a critical flow like prompt submission.

## TODO: Re-implement /paste Command

The following is a detailed specification for re-implementing the `/paste` command from scratch.

### 1. Command Definition (`pasteCommand.ts`)

- Create a new file `packages/cli/src/ui/commands/pasteCommand.ts`.
- Define a `pasteCommand` object of type `SlashCommand`.
- The command should have the name `paste` and a description.
- The `action` function should:
  - Accept `context: CommandContext` and `args: string` as arguments.
  - Log the received arguments for debugging purposes.
  - If `args.trim() === '--clear'`, it should:
    - Log that the `--clear` flag was detected.
    - Call `context.ui.clearPastedContent()`.
    - Return a message to the user confirming that the staged images have been cleared.
  - If no arguments are provided, it should:
    - Log that it is setting the input mode to "paste".
    - Call `context.ui.setInputMode('paste')`.
    - Log that the input mode has been set.
    - Return a message to the user instructing them on how to paste the data.

### 2. State Management (`App.tsx`)

- Add a new state variable `inputMode` with the type `'normal' | 'paste'` and a default value of `'normal'`.
- Add a new state variable `pastedContent` with the type `string[]` and a default value of `[]`.
- Create a `addPastedContent` function that adds a new base64 string to the `pastedContent` array and adds a confirmation message to the history.
- Create a `clearPastedContent` function that clears the `pastedContent` array.

### 3. Paste Handler Component (`PasteHandler.tsx`)

- Create a new file `packages/cli/src/ui/components/PasteHandler.tsx`.
- The `PasteHandler` component should:
  - Accept `onPaste`, `onCancel`, and `addItem` as props.
  - Use the `useInput` hook to capture user input.
  - When the "Enter" key is pressed:
    - Log the raw buffer and the processed data for debugging.
    - Trim the buffer and remove bracketed paste markers.
    - Check if the processed data is a valid base64 string (either a data URI or raw JPEG data).
    - If it is valid, call the `onPaste` and `addItem` functions.
    - If it is not valid, log an error message.
    - Call the `onCancel` function to return to normal input mode.
  - When the "Escape" key is pressed, call the `onCancel` function.
  - Render a placeholder (`**********`) to provide feedback to the user without lagging the UI.

### 4. App Component (`App.tsx`)

- Conditionally render the `PasteHandler` component when `inputMode` is `'paste'`.
- Pass the `addPastedContent`, `setInputMode`, and `addItem` functions as props to the `PasteHandler`.
- Modify the `handleFinalSubmit` function to:
  - Check if there is any pasted content.
  - If there is, create a `Part[]` array with the text and image data.
  - If there is no pasted content and the input is a slash command, send it as a raw string.
  - Clear the `pastedContent` array after submission.

### 5. Testing

- Create a new test file `packages/cli/src/ui/commands/pasteCommand.test.ts`.
- Write tests to cover the following scenarios:
  - Successfully switching to paste mode.
  - Pasting a valid base64 data URI.
  - Pasting raw base64 JPEG data that gets correctly prefixed.
  - Displaying the immediate confirmation message upon a successful paste.
  - Properly handling the `--clear` flag to remove staged images.
- Ensure that all tests pass and that no existing functionality has been broken.
