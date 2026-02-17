# Feature Lifecycle

Gemini CLI uses a **Feature Lifecycle** management system to handle the
introduction, maturation, and deprecation of new and optional features.

- [Feature Lifecycle](#feature-lifecycle)
  - [Feature Stages](#feature-stages)
  - [Configuration](#configuration)
    - [Precedence and Reconciliation](#precedence-and-reconciliation)
  - [Available Features](#available-features)
  - [Managing Feature Lifecycle](#managing-feature-lifecycle)
    - [Adding a Feature](#adding-a-feature)
    - [Promoting a Feature](#promoting-a-feature)
    - [Deprecating a Feature](#deprecating-a-feature)
    - [Removing a Feature](#removing-a-feature)
  - [Relevant Documentation](#relevant-documentation)

## Feature Stages

Features progress through the following stages:

| Stage          | Default  | UI Badge       | Description                                                                                 |
| -------------- | -------- | -------------- | ------------------------------------------------------------------------------------------- |
| **ALPHA**      | Disabled | `[ALPHA]`      | Early-access features. May be unstable, change significantly, or be removed without notice. |
| **BETA**       | Enabled  | `[BETA]`       | Features that are well-tested and considered stable. Can be disabled if issues arise.       |
| **GA**         | Enabled  | -              | Stable features that are part of the core product. Cannot be disabled.                      |
| **DEPRECATED** | Disabled | `[DEPRECATED]` | Features scheduled for removal. Using them triggers a warning.                              |

## Configuration

The feature lifecycle can be configured in several ways:

1.  **`settings.json`**: Use the `features` object to toggle specific features
    or entire stages.
    - `features.allAlpha`: Enable/disable all Alpha features.
    - `features.allBeta`: Enable/disable all Beta features.
    - `features.<featureName>`: Toggle an individual feature.
2.  **CLI Flag**: Use `--feature-gates="feat1=true,feat2=false"` for runtime
    overrides.
3.  **Environment Variable**: Set
    `GEMINI_FEATURE_GATES="feat1=true,feat2=false"`.

The stability of each feature is visually indicated in the
[`/settings` UI](/docs/cli/settings.md) with colored badges. **GA** features are
considerd stable and look identical to standard settings.

### Precedence and Reconciliation

When determining if a feature is enabled, the system follows this order of
precedence (highest priority first):

1. **Global Lock**: Features in the **GA** stage are locked to `true` and cannot
   be disabled.
2. **CLI Flags & Environment Variables**: Runtime overrides (`--feature-gates`
   or `GEMINI_FEATURE_GATES`) override persistent settings.
3. **Individual Toggle**: Specific feature toggles in `settings.json` (e.g.,
   `"features": { "plan": true }`).
4. **Meta Toggles**: Stage-wide toggles in `settings.json` (`allAlpha` or
   `allBeta`). For example, if `allAlpha` is `true`, all Alpha features are
   enabled unless specifically disabled by an individual toggle.
5. **Stage Default**: The inherent default for the feature's current stage
   (Alpha: Disabled, Beta/GA: Enabled).

For more details on persistent configuration, see the [Configuration guide].

## Available Features

<!-- FEATURES-AUTOGEN:START -->

| Feature               | Stage | Default  | Since  | Description                                                 |
| --------------------- | ----- | -------- | ------ | ----------------------------------------------------------- |
| `enableAgents`        | ALPHA | Disabled | 0.30.0 | Enable local and remote subagents.                          |
| `extensionConfig`     | BETA  | Enabled  | 0.30.0 | Enable requesting and fetching of extension settings.       |
| `extensionManagement` | BETA  | Enabled  | 0.30.0 | Enable extension management features.                       |
| `extensionRegistry`   | ALPHA | Disabled | 0.30.0 | Enable extension registry explore UI.                       |
| `extensionReloading`  | ALPHA | Disabled | 0.30.0 | Enables extension loading/unloading within the CLI session. |
| `jitContext`          | ALPHA | Disabled | 0.30.0 | Enable Just-In-Time (JIT) context loading.                  |
| `plan`                | ALPHA | Disabled | 0.30.0 | Enable planning features (Plan Mode and tools).             |
| `toolOutputMasking`   | BETA  | Enabled  | 0.30.0 | Enables tool output masking to save tokens.                 |
| `useOSC52Paste`       | ALPHA | Disabled | 0.30.0 | Use OSC 52 sequence for pasting.                            |
| `zedIntegration`      | ALPHA | Disabled | 0.30.0 | Enable Zed integration.                                     |

<!-- FEATURES-AUTOGEN:END -->

## Managing Feature Lifecycle

Maintaining a feature involves promoting it through stages or eventually
deprecating and removing it.

### Adding a Feature

To add a new feature under lifecycle management:

1.  **Define the Feature**: Add a new entry to [`FeatureDefinitions`] in
    [`features.ts`].

    ```typescript
    export const FeatureDefinitions: Record<string, FeatureSpec[]> = {
      // ... existing features
      myNewFeature: [
        {
          lockToDefault: false,
          preRelease: FeatureStage.Alpha,
          since: '0.31.0',
          description: 'Description of my new feature.',
        },
      ],
    };
    ```

    _Note: The `default` field is optional. If omitted, it defaults to `false`
    for Alpha/Deprecated and `true` for Beta/GA._

2.  **Expose in Settings**: Add the feature to the `features` object in
    [`settingsSchema.ts`]. This ensures it appears in the `/settings` UI and is
    validated.
    ```typescript
    features: {
      // ...
      properties: {
        // ...
        myNewFeature: {
          type: 'boolean',
          label: 'My New Feature',
          category: 'Features',
          requiresRestart: true, // or false
          description: 'Description of my new feature.',
          showInDialog: true,
        },
      },
    },
    ```
3.  **Use the Feature**: In your code, check if the feature is enabled using the
    `Config` object.
    ```typescript
    if (this.config.isFeatureEnabled('myNewFeature')) {
      // Feature logic
    }
    ```

### Promoting a Feature

When a feature is ready for the next stage:

1.  **Update [`features.ts`]**: Add a new `FeatureSpec` to the feature's array.
    - **To BETA**: Set `preRelease: FeatureStage.Beta` (Defaults to `true`).
    - **To GA**: Set `preRelease: FeatureStage.GA` (Defaults to `true` and
      locked).
    - Update the `since` version.
2.  **Update [`settingsSchema.ts`]**: Update the `label` and `description` if
    necessary.
3.  **GA Cleanup**: Once a feature is GA and no longer optional, remove the
    feature gate check from the code and make it a core part of the logic.

### Deprecating a Feature

This stage is for **Beta** and **GA** features scheduled for removal.

1.  **Update [`features.ts`]**: Add a new `FeatureSpec` with
    `preRelease: FeatureStage.Deprecated`.
    - Optionally set `default: true` if it should remain enabled during
      deprecation (it defaults to `false`).
    - Optionally set an `until` version to indicate when it will be removed.
2.  **Update [`settingsSchema.ts`]**: Update the description to notify users of
    the deprecation and suggest alternatives.

### Removing a Feature

> **Alpha** features can be removed without formal deprecation. **Beta** and
> **GA** features should typically go through a
> [deprecation period](#deprecating-a-feature) first.

To completely remove a feature:

1.  **Cleanup Code**: Remove all logic and tests associated with the feature.
2.  **Update [`features.ts`]**: Remove the feature from [`FeatureDefinitions`].
3.  **Update [`settingsSchema.ts`]**: Remove the feature from the `features`
    object.
4.  **Legacy Settings**: If the feature had a legacy `experimental` flag, ensure
    its migration logic is cleaned up in [`config.ts`].

## Relevant Documentation

- [Settings Reference]
- [Configuration Layers]

[Configuration guide]: /docs/get-started/configuration.md
[Settings Reference]: /docs/cli/settings.md#features
[Configuration Layers]: /docs/get-started/configuration.md#configuration-layers
[`FeatureDefinitions`]: /packages/core/src/config/features.ts
[`features.ts`]: /packages/core/src/config/features.ts
[`settingsSchema.ts`]: /packages/cli/src/config/settingsSchema.ts
[`config.ts`]: /packages/core/src/config/config.ts
