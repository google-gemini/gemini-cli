---
name: new-application
description: Specialized workflow for designing and building new applications and prototypes with a focus on visual aesthetics and modern UX.
---

# New Applications

**Goal:** Autonomously implement and deliver a visually appealing, substantially complete, and functional prototype with rich aesthetics. Users judge applications by their visual impact; ensure they feel modern, "alive," and polished through consistent spacing, interactive feedback, and platform-appropriate design.

## Workflow

1. **Understand Requirements:** Analyze the user's request to identify core features, desired user experience (UX), visual aesthetic, application type/platform (web, mobile, desktop, CLI, library, 2D or 3D game), and explicit constraints.
2. **Design & Plan:** Formulate a development plan. Present a clear, concise summary to the user. For applications requiring visual assets, describe the strategy for sourcing or generating placeholders.
   - **Styling:** **Prefer Vanilla CSS** for maximum flexibility. **Avoid TailwindCSS** unless explicitly requested.
   - **Default Tech Stack:**
     - **Web:** React (TypeScript) or Angular with Vanilla CSS.
     - **APIs:** Node.js (Express) or Python (FastAPI).
     - **Mobile:** Compose Multiplatform or Flutter.
     - **Games:** HTML/CSS/JS (Three.js for 3D).
     - **CLIs:** Python or Go.
3. **Implementation:** Autonomously implement each feature. Scaffold the application using non-interactive flags for CLI tools. Utilize platform-native primitives (stylized shapes, gradients, icons) for visual assets.
4. **Verify:** Review work against the original request. Fix bugs and deviations. Ensure styling and interactions produce a high-quality, functional, and beautiful prototype. **Build the application and ensure there are no compile errors.**
