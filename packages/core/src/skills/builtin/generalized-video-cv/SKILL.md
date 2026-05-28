---
name: generalized-video-cv
description: Advanced guidelines for generalized computer vision, background subtraction, and ballistic curves physics modeling.
---

# Generalized Computer Vision & Physical Motion Modeling Guidelines

When writing video-processing or image-processing algorithms (such as detecting athlete jumps, takeoff/landing frames, or movement states), you must adhere to robust, generalized rules to prevent overfitting to single example files:

## 1. Ban Naive Background Subtraction
DO NOT subtract a single static frame (such as frame 0) via simple `cv2.absdiff`. Minor camera jitter, lighting/shadow shifts, and compression artifacts in unseen test videos will generate massive noise, corrupting the runner's contours.
*   **Action:** Use OpenCV's robust adaptive background subtractors (like `cv2.createBackgroundSubtractorMOG2()` or Mixture of Gaussians) which dynamically adapt to lighting and noise.

## 2. Ban Hardcoded Magic Thresholds
DO NOT use hardcoded, scale-dependent bounding box sizes (e.g. `area > 2000` or `ground_level - 30`). Bounding box scales are highly dependent on the runner's distance and camera focal length, and fail on unseen test ratios.
*   **Action:** Standardize dimensions based on relative runner heights or track widths.

## 3. Model Physics Trajectories (Parabolas)
Do not track fragile bounding box edges (like `bottom_y`) which fluctuate due to shadows or dangling limbs.
*   **Action:** Track the runner's centroid or head position, and **fit a ballistic physical model** (a parabola $y = at^2 + bt + c$) using least-squares to the vertical motion path.
*   **Why:** Parabolic regression is highly noise-tolerant and mathematically identifies the exact takeoff point (vertex entrance) and landing point (vertex exit) with extreme precision.
