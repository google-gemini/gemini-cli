# Advanced Model Configuration

This guide details the Model Configuration system within the Gemini CLI.
Designed for researchers, AI quality engineers, and advanced users, this system
provides a rigorous framework for managing generative model hyperparameters and
behaviors.

> **Warning**: This is a power-user feature. Configuration values are passed
> directly to the model provider with minimal validation. Incorrect settings
> (e.g., incompatible parameter combinations) may result in runtime errors from
> the API.

## 1. System Overview

The Model Configuration system (`ModelConfigService`) enables deterministic
control over model generation. It decouples the requested model identifier
(e.g., a CLI flag or agent request) from the underlying API configuration. This
allows for:

- **Precise Hyperparameter Tuning**: Direct control over `temperature`, `topP`,
  `thinkingBudget`, and other SDK-level parameters.
- **Environment-Specific Behavior**: Distinct configurations for different
  operating contexts (e.g., testing vs. production).
- **Agent-Scoped Customization**: Applying specific settings only when a
  particular agent is active.

The system operates on two core primitives: **Aliases** and **Overrides**.

## 2. Configuration Primitives

These settings are located under the `modelConfigs` key in your configuration
file.

### Aliases (`customAliases`)

Aliases are named, reusable configuration presets. Users should define their own
aliases (or override system defaults) in the `customAliases` map.

- **Inheritance**: An alias can `extends` another alias (including system
  defaults like `chat-base`), inheriting its `modelConfig`. Child aliases can
  overwrite or augment inherited settings.
- **Abstract Aliases**: An alias is not required to specify a concrete `model`
  if it serves purely as a base for other aliases.

**Example Hierarchy**:

```json
"modelConfigs": {
  "customAliases": {
    "base": {
      "modelConfig": {
        "generateContentConfig": { "temperature": 0.0 }
      }
    },
    "chat-base": {
      "extends": "base",
      "modelConfig": {
        "generateContentConfig": { "temperature": 0.7 }
      }
    }
  }
}
```

### Overrides (`overrides`)

Overrides are conditional rules that inject configuration based on the runtime
context. They are evaluated dynamically for each model request.

- **Match Criteria**: Overrides apply when the request context matches the
  specified `match` properties.
  - `model`: Matches the requested model name or alias.
  - `overrideScope`: Matches the distinct scope of the request (typically the
    agent name, e.g., `codebaseInvestigator`).

**Example Override**:

```json
"modelConfigs": {
  "overrides": [
    {
      "match": {
        "overrideScope": "codebaseInvestigator"
      },
      "modelConfig": {
        "generateContentConfig": { "temperature": 0.1 }
      }
    }
  ]
}
```

## 3. Resolution Strategy

The `ModelConfigService` resolves the final configuration through a two-step
process:

### Step 1: Alias Resolution

The requested model string is looked up in the merged map of system `aliases`
and user `customAliases`.

1.  If found, the system recursively resolves the `extends` chain.
2.  Settings are merged from parent to child (child wins).
3.  This results in a base `ResolvedModelConfig`.
4.  If not found, the requested string is treated as the raw model name.

### Step 2: Override Application

The system evaluates the `overrides` list against the request context (`model`
and `overrideScope`).

1.  **Filtering**: All matching overrides are identified.
2.  **Sorting**: Matches are prioritized by **specificity** (the number of
    matched keys in the `match` object).
    - Specific matches (e.g., `model` + `overrideScope`) override broad matches
      (e.g., `model` only).
    - Tie-breaking: If specificity is equal, the order of definition in the
      `overrides` array is preserved (last one wins).
3.  **Merging**: The configurations from the sorted overrides are merged
    sequentially onto the base configuration.

## 4. Configuration Reference

The configuration follows the `ModelConfigServiceConfig` interface.

### `ModelConfig` Object

Defines the actual parameters for the model.

| Property                | Type     | Description                                                        |
| :---------------------- | :------- | :----------------------------------------------------------------- |
| `model`                 | `string` | The identifier of the model to be called (e.g., `gemini-2.5-pro`). |
| `generateContentConfig` | `object` | The configuration object passed to the `@google/genai` SDK.        |

### `GenerateContentConfig` (Common Parameters)

Directly maps to the SDK's `GenerateContentConfig`. Common parameters include:

- **`temperature`**: (`number`) Controls output randomness. Lower values (0.0)
  are deterministic; higher values (>0.7) are creative.
- **`topP`**: (`number`) Nucleus sampling probability.
- **`maxOutputTokens`**: (`number`) Limit on generated response length.
- **`thinkingConfig`**: (`object`) Configuration for models with reasoning
  capabilities (e.g., `thinkingBudget`, `includeThoughts`).

## 5. Practical Examples

### Defining a Deterministic Baseline

Create an alias for tasks requiring high precision, extending the standard chat
configuration but enforcing zero temperature.

```json
"modelConfigs": {
  "customAliases": {
    "precise-mode": {
      "extends": "chat-base",
      "modelConfig": {
        "generateContentConfig": {
          "temperature": 0.0,
          "topP": 1.0
        }
      }
    }
  }
}
```

### Agent-Specific Parameter Injection

Enforce extended thinking budgets for a specific agent without altering the
global default, e.g. for the `codebaseInvestigator`.

```json
"modelConfigs": {
  "overrides": [
    {
      "match": {
        "overrideScope": "codebaseInvestigator"
      },
      "modelConfig": {
        "generateContentConfig": {
          "thinkingConfig": { "thinkingBudget": 4096 }
        }
      }
    }
  ]
}
```

### Experimental Model Evaluation

Route traffic for a specific alias to a preview model for A/B testing, without
changing client code.

```json
"modelConfigs": {
  "overrides": [
    {
      "match": {
        "model": "gemini-2.5-pro"
      },
      "modelConfig": {
        "model": "gemini-2.5-pro-experimental-001"
      }
    }
  ]
}
```
