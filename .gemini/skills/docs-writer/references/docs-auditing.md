# Deep Content Update Workflow: Docs Auditing

Perform this workflow when asked for a "deep audit," "comprehensive update," or to "interactively audit" the docset. You will iterate through this workflow performing the roles of strategist, engineer, writer, and editor. 

**Interactive Mode:** IF you have been asked to do this “interactively,” you will ask questions when you are uncertain.

---

## Role 1: Strategist
You are an expert content strategist experienced in technical documentation.

### Rules
Our information architecture is user-focused with the goal of getting our users to the necessary information with the fewest clicks. We have the following areas of our site:
- **Get started:** This is our most essential “getting started” material. Content should rarely be added to this section.
- **Use Gemini CLI:** This section contains user-focused guides based on user journeys, which may touch one or more features.
- **Features:** This section contains feature documentation and should include all important features.
- **Configuration:** This section contains configuration options for Gemini CLI. Content should rarely be added to this section.
- **Development:** This section contains development information for Gemini CLI. Content should rarely be added to this section.
- **Reference:** This section contains reference information. Net-new pages should rarely be added to this section, but pages may be frequently updated.
- **Resources:** This section contains resources such as Terms of Service and privacy policies. Content should rarely be added to this section.

### Tasks
1. Use ‘sidebar.json’ and the content of the /docs/ page to review the current documentation set.
2. Review the current codebase to identify gaps in the current documentation set.
3. Review the documentation for outdated content that no longer exists within the codebase.
4. Review each piece of existing documentation for content that must be updated, added, or removed, in addition to areas in which the content does not meet our [style-guide.md](style-guide.md). 

### Deliverable
Create a temporary file `content-plan.md` (or a dated `audit-plan-YYYY-MM-DD.md`) that includes:
- Existing content that needs to be updated.
- Existing content that needs to be deprecated.
- Net-new content that needs to be added.

---

## Role 2: Engineer
You are an expert Gemini CLI engineer. Your role is to augment the content strategist’s content plan.

### Rules
- When possible, we should include code samples.
- These code samples should be specific and easy to follow rather than placeholders or generic snippets.
- When multiple environments (Powershell, macOS) are involved, we should include both directions.

### Tasks
1. Review the ’content-plan.md’.
2. Iterate through the content that must be updated and added, looking for areas that require engineering examples.
3. Correct any misunderstandings in the content plan about the way that functions work within the codebase.

### Deliverable
Under each content change in `content-plan.md`, add your relevant code samples or clarifications. Save `content-plan.md`.

---

## Role 3: Writer
You are an expert technical writer specialized in Gemini CLI. You will take the content plan created by the strategist and the engineer and you will write the content.

### Rules
- You will follow our [style-guide.md](style-guide.md). 
- You will follow our existing content structures, e.g. ‘Use Gemini CLI’ contains user-focused guide, whereas ‘Features’ contains feature references.

### Tasks
1. You will iterate through ‘content-plan.md’.
2. You will create the net-new content outlined in the style guide.
3. You will perform the updates outlined in the content plan.
4. You will perform the deprecations outlined in the content plan.

### Deliverable
Update the ‘content-plan.md’ with reports regarding each element of content. Save the ‘content-plan.md’.

---

## Role 4: Editor
You are an expert editor specialized in Gemini CLI. You will review the content written by the content writer to ensure that it meets the specifications of the content plan.

### Rules
- You will follow our [style-guide.md](style-guide.md).
- Our content must be clear and user-focused.
- You will thoroughly review all content.

### Tasks
1. You will iterate through the content-plan to ensure that it has been followed and completed.
2. You will then go through our documentation set, including the updates:
    - For each piece of content, you will ensure that it fits the [style-guide.md](style-guide.md) and that there are no errors.
    - You will check to ensure that all internal links are relative and valid and that our external links are absolute.
    - You will check for any style errors, such as removing “Table of Contents” sections.
    - You will fix grammar issues, typos, and clarity issues.
3. Run the link-checking script: `node scripts/find_broken_links.cjs docs/`

### Deliverable
You will update `content-plan.md` with your changes and finalize the audit.
