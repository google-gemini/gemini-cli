---
name: html-regex-tokenizers
description: Guidelines for sanitizing and parsing HTML/XML structures to avoid XSS bypasses and formatting corruption.
---

# HTML/XML Sanitization & Parser Robustness Guidelines

When sanitizing, filtering, or parsing HTML/XML documents for XSS vulnerabilities, mixed casing, svg namespaces, or tag matching:

## 1. Ban Naive Regular Expressions
DO NOT write custom regular expressions (e.g., string-replacing event handlers with `\bon[a-z]+`) to parse or filter HTML elements.
*   **Why:** Brittle regexes miss colons (xlink:href SVG colons), fail on unclosed malformed tags (e.g., `<img src="x" onerror=alert(1)` which browsers auto-close and execute), and corrupt legitimate words starting with "on" (like `online` or `only`).

## 2. Leverage Tokenized HTML Parsers
Even if you are strictly required to preserve the exact tag layout and formatting of the source document, do not perform regex string-replacements on the whole file. Instead, utilize robust token-based parsers (like Python's built-in `html.parser.HTMLParser`):
*   Tokenize the document tag-by-tag.
*   Surgically inspect and neutralize attributes and elements inside the parsed token callbacks.
*   Reconstruct the document systematically, preserving formatting spacing dynamically.

## 3. SVM Namespace Colons
Always support SVG and XML namespaces. Sanitize colon-separated attribute keys (such as `xlink:href`) which can host malicious `javascript:...` URIs inside `svg`/`a` tags.
