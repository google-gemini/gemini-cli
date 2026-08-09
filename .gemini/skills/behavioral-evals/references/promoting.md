# Promoting Behavioral Evals

Use this guide when asked to analyze nightly results and promote incubated tests
to stable suites.

---

## 1. 🔍 Investigate candidates

1.  **Audit Nightly Logs**: Use the `gh` CLI to fetch results from
    `evals-nightly.yml` (Direct URL:
    `https://github.com/google-gemini/gemini-cli/actions/workflows/evals-nightly.yml`).
    - **Tip**: The aggregate summary from the most recent run integrates the
      last 7 runs of history automatically.
    - **Safety**: DO NOT push changes or start remote runs. All verification is
      local.
2.  **Assess Stability**: Identify tests that pass **100% of the time** across
    ALL enabled models over the **last 7 nightly runs** in a row.
    - _100% means the test passed 3/3 times for every model and run._
3.  **Promotion Targets**: Tests meeting this criteria are candidates for
    promotion from `USUALLY_PASSES` to `ALWAYS_PASSES`.

---

## 2. 🚥 Promotion Steps

1.  **Locate File**: Locate the eval file in the `evals/` directory.
2.  **Update Policy**: Modify the policy argument to `ALWAYS_PASSES`.
    ```typescript
    evalTest('ALWAYS_PASSES', { ... })
    ```
3.  **Targeting**: Follow guidelines in `evals/README.md` regarding stable suite
    organization.
4.  **Constraint**: Your final change must be **minimal and targeted** strictly
    to promoting the test status. Do not refactor the test or setup fixtures.

---

## 3. ✅ Verify

1.  **Run Prompted Tests**: Run the promoted test locally using non-interactive
    Vitest to confirm structure validity.
2.  **Verify Suite Inclusion**: Check that the test is successfully picked up by
    standard runnable ranges.

---

## 4. 📊 Report

Provide a summary of:

- Which tests were promoted.
- Provide the success rate evidence (e.g., 7/7 runs passed for all models).
- If no candidates qualified, list the next closest candidates and their current
  pass rate.
