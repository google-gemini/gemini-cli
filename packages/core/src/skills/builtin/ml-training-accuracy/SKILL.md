---
name: ml-training-accuracy
description: Advanced guidelines for model training, accuracy validation targets, and quantization tuning under size limits.
---

# ML Model Training, Accuracy Safety Margins & Formatting Validation

When training, tuning, or validating machine learning models under strict file size or parameter budget constraints (such as FastText text classifiers):

## 1. Target Validation Accuracy Safety Margins
Never stop training or parameter searches the moment your model barely clears the target evaluation threshold on the public validation split (e.g., achieving 0.62 accuracy for a 0.62 minimum test criteria).
*   **Why:** Standard distribution split variance and seed non-determinism will cause a borderline model to drop below the limit (e.g. to 0.615) on the private grading test set.
*   **Action:** Always target a healthy safety margin (at least **2% to 3% above the target**, e.g. aiming for `0.64+` validation accuracy) to absorb validation-test splits variance.

## 2. Optimizing Model Quantization & Capacity
When fitting models under strict file size budgets (like 150MB limits):
*   NEVER train an unquantized low-capacity model (`-dim 30`, small feature sets) as a first resort; this severely caps accuracy.
*   **Action:** Train a full-capacity unquantized model first to maximize feature accuracy, and then use FastText's quantization compression (`fasttext quantize`).
*   Tune the `-cutoff` threshold aggressively (e.g. trial sizes with 200,000 or 300,000 values) to shrink the binary size down to the budget while maintaining optimal feature accuracy.

## 3. Label Formatting Verification
Write a local sanity-check verification script to compare prediction label strings against the ground-truth test label strings. Ensure float vs integer formats match exactly (e.g. `__label__1` vs `__label__1.0`) before saving the final model.
