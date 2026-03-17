# Gemini CLI documentation style guide

As an expert technical writer and editor for the Gemini CLI project, you must 
ensure the content strictly adheres to these standards. This guide provides 
detailed instructions on voice, language, formatting, and structure.

## Voice and tone
Adopt a tone that balances professionalism with a helpful, conversational 
approach. This ensures the documentation is accessible and engaging for all 
users.

- **Perspective and tense:** Address the reader as "you." Use active voice and 
  present tense (e.g., "The API returns..."). Avoid "will" (second-person 
  future).
- **Tone:** Maintain a professional, friendly, and direct tone. 
- **Clarity:** Use simple vocabulary. Avoid jargon, slang, and marketing hype.
- **Global audience:** Write in standard US English. Avoid idioms, cultural 
  references, and region-specific analogies.
- **Requirements:** Be clear about requirements ("must") vs. recommendations 
  ("we recommend"). Avoid the word "should."
- **Word choice:** Avoid "please" and anthropomorphism (e.g., "the server 
  thinks"). Use common contractions (don't, it's).

## Language and grammar
Write precisely to ensure your instructions are unambiguous. Consistency in 
grammar and punctuation helps users follow technical procedures correctly.

- **Abbreviations:** Avoid Latin abbreviations. Use "for example" (not "e.g.") 
  and "that is" (not "i.e.").
- **Punctuation:** Use the serial comma. Place periods and commas inside 
  quotation marks.
- **Dates:** Use unambiguous formats (e.g., "January 22, 2026").
- **Conciseness:** Use "lets you" instead of "allows you to." Use precise, 
  specific verbs.
- **Examples and placeholders:** 
  - Use meaningful names in examples; avoid "foo" or "bar." 
  - Format placeholders in `ITALIC_ALL_CAPS` (e.g., `YOUR_API_KEY`).
- **Quota and limit terminology:** For any content involving resource capacity, 
  strictly adhere to the guidelines in 
  [quota-limit-style-guide.md](quota-limit-style-guide.md).

## Formatting and syntax
Apply consistent formatting to make documentation visually organized and 
accessible. These rules help users distinguish between UI elements, code, and 
narrative text.

- **Overview paragraphs:** Follow every heading with at least one 
  introductory overview paragraph before any lists or sub-headings.
- **Text wrap:** Wrap text at 80 characters (except long links or tables).
- **Casing:** Use sentence case for headings, titles, and bolded text.
- **Naming:** Always refer to the project as `Gemini CLI` (never 
  `the Gemini CLI`).
- **Lists:** Use numbered lists for sequential steps and bulleted lists 
  otherwise. Keep list items parallel in structure and start with imperative 
  verbs.
- **UI and code:** Use **bold** for UI elements and `code font` for filenames, 
  snippets, commands, and API elements. 
- **Links:** Use descriptive anchor text that makes sense out of context. 
  Avoid "click here" or "here."
- **Accessibility:** Use semantic HTML elements correctly (headings, lists, 
  tables). Provide descriptive alt text for all images.
- **Media:** Use lowercase hyphenated filenames for all assets.

## Experimental features
Ensure that users are correctly informed about experimental or preview 
capabilities. These often require a specific setting to be enabled.

- **Enablement:** Any feature that must be enabled via a setting (e.g., 
  `general.devtools`) is considered experimental.
- **Warning note:** If a feature is experimental, add this note 
  immediately after the introductory paragraph:
  `> **Note:** This is a preview feature currently under active development.`
- **Visual indicators:** Use the microscope emoji (🔬) in the heading or 
  sidebar label for experimental features.

## Structure
Follow a consistent structure to support the user journey from introduction to 
next steps. This hierarchy helps users find information quickly.

- **BLUF:** Start every page with an introduction (Bottom Line Up Front) 
  explaining what the reader can expect to learn.
- **Headings:** Use hierarchical headings (H1, H2, H3) to organize content.
- **Procedures:** 
  - Introduce lists of steps with a complete sentence.
  - Start each step with an imperative verb.
  - Number sequential steps; use bullets for non-sequential lists.
  - Put conditions before instructions (e.g., "On the **Settings** page, 
    click...").
  - Provide clear context for where the action takes place.
  - Indicate optional steps clearly (e.g., "Optional: ...").
- **Visual elements:** Use bullet lists, tables, notes (`> **Note:**`), and 
  warnings (`> **Warning:**`) to break up dense text.
- **Table of contents:** Do not include a manual table of contents.
- **Next steps:** Conclude with a "Next steps" section if applicable to guide 
  the user's next action.
