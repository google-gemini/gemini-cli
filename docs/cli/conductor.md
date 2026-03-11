# Conductor

**Measure twice, code once.**

Conductor is a built-in methodology for Gemini CLI that enables **Context-Driven
Development**. It turns the Gemini CLI into a proactive project manager that
follows a strict protocol to specify, plan, and implement software features and
bug fixes.

Instead of just writing code, Conductor ensures a consistent, high-quality
lifecycle for every task: **Context -> Spec & Plan -> Implement**.

The philosophy behind Conductor is simple: control your code. By treating
context as a managed artifact alongside your code, you transform your repository
into a single source of truth that drives every agent interaction with deep,
persistent project awareness.

## Features

- **Plan before you build**: Create specs and plans that guide the agent for new
  and existing codebases.
- **Maintain context**: Ensure AI follows style guides, tech stack choices, and
  product goals.
- **Iterate safely**: Review plans before code is written, keeping you firmly in
  the loop.
- **Work as a team**: Set project-level context for your product, tech stack,
  and workflow preferences that become a shared foundation for your team.
- **Build on existing projects**: Intelligent initialization for both new
  (Greenfield) and existing (Brownfield) projects.
- **Smart revert**: A git-aware revert command that understands logical units of
  work (tracks, phases, tasks) rather than just commit hashes.

## Usage

Conductor is designed to manage the entire lifecycle of your development tasks.
It is one of the [planning workflows](./plan-mode.md#planning-workflows)
supported by Gemini CLI.

**Note on Token Consumption:** Conductor's context-driven approach involves
reading and analyzing your project's context, specifications, and plans. This
can lead to increased token consumption, especially in larger projects or during
extensive planning and implementation phases. You can check the token
consumption in the current session by running `/stats model`.

### 1. Set Up the Project (Run Once)

When you run `/conductor:setup`, Conductor helps you define the core components
of your project context. This context is then used for building new components
or features by you or anyone on your team.

- **Product**: Define project context (e.g. users, product goals, high-level
  features).
- **Product guidelines**: Define standards (e.g. prose style, brand messaging,
  visual identity).
- **Tech stack**: Configure technical preferences (e.g. language, database,
  frameworks).
- **Workflow**: Set team preferences (e.g. TDD, commit strategy).

**Generated Artifacts:**

- `conductor/product.md`
- `conductor/product-guidelines.md`
- `conductor/tech-stack.md`
- `conductor/workflow.md`
- `conductor/code_styleguides/`
- `conductor/tracks.md`

```bash
/conductor:setup
```

### 2. Start a New Track (Feature or Bug)

When you’re ready to take on a new feature or bug fix, run
`/conductor:newTrack`. This initializes a **track** — a high-level unit of work.
Conductor helps you generate two critical artifacts:

- **Specs**: The detailed requirements for the specific job. What are we
  building and why?
- **Plan**: An actionable to-do list containing phases, tasks, and sub-tasks.

**Generated Artifacts:**

- `conductor/tracks/<track_id>/spec.md`
- `conductor/tracks/<track_id>/plan.md`
- `conductor/tracks/<track_id>/metadata.json`

```bash
/conductor:newTrack
# OR with a description
/conductor:newTrack "Add a dark mode toggle to the settings page"
```

### 3. Implement the Track

Once you approve the plan, run `/conductor:implement`. Your coding agent then
works through the `plan.md` file, checking off tasks as it completes them.

**Updated Artifacts:**

- `conductor/tracks.md` (Status updates)
- `conductor/tracks/<track_id>/plan.md` (Status updates)
- Project context files (Synchronized on completion)

```bash
/conductor:implement
```

Conductor will:

1.  Select the next pending task.
2.  Follow the defined workflow (e.g., TDD: Write Test -> Fail -> Implement ->
    Pass).
3.  Update the status in the plan as it progresses.
4.  **Verify Progress**: Guide you through a manual verification step at the end
    of each phase to ensure everything works as expected.

During implementation, you can also:

- **Check status**: Get a high-level overview of your project's progress.
  ```bash
  /conductor:status
  ```
- **Revert work**: Undo a feature or a specific task if needed.

  ```bash
  /conductor:revert
  ```

- **Review work**: Review completed work against guidelines and the plan.
  ```bash
  /conductor:review
  ```

## Commands Reference

| Command                | Description                                                                             | Artifacts                                                                                                                                    |
| :--------------------- | :-------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------- |
| `/conductor:setup`     | Scaffolds the project and sets up the Conductor environment. Run this once per project. | `conductor/product.md`<br>`conductor/product-guidelines.md`<br>`conductor/tech-stack.md`<br>`conductor/workflow.md`<br>`conductor/tracks.md` |
| `/conductor:newTrack`  | Starts a new feature or bug track. Generates `spec.md` and `plan.md`.                   | `conductor/tracks/<id>/spec.md`<br>`conductor/tracks/<id>/plan.md`<br>`conductor/tracks.md`                                                  |
| `/conductor:implement` | Executes the tasks defined in the current track's plan.                                 | `conductor/tracks.md`<br>`conductor/tracks/<id>/plan.md`                                                                                     |
| `/conductor:status`    | Displays the current progress of the tracks file and active tracks.                     | Reads `conductor/tracks.md`                                                                                                                  |
| `/conductor:revert`    | Reverts a track, phase, or task by analyzing git history.                               | Reverts git history                                                                                                                          |
| `/conductor:review`    | Reviews completed work against guidelines and the plan.                                 | Reads `plan.md`, `product-guidelines.md`                                                                                                     |
