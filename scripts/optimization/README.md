# Prompt optimization pipeline

This directory contains the infrastructure for optimizing Gemini CLI system
instructions and tool descriptions. The pipeline uses a manifest-driven approach
to isolate, mask, and refine instructions to achieve high tool-call accuracy
with minimalist token usage.

## Overview

The pipeline automates the "Success Density" strategy, which aims for 100%
functional correctness while minimizing prompt length. It achieves this through
multi-objective optimization using the Genetic-Pareto Algorithm (GEPA).

## Architecture

The optimization infrastructure consists of three primary components that handle
data extraction, variable protection, and evolutionary refinement.

- `extract.ts`: The pre-processing engine. It uses character-aware parsing to
  isolate prompt strings from TypeScript source files based on the targets
  defined in `data/manifest.json`.
- `masking.ts`: A security and integrity utility. It identifies and replaces
  TypeScript template variables (for example, `${FILE_PATH}`) with indexed
  tokens (for example, `[[GCLI_VAR_0]]`). This prevents the LLM from corrupting
  program logic during the optimization phase.
- `optimize.ts`: The core evolution engine. It runs the GEPA loop to find the
  Pareto frontier between functional alignment and instruction brevity.

## Metrics

The pipeline evaluates every prompt candidate using two primary objectives. Both
metrics return a score between 0.0 and 1.0, where 1.0 represents a perfect
result.

1.  **Functional alignment:** Measures how accurately the model selects the
    correct tool for a given user query. It uses the 113 high-signal scenarios
    in `data/tool_alignment.jsonl` to verify behavioral correctness.
2.  **Brevity:** A 4-tier step function that rewards concise model responses. It
    measures the word count of the model's output text (excluding tool calls) to
    penalize unnecessary verbosity.
    - **1.0:** 10 words or fewer.
    - **0.7:** 25 words or fewer.
    - **0.4:** 50 words or fewer.
    - **0.1:** More than 50 words.

## Workflow

Follow these steps to run the optimization pipeline.

1.  **Extraction:** Run `npm run optimize:extract` to pull instructions from the
    source code and generate the `data/optimization/targets.json` artifact.
2.  **Configuration:** Update `scripts/optimization/optimization.config.json` to
    specify the student and teacher models and the number of trials.
3.  **Optimization:** Run `npm run optimize` to start the GEPA evolution. This
    process produces a refined prompt that maintains accuracy while reducing
    tokens.

## Next steps

After a successful optimization run, use the generated Pareto-optimal
instructions to update the core snippets and tool definitions.
