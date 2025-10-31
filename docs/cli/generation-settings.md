# Fine-Tuning Your AI: A Guide to Generation Settings

Welcome to the advanced guide for customizing the Gemini CLI. This document will
walk you through the powerful generation settings system, explaining what each
component does, why you might want to use it, and how to get the most out of it.

## 1. Introduction: The "Why" and the "What"

### What are Generation Settings?

At its core, the Gemini CLI interacts with a powerful generative model.
Generation settings are the set of "dials" you can turn to control the behavior
of this model. Think of them like the settings on a camera: you can use the
automatic defaults and get a great result, but for the perfect shot, you might
want to adjust the focus, exposure, and aperture yourself.

The most common settings you'll encounter are:

- **`temperature`**: This is the **creativity dial**. A low temperature (e.g.,
  `0.1`) makes the model's output more predictable and focused—ideal for tasks
  that require precision, like writing code or summarizing a technical document.
  A high temperature (e.g., `0.9`) encourages more diverse and surprising
  results, which is great for creative writing or brainstorming.
- **`topP`**: This setting provides another way to control the model's
  randomness. It tells the model to consider only the most probable set of next
  words. It's an alternative to `temperature` that some users prefer for
  fine-tuning. It's often used to prevent the model from picking very unusual or
  nonsensical words, even at high temperatures.
- **`maxOutputTokens`**: This is a simple but important limit on the length of
  the model's response. It helps control costs and ensures the output remains
  concise.

### Why Control Them?

Controlling these settings allows you to tailor the AI's behavior to your
specific needs, which can vary dramatically from one task to the next.

- **For everyday users**, this means getting better results. If you're writing a
  poem, you can turn up the `temperature` to get more imaginative language. If
  you're asking for a summary of a legal document, you can turn it down to
  ensure the output is precise and factual.

- **For engineers and researchers**, this control is critical. To get
  deterministic, repeatable output for a test suite, you need to lock down the
  generation parameters. When debugging a regression, you might create a
  temporary override to isolate a problem. When evaluating a new model, you can
  fine-tune its settings to find the optimal configuration for your use case.

### A Quick Tour of the New System

To make managing these settings simple and powerful, the Gemini CLI provides two
main tools:

1.  **Aliases**: These are **reusable presets**. An alias is a named shortcut
    for a specific model and a collection of settings. For example, you could
    create a `creative-writing` alias that uses a powerful model with a high
    temperature. This allows you to easily switch between different
    configurations without re-entering the settings every time. Aliases can even
    inherit from each other, making it easy to create a hierarchy of settings.

2.  **Overrides**: These are **context-specific rules**. An override applies a
    set of settings only when certain conditions are met, such as when a
    specific agent (like `codebaseInvestigator`) is running or a particular
    model is being used. This is perfect for highly granular experiments,
    temporary workarounds, or ensuring a specific tool always runs with the
    exact settings it needs for optimal performance.

In the following sections, we'll dive deep into how to use these tools to take
full control of your AI.

## 2. The Building Blocks: Aliases and Overrides

The entire generation settings system is built on two core concepts: **Aliases**
and **Overrides**. Understanding how they work together is the key to mastering
your configuration.

### Aliases: Your Reusable Presets

An alias is a named shortcut for a model and a set of generation settings. Think
of it as a reusable preset or a profile. Instead of specifying
`model: 'gemini-2.5-pro-latest'` and `temperature: 0.1` every time you want
precision, you can simply define a `precise` alias and use that instead.

**Inheritance with `extends`**

The real power of aliases comes from inheritance. You can create a new alias
that `extends` an existing one, inheriting all of its settings. This allows you
to build a clean, hierarchical configuration without repeating yourself
(following the "Don't Repeat Yourself" or DRY principle).

**Abstract Aliases for Maximum Reusability**

An alias does not need to specify a `model` if it is only intended to be a base
for other aliases to `extend`. This makes it an "abstract" alias—a reusable
building block of configuration. This is a powerful feature for creating clean,
DRY (Don't Repeat Yourself) configurations.

For example, you could have a `base` alias that defines your most common
settings, and then create specialized variations:

```json
"generation": {
  "aliases": {
    "base": {
      "settings": {
        "model": "gemini-2.5-pro-latest",
        "config": {
          "temperature": 0.7,
          "topP": 0.95
        }
      }
    },
    "creative-flash": {
      "extends": "base",
      "settings": {
        "model": "gemini-2.5-flash-latest",
        "config": {
          "temperature": 0.9
        }
      }
    }
  }
}
```

In this example, `creative-flash` inherits the `topP` of `0.95` from `base` but
overrides the `model` and `temperature`.

**Default Aliases: Your Starting Point**

The Gemini CLI comes with a set of default aliases to get you started. The most
important one is `chat-base`, which provides sensible defaults for the flagship
`gemini-2.5-pro-latest` model. Other defaults like `gemini-2.5-pro`,
`gemini-2.5-flash`, and `gemini-2.5-flash-lite` all extend this `chat-base`
alias, providing convenient shortcuts for the latest models. You can view the
full default configuration in the application settings.

### Overrides: Context-Specific Rules

Overrides are powerful rules that apply specific settings only when certain
conditions are met. While an alias is a stable preset, an override is a dynamic,
conditional modification. This makes them perfect for experimentation, temporary
workarounds, or fine-tuning the behavior of a specific agent.

An override consists of two parts: a `match` block and a `settings` block.

- The `match` block defines the conditions. You can match based on the `agent`
  name (e.g., `codebaseInvestigator`) or the `model` being used (which can be a
  raw model name or an alias).
- The `settings` block defines the configuration to apply if the conditions are
  met.

For example, let's say you want the `codebaseInvestigator` agent to be extremely
precise, regardless of the model you're currently using. You could add this
override:

```json
"generation": {
  "overrides": [
    {
      "match": {
        "agent": "codebaseInvestigator"
      },
      "settings": {
        "config": {
          "temperature": 0.05
        }
      }
    }
  ]
}
```

Now, whenever the `codebaseInvestigator` runs, its temperature will be set to
`0.05`, overriding any value set by the active alias. This is a clean way to
enforce agent-specific behavior without cluttering your stable, reusable
aliases.

## 3. Practical Recipes & Common Use Cases

This section provides hands-on, copy-pasteable examples to solve common problems
and illustrate the power of the generation settings system.

### Recipe 1: Creating a "Precise" Profile

**Goal:** Create a reusable profile for tasks that require deterministic,
predictable output, such as code generation or factual summarization.

**Solution:** Add a `precise` alias to your settings file that extends the
`chat-base` alias but sets a very low temperature.

```json
"generation": {
  "aliases": {
    "precise": {
      "extends": "chat-base",
      "settings": {
        "config": {
          "temperature": 0.1
        }
      }
    }
  }
}
```

**Usage:** Now, when you need precise output, you can simply specify `precise`
as your model. For example: `> @gemini --model precise summarize this document`.

### Recipe 2: Making a Specific Agent More Creative

**Goal:** Ensure a specific agent, like a hypothetical `brainstorming-agent`,
always generates creative and diverse ideas, without affecting other operations.

**Solution:** Add an override that targets the agent by name and increases its
temperature.

```json
"generation": {
  "overrides": [
    {
      "match": {
        "agent": "brainstorming-agent"
      },
      "settings": {
        "config": {
          "temperature": 0.95
        }
      }
    }
  ]
}
```

**Usage:** This demonstrates the synergy between aliases and overrides. You can
continue using your standard model aliases (`gemini-2.5-pro`,
`gemini-2.5-flash`, etc.) for all your prompts. When you invoke the
`brainstorming-agent`, this override will automatically activate, turning up the
creativity dial just for that agent.

### Recipe 3: A/B Testing a New Model

**Goal:** You're a researcher evaluating a new, unreleased model and want to
find its optimal settings without changing your stable, day-to-day aliases.

**Solution:** Add an override that matches the raw model name and applies your
experimental settings.

```json
"generation": {
  "overrides": [
    {
      "match": {
        "model": "gemini-2.5-pro-next-preview"
      },
      "settings": {
        "config": {
          "temperature": 0.4,
          "topK": 30
        }
      }
    }
  ]
}
```

**Usage:** Now, any time you use the raw model name
`gemini-2.5-pro-next-preview`, these specific settings will be applied. This
allows you to test the new model thoroughly while your main aliases
(`gemini-2.5-pro`, etc.) remain unaffected, ensuring your production workflows
are stable.

### Recipe 4: Creating a Hierarchy of Settings

**Goal:** You want to create a family of specialized aliases for `flash` models
that share some common settings, while still inheriting from the global
`chat-base`.

**Solution:** Create an intermediate `chat-base-flash` alias that extends
`chat-base`, and then have your more specific aliases extend `chat-base-flash`.

```json
"generation": {
  "aliases": {
    "chat-base-flash": {
      "extends": "chat-base",
      "settings": {
        "model": "gemini-2.5-flash-latest"
      }
    },
    "classifier-flash": {
      "extends": "chat-base-flash",
      "settings": {
        "config": {
          "temperature": 0,
          "topP": 1,
          "maxOutputTokens": 1024
        }
      }
    }
  }
}
```

**Usage:** This is a best practice for managing complex configurations. The
`classifier-flash` alias inherits its `model` from `chat-base-flash`, which in
turn inherits global settings like `topP` from `chat-base`. If you ever need to
update a setting for all flash models, you only need to change it in one place:
`chat-base-flash`.

## 4. Under the Hood: The Resolution Logic

For engineers, researchers, and anyone who wants to understand the precise
behavior of the configuration system, this section provides a deep dive into the
resolution logic. Understanding this process is key to predicting exactly what
settings will be applied in any given context.

The final generation configuration is determined by a strict, two-step process
that is executed for every model call.

### The Two-Step Process

#### Step 1: Alias Resolution (Establish the Base)

First, the system takes the `model` string provided in the context (e.g.,
`gemini-2.5-pro`, `classifier`, or a custom alias) and resolves it to a base
configuration.

1.  **Check if it's an alias:** The system looks for the `model` string as a key
    in the `generation.aliases` map.
2.  **Resolve the `extends` chain:** If it is an alias and it has an `extends`
    property, the system recursively follows the chain, merging the settings at
    each step. Settings from the child alias (the one with the `extends` key)
    overwrite settings from the parent. This continues until it reaches a base
    alias that has no `extends` property.
3.  **Establish Base Config:** The fully resolved alias, with its final `model`
    name and merged `config` object, becomes the **base configuration** for the
    next step.
4.  **Handle Raw Model Names:** If the provided `model` string is not an alias,
    it's treated as a direct model name. In this case, the system starts with an
    empty configuration.

At the end of this step, we have a starting model name and a base set of
configuration parameters.

### Step 2: Override Application (Apply Specific Rules)

Next, the system scans the `overrides` array from top to bottom and applies any
rules that match the current context.

1.  **Identify all matches:** The system finds every override rule where the
    `match` object is a subset of the current context. The context includes the
    `agent` name and the **resolved model name** from Step 1. A rule can also
    match against the original alias provided in the initial context.
2.  **Apply rules based on specificity:** All matching rules are applied in a
    specific order to the base configuration. The settings from each matching
    override are merged on top of the current configuration. This is done by
    sorting the matches first, ensuring that the most specific rules are applied
    _last_, giving them the final say.

### The Rules of Specificity

When multiple overrides match a given context, the system uses a clear set of
rules to determine which one "wins":

1.  **Specificity:** The specificity of a rule is determined by the number of
    keys in its `match` object. A rule with
    `match: { agent: "...", model: "..." }` (specificity 2) is more specific
    than a rule with `match: { agent: "..." }` (specificity 1). The more
    specific rule is applied later, so its values take precedence.
2.  **Tie-Breaking:** If multiple matching rules have the same specificity, the
    one that appears **last** in the `overrides` array wins. This makes the
    system predictable: for rules of equal weight, the final one in the list has
    the final word.

### Walkthrough: A Complex Example

Let's trace the resolution process with a complete example.

**Configuration:**

```json
"generation": {
  "aliases": {
    "base": {
      "settings": {
        "model": "gemini-2.5-pro-latest",
        "config": { "temperature": 0.7, "topP": 0.9 }
      }
    },
    "flashy": {
      "extends": "base",
      "settings": {
        "model": "gemini-2.5-flash-latest",
        "config": { "temperature": 0.8 }
      }
    }
  },
  "overrides": [
    {
      "match": { "model": "gemini-2.5-flash-latest" },
      "settings": { "config": { "topP": 0.95 } }
    },
    {
      "match": { "agent": "file-agent" },
      "settings": { "config": { "temperature": 0.2, "maxOutputTokens": 4000 } }
    },
    {
      "match": { "agent": "file-agent", "model": "flashy" },
      "settings": { "config": { "temperature": 0.25 } }
    }
  ]
}
```

**Context:**

The application needs a model for the `file-agent`, and it requests the `flashy`
alias. `{ agent: "file-agent", model: "flashy" }`

**Resolution Steps:**

1.  **Alias Resolution:**
    - The system looks up the `flashy` alias.
    - It sees `extends: "base"`. It first resolves `base`.
    - `base` provides
      `{ model: "gemini-2.5-pro-latest", config: { temperature: 0.7, topP: 0.9 } }`.
    - The `flashy` settings are merged on top. The `model` is replaced, and
      `temperature` is overridden.
    - **Base Configuration is:**
      `{ model: "gemini-2.5-flash-latest", config: { temperature: 0.8, topP: 0.9 } }`.

2.  **Override Application:**
    - The system now looks for matching overrides using the context
      `{ agent: "file-agent", model: "gemini-2.5-flash-latest" }` and the
      original alias `flashy`.
    - **Match 1:** The first override
      `match: { model: "gemini-2.5-flash-latest" }` matches. **Specificity: 1**.
    - **Match 2:** The second override `match: { agent: "file-agent" }` matches.
      **Specificity: 1**.
    - **Match 3:** The third override
      `match: { agent: "file-agent", model: "flashy" }` matches on the original
      alias. **Specificity: 2**.

3.  **Sorting and Applying:**
    - The matches are sorted by specificity, then by order. The most specific
      match (`Match 3`) will be applied last. The two matches with specificity 1
      are applied in their original order.
    - **Start:** `config: { temperature: 0.8, topP: 0.9 }`
    - **Apply Match 1:** `topP` is updated.
      `config: { temperature: 0.8, topP: 0.95 }`
    - **Apply Match 2:** `temperature` and `maxOutputTokens` are updated/added.
      `config: { temperature: 0.2, topP: 0.95, maxOutputTokens: 4000 }`
    - **Apply Match 3:** `temperature` is updated again.
      `config: { temperature: 0.25, topP: 0.95, maxOutputTokens: 4000 }`

**Final Resolved Configuration:**

- **`model`**: `"gemini-2.5-flash-latest"`
- **`sdkConfig`**:
  `{ "temperature": 0.25, "topP": 0.95, "maxOutputTokens": 4000 }`

## 5. Full Configuration Reference

This section provides a technical breakdown of the objects and properties
available within the `generation` settings.

### Schema Definition

The following is a representation of the complete structure of the `generation`
object.

#### Top-Level Object

The main object in your settings file.

```typescript
interface Generation {
  // A map of reusable, named presets for generation settings.
  aliases?: Record<string, Alias>;

  // A list of rules that apply settings based on context.
  overrides?: Override[];
}
```

#### `Alias` Object

Defines a reusable preset. Each key in the `generation.aliases` map is the alias
name, and the value is an `Alias` object.

```typescript
interface Alias {
  // Optional. The name of another alias to inherit settings from.
  extends?: string;

  // The settings this alias defines.
  settings: Settings;
}
```

#### `Override` Object

Defines a conditional rule. Each item in the `generation.overrides` array is an
`Override` object.

```typescript
interface Override {
  // The conditions under which this override will be applied.
  match: Match;

  // The settings to apply when the conditions are met.
  settings: Settings;
}
```

#### `Settings` Object

Contains the actual model and configuration parameters. Used in both `Alias` and
`Override`.

```typescript
interface Settings {
  // The underlying model name to use (e.g., "gemini-2.5-pro-latest").
  model?: string;

  // A configuration object passed directly to the @google/genai SDK.
  config?: Partial<GenerationConfig>;
}
```

#### `Match` Object

Defines the conditions for an `Override` to be applied.

```typescript
interface Match {
  // Matches if the context includes an agent with this name.
  agent?: string;

  // Matches if the context's model is this raw model name OR this alias.
  model?: string;
}
```

### Common Generation Parameters

The `settings.config` object accepts any valid parameter from the
`@google/genai` library's `GenerationConfig`. While there are many options
available, the following are the most common ones used for tuning model
behavior.

- **`temperature`**
  - **Type**: `number` (Range: `0.0` to `1.0`)
  - **Description**: Controls the degree of randomness in token selection. Lower
    values (e.g., `0.1`) make the model more deterministic and are good for
    precision tasks. Higher values (e.g., `0.9`) encourage more diverse and
    creative results.
- **`topP`**
  - **Type**: `number` (Range: `0.0` to `1.0`)
  - **Description**: An alternative to `temperature` for controlling randomness.
    It tells the model to select from the smallest possible set of tokens whose
    cumulative probability exceeds the `topP` value.
- **`topK`**
  - **Type**: `number` (integer, >= `1`)
  - **Description**: Tells the model to select the next token from the `topK`
    most probable tokens.
- **`maxOutputTokens`**
  - **Type**: `number` (integer, >= `1`)
  - **Description**: The maximum number of tokens that the model will generate
    in its response.

For a complete list of all available properties, please refer to the official
documentation for the `@google/genai` library.

### Default Aliases

The Gemini CLI includes a set of pre-configured aliases to provide a sensible
starting point and convenient shortcuts to the latest models.

The most important default aliases are:

- **`chat-base`**: The foundational alias that provides the default
  `temperature` and `topP` settings for the flagship `gemini-2.5-pro-latest`
  model.
- **`gemini-2.5-pro`**: Extends `chat-base` and explicitly sets the model to
  `gemini-2.5-pro`.
- **`gemini-2.5-flash`**: Extends `chat-base` and sets the model to
  `gemini-2.5-flash`.
- **`gemini-2.5-flash-lite`**: Extends `chat-base` and sets the model to
  `gemini-2.5-flash-lite`.

Many other default aliases for specific tasks (e.g., `classifier`,
`summarizer-v1`) also exist and extend the `chat-base` alias.

**Source of Truth**: Because these aliases may be updated over time to point to
newer model versions, the single source of truth for their exact, up-to-date
values is the `DEFAULT_GENERATION_CONFIG` object in
`packages/core/src/config/defaultGenerationConfig.ts`. We strongly recommend
advanced users consult this file for the most current details.
