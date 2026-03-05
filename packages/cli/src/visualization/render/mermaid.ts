import puppeteer from 'puppeteer';
import type { Theme } from '../types.js';
import { buildMermaidHtml } from './template.js';

// ---------------------------------------------------------------------------
// Mermaid → PNG renderer (Puppeteer-based)
// ---------------------------------------------------------------------------

export interface MermaidRenderOptions {
    theme?: Theme;
    widthPx?: number;
    backgroundColor?: string;
}

/**
 * Renders a Mermaid diagram spec to a PNG Buffer using Puppeteer.
 *
 * Strategy:
 * 1. Launch headless Chromium
 * 2. Load an inline HTML page with Mermaid CDN
 * 3. Inject the diagram source, wait for SVG to appear
 * 4. Screenshot the SVG element's bounding box → PNG
 */
export async function renderMermaidToPng(
    spec: string,
    options: MermaidRenderOptions = {},
): Promise<Buffer> {
    const theme = options.theme ?? 'dark';
    const widthPx = options.widthPx ?? 1200;

    const html = buildMermaidHtml(spec, theme, widthPx);

    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
        ],
    });

    try {
        const page = await browser.newPage();

        // Set viewport wide enough so Mermaid doesn't wrap
        await page.setViewport({ width: widthPx + 48, height: 1200, deviceScaleFactor: 2 });

        // Block external requests other than jsdelivr (Mermaid CDN)
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const url = req.url();
            if (
                req.isInterceptResolutionHandled()
            ) return;
            // Allow data URIs (our own HTML), CDN, and local
            if (
                url.startsWith('data:') ||
                url.includes('cdn.jsdelivr.net') ||
                url.startsWith('about:')
            ) {
                req.continue();
            } else {
                req.abort();
            }
        });

        await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30_000 });

        // Wait for Mermaid to render the SVG
        await page.waitForSelector('.mermaid svg', { timeout: 20_000 });

        // Give Mermaid a beat to finish layout animations
        await page.waitForFunction(
            () => {
                const svg = document.querySelector('.mermaid svg');
                return svg && svg.getBoundingClientRect().width > 0;
            },
            { timeout: 10_000 },
        );

        // Screenshot the SVG element (high-DPI)
        const svgElement = await page.$('.mermaid svg');
        if (!svgElement) {
            throw new Error('Mermaid SVG not found in page. Spec may be invalid.');
        }

        const screenshotBuffer = await svgElement.screenshot({
            type: 'png',
            omitBackground: theme !== 'default',
        });

        return Buffer.from(screenshotBuffer);
    } finally {
        await browser.close();
    }
}
