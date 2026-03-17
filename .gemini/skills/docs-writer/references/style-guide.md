# Gemini CLI Documentation Style Guide

As an expert technical writer and editor for the Gemini CLI project, you must ensure the content strictly adheres to these standards.

## Voice and Tone
Adopt a tone that balances professionalism with a helpful, conversational approach.

- **Perspective and tense:** Address the reader as "you." Use active voice and present tense (e.g., "The API returns...").
- **Tone:** Professional, friendly, and direct. 
- **Clarity:** Use simple vocabulary. Avoid jargon, slang, and marketing hype.
- **Global Audience:** Write in standard US English. Avoid idioms and cultural references.
- **Requirements:** Be clear about requirements ("must") vs. recommendations ("we recommend"). Avoid "should."
- **Word Choice:** Avoid "please" and anthropomorphism (e.g., "the server thinks"). Use contractions (don't, it's).

## Language and Grammar
Write precisely to ensure your instructions are unambiguous.

- **Abbreviations:** Avoid Latin abbreviations; use "for example" (not "e.g.") and "that is" (not "i.e.").
- **Punctuation:** Use the serial comma. Place periods and commas inside quotation marks.
- **Dates:** Use unambiguous formats (e.g., "January 22, 2026").
- **Conciseness:** Use "lets you" instead of "allows you to." Use precise, specific verbs.
- **Examples:** Use meaningful names in examples; avoid placeholders like "foo" or "bar."
- **Quota and limit terminology:** For any content involving resource capacity or using the word "quota" or "limit", strictly adhere to the guidelines in the [quota-limit-style-guide.md](quota-limit-style-guide.md) resource file.

## Formatting and Syntax
Apply consistent formatting to make documentation visually organized and accessible.

- **Overview paragraphs:** Every heading must be followed by at least one introductory overview paragraph before any lists or sub-headings.
- **Text wrap:** Wrap text at 80 characters (except long links or tables).
- **Casing:** Use sentence case for headings, titles, and bolded text.
- **Naming:** Always refer to the project as `Gemini CLI` (never `the Gemini CLI`).
- **Lists:** Use numbered lists for sequential steps and bulleted lists otherwise. Keep list items parallel in structure.
- **UI and code:** Use **bold** for UI elements and `code font` for filenames, snippets, commands, and API elements. Focus on the task when discussing interaction.
- **Links:** Use descriptive anchor text; avoid "click here." Ensure the link makes sense out of context.
- **Accessibility:** Use semantic HTML elements correctly (headings, lists, tables).
- **Media:** Use lowercase hyphenated filenames. Provide descriptive alt text for all images.

## Structure
- **BLUF:** Start with an introduction explaining what to expect.
- **Experimental features:** If a feature is clearly noted as experimental, add the following note immediately after the introductory paragraph:
  `> **Note:** This is a preview feature currently under active development.`
- **Headings:** Use hierarchical headings to support the user journey.
- **Procedures:** 
  - Introduce lists of steps with a complete sentence.
  - Start each step with an imperative verb.
  - Number sequential steps; use bullets for non-sequential lists.
  - Put conditions before instructions (e.g., "On the Settings page, click...").
  - Provide clear context for where the action takes place.
  - Indicate optional steps clearly (e.g., "Optional: ...").
- **Elements:** Use bullet lists, tables, notes (`> **Note:**`), and warnings (`> **Warning:**`).
- **Avoid using a table of contents:** If a table of contents is present, remove it.
- **Next steps:** Conclude with a "Next steps" section if applicable.
