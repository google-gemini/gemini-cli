# Google HTML/CSS Style Guide Summary

This document summarizes key rules and best practices from the Google HTML/CSS
Style Guide.

## 1. General Rules

- **Protocol:** Use HTTPS for all embedded resources.
- **Indentation:** Indent by 2 spaces. Do not use tabs.
- **Capitalization:** Use only lowercase for all code (element names,
  attributes, selectors, properties).
- **Trailing Whitespace:** Remove all trailing whitespace.
- **Encoding:** Use UTF-8 (without a BOM). Specify `<meta charset="utf-8">` in
  HTML.

## 2. HTML Style Rules

- **Document Type:** Use `<!doctype html>`.
- **HTML Validity:** Use valid HTML.
- **Semantics:** Use HTML elements according to their intended purpose (e.g.,
  use `<p>` for paragraphs, not for spacing).
- **Multimedia Fallback:** Provide `alt` text for images and
  transcripts/captions for audio/video.
- **Separation of Concerns:** Strictly separate structure (HTML), presentation
  (CSS), and behavior (JavaScript). Link to CSS and JS from external files.
- **`type` Attributes:** Omit `type` attributes for stylesheets (`<link>`) and
  scripts (`<script>`).

## 3. HTML Formatting Rules

- **General:** Use a new line for every block, list, or table element, and
  indent its children.
- **Quotation Marks:** Use double quotation marks (`""`) for attribute values.

## 4. CSS Style Rules

- **CSS Validity:** Use valid CSS.
- **Class Naming:** Use meaningful, generic names. Separate words with a hyphen
  (`-`).
  - **Good:** `.video-player`, `.site-navigation`
  - **Bad:** `.vid`, `.red-text`
- **ID Selectors:** Avoid using ID selectors for styling. Prefer class
  selectors.
- **Shorthand Properties:** Use shorthand properties where possible (e.g.,
  `padding`, `font`).
- **`0` and Units:** Omit units for `0` values (e.g., `margin: 0;`).
- **Leading `0`s:** Always include leading `0`s for decimal values (e.g.,
  `font-size: 0.8em;`).
- **Hexadecimal Notation:** Use 3-character hex notation where possible (e.g.,
  `#fff`).
- **`!important`:** Avoid using `!important`.

## 5. CSS Formatting Rules

- **Declaration Order:** Alphabetize declarations within a rule.
- **Indentation:** Indent all block content.
- **Semicolons:** Use a semicolon after every declaration.
- **Spacing:**
  - Use a space after a property name's colon (`font-weight: bold;`).
  - Use a space between the last selector and the opening brace (`.foo {`).
  - Start a new line for each selector and declaration.
- **Rule Separation:** Separate rules with a new line.
- **Quotation Marks:** Use single quotes (`''`) for attribute selectors and
  property values (e.g., `[type='text']`).

**BE CONSISTENT.** When editing code, match the existing style.

_Source:
[Google HTML/CSS Style Guide](https://google.github.io/styleguide/htmlcssguide.html)_
