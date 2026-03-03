# Specification: Model Router Session Persistence Fix

## Problem

The model auto-router does not persist the user's model selection (e.g., 'Auto
Gemini 3') correctly across sessions. After closing and restarting a session, it
reverts to 'gemini-2.0-flash-lite' for some requests despite the setting showing
otherwise.

## Goal

Ensure that the model selection is correctly persisted and applied to all
subsequent requests after a session restart.

## Scope

- Investigate and related session management logic.
- Verify how model settings are stored and loaded.
- Fix the persistence mechanism to ensure consistency.
