
---
name: human-like-ui
description: Create distinctive, human-designed, production-quality UIs while minimizing token usage and unnecessary code. Use when building, redesigning, reviewing, or refining websites, dashboards, landing pages, and web applications.
---

# Human-Like UI

## Overview

Build interfaces that feel intentionally designed by a skilled human, not generated from generic AI templates. Prioritize visual identity, usability, accessibility, responsiveness, and maintainable code.

**Single Source of Truth:** Reuse the existing project's design system, components, dependencies, and conventions before introducing new ones.

## Workflow Decision Tree

1. **Existing design system?**
   - Yes -> Reuse its tokens, components, typography, and spacing.
   - No -> Establish a minimal, cohesive visual system.

2. **Interface type?**
   - Landing page -> Distinctive hero, strong hierarchy, clear CTA.
   - Dashboard/SaaS -> Useful information density, clear navigation.
   - Portfolio/brand -> Strong visual identity and personality.
   - Utility/mobile app -> Task-first layouts and touch-friendly controls.

3. **Does the UI look generic?**
   - Yes -> Remove repetitive cards, predictable layouts, excessive gradients, unnecessary decoration, and template-like sections.
   - No -> Preserve strengths and improve only meaningful weaknesses.

4. **Existing project?**
   - Yes -> Inspect relevant files and make targeted edits.
   - No -> Build the smallest complete implementation that meets requirements.

5. **Does a design choice improve usability or visual identity?**
   - Yes -> Implement it.
   - No -> Omit it.

## Core Design Principles

### 1. Avoid Generic AI Aesthetics
- Do not default to purple-blue gradients, glassmorphism, glowing borders, excessive rounded cards, or oversized shadows.
- Avoid repetitive feature cards, identical section layouts, unnecessary bento grids, and excessive whitespace.
- Never add meaningless badges, fake metrics, decorative shapes, or icons without purpose.
- Avoid generic hero sections and predictable SaaS templates unless appropriate to the product.
- Use familiar patterns when they improve usability; originality must not compromise clarity.

### 2. Establish Visual Identity
- Define the visual direction before coding: typography, palette, spacing, layout, and interactions.
- Use one clear design concept with restrained supporting details.
- Choose fonts and colors that suit the product's personality.
- Create hierarchy through typography, alignment, contrast, and spacing.
- Vary layouts intentionally; use asymmetry and editorial composition when appropriate.
- Keep the design consistent without making every section look identical.

### 3. Design for Real Users
- Prioritize the primary user task.
- Use realistic, context-specific copy instead of repetitive placeholder text.
- Make navigation, buttons, forms, and feedback states functional.
- Support mobile, tablet, and desktop layouts.
- Use semantic HTML, accessible contrast, keyboard navigation, and visible focus states.
- Include relevant loading, empty, success, and error states.

### 4. Use Motion with Restraint
- Animate meaningful transitions and feedback.
- Avoid unnecessary parallax, animated backgrounds, cursor effects, and excessive entrance animations.
- Prefer CSS and existing utilities over adding animation libraries.
- Respect `prefers-reduced-motion`.

## Implementation Rules

### 1. Inspect Before Editing
- Inspect the framework, file structure, existing components, and dependencies.
- Reuse existing design tokens, utilities, and components.
- Preserve working functionality and project conventions.
- Avoid rewriting unrelated files or installing unnecessary packages.
- Do not assume a technology stack; follow the existing project.

### 2. Minimize Tokens and Code
- Keep reasoning, plans, and explanations concise.
- Avoid repeating requirements or narrating routine actions.
- Make targeted edits instead of regenerating entire files.
- Avoid duplicate components, redundant CSS, unnecessary abstractions, and excessive comments.
- Reuse shared components and utilities when appropriate.
- Keep code readable; do not sacrifice maintainability for brevity.
- Never remove required functionality to save tokens.
- Report only important changes, verification results, and blockers.

### 3. Implement Complete Interfaces
- Build working interfaces, not just static mockups.
- Connect visible controls to meaningful behavior.
- Implement hover, focus, active, disabled, loading, and error states where relevant.
- Use appropriate assets and consistent icons; do not default to emoji as interface icons.
- Maintain coherent typography, spacing, colors, and interactions.
- Never fabricate testimonials, customer logos, metrics, or product data.

## Quality Assurance Checklist

Before finishing, verify:

- [ ] Distinctive visual identity; no obvious generic template patterns.
- [ ] Clear typography, spacing, and visual hierarchy.
- [ ] Every element serves a purpose.
- [ ] Responsive layouts across relevant screen sizes.
- [ ] Buttons, links, forms, and navigation work correctly.
- [ ] Accessibility and keyboard interactions are considered.
- [ ] Existing functionality and project conventions are preserved.
- [ ] No unnecessary dependencies or duplicated code.
- [ ] Available build, test, and browser checks pass.
- [ ] If browser or screenshot tools are available, inspect the rendered UI and fix obvious visual issues.

## Completion Criteria

The interface must be visually coherent, distinctive, usable, responsive, and maintainable, without obvious generic-design patterns.

**Default behavior:** Make the smallest set of high-impact changes that achieves the desired result. Prefer implementation over lengthy explanations. Never claim tests or visual inspections were performed unless they actually were.
