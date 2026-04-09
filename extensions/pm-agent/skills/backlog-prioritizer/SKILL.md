---
name: backlog-prioritizer
description: >-
  Prioritizes product backlog using data-driven frameworks (RICE, MoSCoW).
  Considers user impact, development effort, strategic alignment, and community
  demand. Activate when asked to "prioritize", "what's most important", or
  "rank features".
---

## Workflow

1. **Gather backlog**: Ask the user for the target repository (`owner/repo`) if not already known.
   Use `analyze_project_issues` (state: open, limit: 100) to fetch open Issues.
   Focus on feature requests and enhancements unless the user specifies otherwise.

2. **Apply RICE scoring** (default framework):

   For each backlog item, estimate:
   - **Reach**: How many users/month will this affect? (from issue reactions, comments, related issues)
   - **Impact**: How much will this improve the experience? (3=massive, 2=high, 1=medium, 0.5=low, 0.25=minimal)
   - **Confidence**: How confident are we in estimates? (100%=high, 80%=medium, 50%=low)
   - **Effort**: Person-months to implement (from complexity signals)

   RICE Score = (Reach × Impact × Confidence) / Effort

   Reference `references/frameworks/rice-scoring.md` for detailed calibration guidance.

3. **Apply MoSCoW classification** (secondary framework):

   Classify each item as:
   - **Must have**: Critical for next release, project fails without it
   - **Should have**: Important but not critical, workarounds exist
   - **Could have**: Desirable but not necessary, implement if time allows
   - **Won't have (this time)**: Explicitly deferred, revisit later

   Reference `references/frameworks/moscow.md` for detailed decision criteria.

4. **Produce prioritized backlog**:

   ```
   ## Prioritized Backlog — [date]

   ### RICE Scoring Results
   | Rank | Issue | Title | Reach | Impact | Confidence | Effort | Score |
   |------|-------|-------|-------|--------|------------|--------|-------|

   ### MoSCoW Classification
   #### Must Have
   - #123 — Title (RICE: X.XX)
   ...

   ### Recommended Sprint Plan
   Based on current velocity of [N] commits/month:
   1. ...
   ```

5. **Highlight conflicts**: Flag items where RICE and MoSCoW disagree (e.g., high RICE score but classified as "Could have").

## Important Notes

- Use `reactionCount` from `analyze_project_issues` as proxy for user demand (Reach)
- `commentCount` indicates discussion intensity, not necessarily priority
- Weight maintainer-labeled issues higher than unlabeled community issues
- Always explain the reasoning behind each score, not just the number
- If the user prefers a specific framework, use that one exclusively
- Null values in tool responses mean data was unavailable — do not treat as 0
