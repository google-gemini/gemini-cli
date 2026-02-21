# Trajectory Teleportation: Antigravity to Gemini CLI

This document explains how the Gemini CLI discovers, reads, and converts
Antigravity (Jetski) trajectories to enable session resumption.

## Overview

The teleportation feature allows you to pick up a conversation in the Gemini CLI
that was started in the Antigravity (Jetski) IDE.

## 1. Discovery

The CLI identifies Antigravity sessions by scanning the local filesystem.

- **Storage Location**: `~/.antigravity/conversations`
- **File Format**: Binary Protobuf files with the `.pb` extension.
- **Session IDs**: The filenames (e.g., `f81d4fae-7dec.pb`) serve as the unique
  identifiers for resumption.

## 2. Decryption & Parsing

Since Antigravity stores data in a specialized binary format, the CLI uses a
dedicated teleporter bundle:

- **Logic**: `trajectory_teleporter.min.js` (bundled in
  `@google/gemini-cli-core`).
- **Process**: The binary `.pb` file is read into a Buffer and passed to the
  teleporter's `trajectoryToJson` function, which outputs a standard JavaScript
  object.

## 3. Conversion Logic

The conversion layer
([converter.ts](file:///Users/sshon/developments/gemini-cli/packages/core/src/teleportation/converter.ts))
translates the technical "Steps" of an Antigravity trajectory into the CLI's
`ConversationRecord` format:

- **User Input**: Maps `CORTEX_STEP_TYPE_USER_INPUT` (type 14) to `user`
  messages.
- **Model Responses**: Maps `CORTEX_STEP_TYPE_PLANNER_RESPONSE` (type 15) to
  `gemini` messages.
- **Thoughts & Reasoning**: Extracts reasoning content from the Antigravity step
  and populates the `thoughts` array in the CLI record, preserving the model's
  logic.
- **Tool Calls**: Maps Antigravity tool execution steps to CLI `ToolCallRecord`
  objects, including status mapping (Success/Error) and argument parsing.

## 4. Session Resumption

Once converted:

1. The record is injected into the CLI's `ChatRecordingService`.
2. Users can continue the conversation seamlessly via the `/chat resume`
   command.

## Maintenance & Updates

You are correct that if Antigravity's Protobuf definitions change, the
`trajectory_teleporter.min.js` bundle will need to be updated to maintain
compatibility.

### When to Update

- If new step types are added to Antigravity that the CLI should support.
- If the binary format of the `.pb` files changes.
- If the encryption key or algorithm is rotated.

### How to Regenerate the Bundle

To keep the CLI up to date:

1. Update `packages/core/src/teleportation/trajectory_teleporter.ts` with any
   logic changes.
2. To build a new minified bundle, you must run it from within the Antigravity
   `Exafunction` workspace because it depends on the complex Protobuf schema
   definitions there
   (`exa/proto_ts/dist/exa/gemini_coder/proto/trajectory_pb.js`).
3. If the Protobuf JS definitions haven't been generated in your `Exafunction`
   project yet, build them first:
   ```bash
   pnpm --dir exa/proto_ts build
   ```
4. Inside the `Exafunction` project root, run:
   ```bash
   pnpm dlx esbuild /path/to/orions-belt/packages/core/src/teleportation/trajectory_teleporter.ts \
     --bundle \
     --minify \
     --format=esm \
     --platform=node \
     --outfile=/path/to/orions-belt/packages/core/src/teleportation/trajectory_teleporter.min.js
   ```
5. Verify the new `trajectory_teleporter.min.js` works locally in the CLI.

> [!TIP] In the long term, this logic could be moved to a shared NPM package
> published from the Antigravity repository, allowing the Gemini CLI to stay
> updated via simple `npm update`. 3. Users can continue the conversation
> seamlessly via the `/chat resume` command.
