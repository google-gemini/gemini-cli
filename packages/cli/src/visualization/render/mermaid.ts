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

        // Give it a tiny bit more for layout settling
        await page.evaluate(() => new Promise(r => setTimeout(r, 200)));

        // DYNAMICALY SIZE THE VIEWPORT TO THE CONTENT
        // This is the key to preventing cropping for very tall/wide diagrams
        const dimensions = await page.evaluate(() => {
            const container = document.querySelector('#container');
            if (!container) return null;
            const rect = container.getBoundingClientRect();
            // Add a bit of buffer
            return {
                width: Math.ceil(rect.width) + 20,
                height: Math.ceil(rect.height) + 20
            };
        });

        if (dimensions) {
            await page.setViewport({
                width: dimensions.width,
                height: dimensions.height,
                deviceScaleFactor: 2
            });
        }

        const container = await page.$('#container');
        if (!container) {
            throw new Error('Diagram container not found.');
        }

        const screenshotBuffer = await container.screenshot({
            type: 'png',
            omitBackground: theme !== 'default',
            captureBeyondViewport: true, // Safety net
        });

        return Buffer.from(screenshotBuffer);
    } finally {
        await browser.close();
    }
}
