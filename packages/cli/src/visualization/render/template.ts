import type { Theme } from '../types.js';

// ---------------------------------------------------------------------------
// Mermaid HTML shell
// ---------------------------------------------------------------------------

/**
 * Generate the minimal HTML page that Puppeteer will render.
 * We use the official Mermaid CDN, set the theme, and inject the diagram source.
 */
export function buildMermaidHtml(spec: string, theme: Theme, widthPx: number): string {
    const mermaidTheme = theme === 'dark' ? 'dark' : theme === 'neutral' ? 'neutral' : 'default';

    return /* html */ `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: ${theme === 'dark' ? '#1e1e2e' : '#ffffff'};
      width: ${widthPx}px;
      display: flex;
      align-items: flex-start;
      justify-content: flex-start;
    }
    #container {
      padding: 24px;
      width: 100%;
    }
    .mermaid svg {
      max-width: 100% !important;
    }
  </style>
</head>
<body>
  <div id="container">
    <div class="mermaid">
${spec}
    </div>
  </div>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
    mermaid.initialize({
      startOnLoad: true,
      theme: '${mermaidTheme}',
      securityLevel: 'loose',
    });
    mermaid.init(undefined, document.querySelectorAll('.mermaid'));
    window.__mermaidDone = false;
    mermaid.init(undefined, document.querySelectorAll('.mermaid')).then(() => {
      window.__mermaidDone = true;
    });
  </script>
</body>
</html>`;
}
