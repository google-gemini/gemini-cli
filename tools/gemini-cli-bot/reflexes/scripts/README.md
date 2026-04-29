# Pulse Reflex Scripts

This directory contains lightweight, high-frequency automation scripts executed by the Pulse workflow (`.github/workflows/gemini-cli-bot-pulse.yml`) every 30 minutes.

## Purpose

Pulse scripts are intended for "reflexive" actions that require faster response times than the daily Brain runs, such as:
- Initial issue triage and labeling.
- Detecting and responding to urgent triggers.
- Basic maintenance tasks.

## Script Format

Scripts should be standalone TypeScript (`.ts`) files and will be executed using `npx tsx`.
