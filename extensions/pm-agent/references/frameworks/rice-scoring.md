# RICE Scoring Framework

## Overview

RICE is a prioritization framework developed by Intercom that scores items based
on four factors: Reach, Impact, Confidence, and Effort.

## Formula

**RICE Score = (Reach x Impact x Confidence) / Effort**

## Factor Definitions

### Reach

How many users will this affect per time period?

**For OSS projects, estimate using**:

- Issue reaction count (thumbs up, heart)
- Number of duplicate or related issues
- Comment count and unique commenters
- Download/usage metrics if available

| Signal          | Estimated Reach |
| --------------- | --------------- |
| 50+ reactions   | 10,000+ users   |
| 20-49 reactions | 5,000 users     |
| 10-19 reactions | 1,000 users     |
| 5-9 reactions   | 500 users       |
| 1-4 reactions   | 100 users       |
| 0 reactions     | 50 users        |

### Impact

How much will this improve the user experience for each affected user?

| Score | Level   | Description                             |
| ----- | ------- | --------------------------------------- |
| 3     | Massive | Game-changer, completely new capability |
| 2     | High    | Major improvement to existing workflow  |
| 1     | Medium  | Noticeable improvement                  |
| 0.5   | Low     | Minor improvement                       |
| 0.25  | Minimal | Barely noticeable                       |

### Confidence

How confident are we in the Reach and Impact estimates?

| Score | Level  | When to use                           |
| ----- | ------ | ------------------------------------- |
| 100%  | High   | Clear data, well-defined requirements |
| 80%   | Medium | Some data, requirements mostly clear  |
| 50%   | Low    | Limited data, requirements uncertain  |

### Effort

How many person-months will this take?

**For OSS, estimate using**:

- Number of files likely affected
- Whether it requires architecture changes
- Test coverage requirements
- Documentation updates needed
- Similar past issues and their resolution time

| Complexity          | Effort Estimate    |
| ------------------- | ------------------ |
| Simple bug fix      | 0.1 person-months  |
| Small feature       | 0.25 person-months |
| Medium feature      | 0.5 person-months  |
| Large feature       | 1 person-month     |
| Major subsystem     | 2 person-months    |
| Architecture change | 3+ person-months   |

## Example Scoring

| Issue                | Reach | Impact | Confidence | Effort | Score  |
| -------------------- | ----- | ------ | ---------- | ------ | ------ |
| Add dark mode        | 5000  | 1      | 80%        | 0.5    | 8000   |
| Fix crash on startup | 10000 | 3      | 100%       | 0.25   | 120000 |
| Add plugin system    | 1000  | 2      | 50%        | 3      | 333    |

## Interpretation

- Scores are relative, not absolute — compare items within the same backlog
- Very high scores often indicate urgent fixes (high reach, high impact, low
  effort)
- Very low scores may indicate items to defer or reconsider
- Review scores with the team to calibrate estimates
