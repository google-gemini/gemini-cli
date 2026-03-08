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

        // Set viewport wide enough so Mermaid doesn't wrap, and TALL enough so it doesn't crop
        await page.setViewport({ width: widthPx + 100, height: 5000, deviceScaleFactor: 2 });

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

        // Wait for Mermaid to set our completion flag
        await page.waitForFunction(
            () => (window as any).__mermaidDone === true,
            { timeout: 20_000 },
        );

        // Give it a substantial beat for layout, fonts, and SVG settling
        await page.evaluate(() => new Promise(r => setTimeout(r, 500)));

        // MEASURE THE ACTUAL SCROLL DIMENSIONS
        // Using scrollWidth/Height is more robust for content that might overflow
        const dimensions = await page.evaluate(() => {
            const container = document.querySelector('#container') as HTMLElement;
            if (!container) return null;

            // Force layout recalculation
            container.style.display = 'inline-block';

            return {
                width: Math.ceil(container.scrollWidth) + 10,
                height: Math.ceil(container.scrollHeight) + 10
            };
        });

        if (dimensions) {
            // Resize the viewport to the exact size of the content
            await page.setViewport({
                width: dimensions.width,
                height: dimensions.height,
                deviceScaleFactor: 2
            });
        }

        // Take a full-page screenshot of the newly sized viewport
        const screenshotBuffer = await page.screenshot({
            type: 'png',
            fullPage: true,
            omitBackground: theme !== 'default',
        });

        return Buffer.from(screenshotBuffer);
    } finally {
        await browser.close();
    }
}
