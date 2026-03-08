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
      margin: 0;
      padding: 0;
      display: inline-block;
      overflow: hidden;
    }
    #container {
      padding: 48px;
      display: inline-block;
      min-width: 100px;
      min-height: 100px;
    }
    .mermaid {
      display: inline-block;
    }
    .mermaid svg {
      max-width: none !important;
      height: auto !important;
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
    
    window.__mermaidDone = false;
    
    mermaid.initialize({
      startOnLoad: false,
      theme: '${mermaidTheme}',
      securityLevel: 'loose',
    });

    const init = async () => {
      try {
        await mermaid.run();
        window.__mermaidDone = true;
      } catch (e) {
        console.error('Mermaid render failed', e);
        window.__mermaidDone = true; // Still set to true so we don't hang
      }
    };
    
    init();
  </script>
</body>
</html>`;
}
