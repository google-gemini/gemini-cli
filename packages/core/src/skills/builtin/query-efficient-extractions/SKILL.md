---
name: query-efficient-extractions
description: Algorithms for query-efficient neural network hyperplane extractions and model stealing under strict budgets.
---

# Query-Efficient Neural Network Hyperplane & Kink Extractions

When performing neural network hyperplane extraction, boundary locating, or model stealing under strict query limits (e.g. 10,000 queries) or execution timeouts:

## 1. Avoid Brute-Force Finite Difference
NEVER execute full multi-dimensional gradient computations (finite difference `forward()` queries) at every step of a grid search or binary search path. Tracing 1,500 lines with finite differences consumes hundreds of thousands of queries, triggering timeouts and budget exhausts.

## 2. Zero-Gradient Line Subdivision (Bisection)
Since ReLU neural networks are piecewise linear, any line segment $[a, b]$ contains **no activation boundaries** (no neurons crossed) if and only if the midpoint value matches the average of the endpoints:
$$f\left(\frac{a+b}{2}\right) \approx \frac{f(a) + f(b)}{2}$$
*   **Action:** Perform recursive line subdivision on $[0, 1]$ using this midpoint check. This locates discontinuities using only **1 query to `forward()` per step**, achieving exponential precision (e.g., $10^{-8}$) in just ~25-30 queries!

## 3. Post-Hoc Kink Verification
Only calculate the full expensive 10-dimensional gradient at two points straddling a precisely located kink (at $t^* \pm \delta$). This restricts multi-dimensional gradient queries exclusively to when you are 100% certain a true hyperplane exists, reducing query overhead by orders of magnitude.

## 4. Scale-Invariant Thresholding
When locating gradient jumps or kinks, do NOT use hardcoded absolute thresholds like `1e-5` (unseen evaluation networks might have scaled-down weights). Normalize your tolerance tolerance based on the standard deviation of randomly sampled network outputs:
$$\text{tol} = 10^{-5} \times \text{std}(f(X))$$
