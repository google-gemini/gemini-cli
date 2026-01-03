/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BrowserManager } from './browserManager.js';
import { debugLogger } from '../../utils/debugLogger.js';

type Page = import('playwright').Page;

export interface ToolResult {
  output?: string;
  error?: string;
  url?: string;
}

export class BrowserTools {
  constructor(private browserManager: BrowserManager) {}

  async showOverlay(page: Page, message: string): Promise<void> {
    await page.evaluate((msg: string) => {
      let overlay = document.getElementById('gemini-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'gemini-overlay';
        overlay.style.position = 'fixed';
        overlay.style.bottom = '50px';
        overlay.style.left = '50%';
        overlay.style.transform = 'translateX(-50%)';
        overlay.style.background = 'rgba(32, 33, 36, 0.9)';
        overlay.style.color = 'white';
        overlay.style.padding = '12px 24px';
        overlay.style.zIndex = '2147483647';
        overlay.style.borderRadius = '24px';
        overlay.style.fontSize = '16px';
        overlay.style.fontFamily = 'Google Sans, Roboto, sans-serif';
        overlay.style.fontWeight = '500';
        overlay.style.pointerEvents = 'none';
        overlay.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
        overlay.style.transition = 'opacity 0.3s ease-in-out';
        document.body.appendChild(overlay);
      }
      overlay.innerText = msg;
    }, message);
  }

  async updateBorderOverlay(options: {
    active: boolean;
    capturing: boolean;
  }): Promise<void> {
    try {
      const page = await this.browserManager.getPage();
      await page.evaluate((opts: { active: boolean; capturing: boolean }) => {
        const { active, capturing } = opts;
        // 1. Inject CSS if not present
        if (!document.getElementById('gemini-border-style')) {
          const style = document.createElement('style');
          style.id = 'gemini-border-style';
          style.textContent = `
            :root {
              --color-blue: rgb(0, 102, 255);
              --color-blue-glow: rgba(0, 102, 255, 0.9);
            }
            #preact-border-container {
              pointer-events: none;
              z-index: 2147483647;
              position: fixed;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              border: 2px solid var(--color-blue);
              box-shadow: inset 0 0 10px 0px var(--color-blue-glow);
              opacity: 1;
              transition: opacity 300ms ease-in-out;
              box-sizing: border-box;
            }
            #preact-border-container.hidden {
              opacity: 0;
            }
            @keyframes breathe {
              0%, 100% {
                box-shadow: inset 0 0 20px 0px var(--color-blue-glow);
              }
              50% {
                box-shadow: inset 0 0 30px 10px var(--color-blue-glow);
              }
            }
            #preact-border-container.animate-breathing {
              animation: breathe 3s ease-in-out infinite;
            }
          `;
          document.head.appendChild(style);
        }

        // 2. Manage Container
        let container = document.getElementById('preact-border-container');
        if (!container) {
          container = document.createElement('div');
          container.id = 'preact-border-container';
          container.setAttribute('aria-hidden', 'true');
          document.body.appendChild(container);
        }

        // 3. Update State
        if (active) {
          container.classList.remove('hidden');
          if (!capturing) {
            container.classList.add('animate-breathing');
          } else {
            container.classList.remove('animate-breathing');
          }
        } else {
          container.classList.add('hidden');
          container.classList.remove('animate-breathing');
        }
      }, options);
    } catch (err) {
      debugLogger.log(`Failed to update border overlay: ${err}`);
    }
  }

  async removeOverlay(): Promise<void> {
    try {
      const page = await this.browserManager.getPage();
      await page.evaluate(() => {
        const overlay = document.getElementById('gemini-overlay');
        if (overlay) {
          overlay.remove();
        }
      });
    } catch (err) {
      debugLogger.log(`Failed to remove overlay: ${err}`);
    }
  }

  private async moveMouse(page: Page, x: number, y: number): Promise<void> {
    await page.evaluate(
      ({ x, y }: { x: number; y: number }) => {
        let cursor = document.getElementById('gemini-cursor');
        if (!cursor) {
          cursor = document.createElement('div');
          cursor.id = 'gemini-cursor';
          cursor.style.position = 'fixed';
          cursor.style.zIndex = '2147483648';
          cursor.style.pointerEvents = 'none';
          cursor.style.transition =
            'top 0.2s ease-out, left 0.2s ease-out, opacity 0.2s ease-in-out, transform 0.1s ease-in-out, background-color 0.1s ease-in-out, width 0.2s, height 0.2s, border-radius 0.2s';
          cursor.style.transform = 'translate(-50%, -50%)';
          cursor.style.left = '50vw';
          cursor.style.top = '50vh';
          document.body.appendChild(cursor);
          cursor.getBoundingClientRect();
        }
        cursor.style.width = '20px';
        cursor.style.height = '20px';
        cursor.style.borderRadius = '50%';
        cursor.style.boxShadow =
          '0 0 10px 2px rgba(0, 102, 255, 0.8), inset 0 0 5px rgba(0, 102, 255, 0.5)';
        cursor.style.opacity = '1';
        cursor.style.left = `${x}px`;
        cursor.style.top = `${y}px`;
        cursor.style.transform = 'translate(-50%, -50%) scale(1)';
        cursor.style.backgroundColor = 'rgba(0, 102, 255, 0.3)';
      },
      { x, y },
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  private async showScrollIndicator(
    page: Page,
    direction: string,
  ): Promise<void> {
    await page.evaluate((dir: string) => {
      let cursor = document.getElementById('gemini-cursor');
      if (!cursor) {
        cursor = document.createElement('div');
        cursor.id = 'gemini-cursor';
        cursor.style.position = 'fixed';
        cursor.style.zIndex = '2147483648';
        cursor.style.pointerEvents = 'none';
        cursor.style.transition =
          'top 0.2s ease-out, left 0.2s ease-out, opacity 0.2s ease-in-out, transform 0.1s ease-in-out, background-color 0.1s ease-in-out, width 0.2s, height 0.2s, border-radius 0.2s';
        cursor.style.transform = 'translate(-50%, -50%)';
        document.body.appendChild(cursor);
      }
      cursor.style.width = '20px';
      cursor.style.height = '30px';
      cursor.style.borderRadius = '8px';
      cursor.style.left = '50vw';
      cursor.style.top = '50vh';
      cursor.style.opacity = '1';
      cursor.style.transform = 'translate(-50%, -50%)';
      const blue = 'rgba(0, 102, 255, 1)';
      const transparentBlue = 'rgba(0, 102, 255, 0.2)';
      if (dir === 'up') {
        cursor.style.background = `linear-gradient(to top, ${transparentBlue}, ${blue})`;
        cursor.style.boxShadow = `0 -5px 10px ${transparentBlue}`;
      } else if (dir === 'down') {
        cursor.style.background = `linear-gradient(to bottom, ${transparentBlue}, ${blue})`;
        cursor.style.boxShadow = `0 5px 10px ${transparentBlue}`;
      } else {
        cursor.style.background = transparentBlue;
        cursor.style.boxShadow = `0 0 10px ${transparentBlue}`;
      }
      setTimeout(() => {
        const offset = dir === 'up' ? -20 : dir === 'down' ? 20 : 0;
        cursor.style.transform = `translate(-50%, calc(-50% + ${offset}px))`;
        cursor.style.opacity = '0';
      }, 300);
    }, direction);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  private async animateClick(page: Page): Promise<void> {
    await page.evaluate(() => {
      const cursor = document.getElementById('gemini-cursor');
      if (cursor) {
        cursor.style.transform = 'translate(-50%, -50%) scale(1.2)';
        cursor.style.backgroundColor = 'rgba(0, 102, 255, 1)';
        cursor.style.boxShadow =
          '0 0 15px 4px rgba(0, 102, 255, 1), inset 0 0 5px rgba(255, 255, 255, 0.5)';
        setTimeout(() => {
          cursor.style.transform = 'translate(-50%, -50%) scale(1)';
          cursor.style.backgroundColor = 'rgba(0, 102, 255, 0.3)';
          cursor.style.boxShadow =
            '0 0 10px 2px rgba(0, 102, 255, 0.8), inset 0 0 5px rgba(0, 102, 255, 0.5)';
          cursor.style.opacity = '0';
        }, 150);
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  private async getElementLabel(
    page: Page,
    x: number,
    y: number,
  ): Promise<string | null> {
    return page.evaluate(
      ({ x, y }: { x: number; y: number }) => {
        const el = document.elementFromPoint(x, y);
        if (!el) return null;
        const text =
          (el as HTMLElement).innerText?.replace(/\s+/g, ' ').trim() ||
          el.getAttribute('aria-label') ||
          el.getAttribute('placeholder') ||
          el.getAttribute('title') ||
          el.getAttribute('alt');
        if (text) {
          return text.slice(0, 30) + (text.length > 30 ? '...' : '');
        }
        return el.tagName.toLowerCase();
      },
      { x, y },
    );
  }

  async clickAt(x: number, y: number): Promise<ToolResult> {
    const page = await this.browserManager.getPage();
    try {
      const viewport = await this.getViewportSize(page);
      if (!viewport) {
        return { error: 'Viewport not available', url: page.url() };
      }
      const actualX = (x / 1000) * viewport.width;
      const actualY = (y / 1000) * viewport.height;

      await this.moveMouse(page, actualX, actualY);

      const label = await this.getElementLabel(page, actualX, actualY);
      const msg = label ? `Clicking "${label}"` : `Clicking at ${x}, ${y}`;
      await this.showOverlay(page, msg);

      await page.mouse.click(actualX, actualY);
      await this.animateClick(page);
      await new Promise((resolve) => setTimeout(resolve, 500));
      await this.removeOverlay();
      return { output: 'Clicked', url: page.url() };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return { error: `Failed to click at ${x}, ${y}: ${message}` };
    }
  }

  async typeTextAt(
    x: number,
    y: number,
    text: string,
    pressEnter: boolean = false,
    clearBeforeTyping: boolean = false,
  ): Promise<ToolResult> {
    const page = await this.browserManager.getPage();
    try {
      const viewport = await this.getViewportSize(page);
      if (!viewport) {
        return { error: 'Viewport not available', url: page.url() };
      }
      const actualX = (x / 1000) * viewport.width;
      const actualY = (y / 1000) * viewport.height;

      await this.moveMouse(page, actualX, actualY);

      const label = await this.getElementLabel(page, actualX, actualY);
      const msg = label
        ? `Typing "${text}" into ${label}`
        : `Typing "${text}" at ${x}, ${y}`;
      await this.showOverlay(page, msg);

      await page.mouse.click(actualX, actualY);
      await this.animateClick(page);

      if (clearBeforeTyping) {
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Backspace');
      }

      await page.keyboard.type(text);
      if (pressEnter) {
        await page.keyboard.press('Enter');
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      await this.removeOverlay();
      return { output: `Typed "${text}"`, url: page.url() };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return { error: `Failed to type at ${x}, ${y}: ${message}` };
    }
  }

  async dragAndDrop(
    x: number,
    y: number,
    destX: number,
    destY: number,
  ): Promise<ToolResult> {
    const page = await this.browserManager.getPage();
    try {
      await this.showOverlay(
        page,
        `Dragging from ${x},${y} to ${destX},${destY}`,
      );
      const viewport = await this.getViewportSize(page);
      if (!viewport) {
        return { error: 'Viewport not available', url: page.url() };
      }
      const actualX = (x / 1000) * viewport.width;
      const actualY = (y / 1000) * viewport.height;
      const actualDestX = (destX / 1000) * viewport.width;
      const actualDestY = (destY / 1000) * viewport.height;

      await this.moveMouse(page, actualX, actualY);
      await page.mouse.move(actualX, actualY);
      await this.animateClick(page);
      await page.mouse.down();

      await this.moveMouse(page, actualDestX, actualDestY);
      await page.mouse.move(actualDestX, actualDestY);
      await page.mouse.up();
      await this.animateClick(page);
      await this.removeOverlay();

      return {
        output: `Dragged from ${x},${y} to ${destX},${destY}`,
        url: page.url(),
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return { error: `Failed to drag: ${message}` };
    }
  }

  async getViewportSize(
    page: Page,
  ): Promise<{ width: number; height: number } | null> {
    const viewport = page.viewportSize();
    if (viewport) {
      return viewport;
    }
    // Fallback: if viewport is null, get window dimensions
    return page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
  }

  async openWebBrowser(): Promise<ToolResult> {
    await this.browserManager.getMcpClient();
    const page = await this.browserManager.getPage();
    return { output: 'Browser opened', url: page.url() };
  }

  async scrollDocument(
    direction: 'up' | 'down' | 'left' | 'right',
    amount: number = 500,
  ): Promise<ToolResult> {
    const page = await this.browserManager.getPage();
    await this.showScrollIndicator(page, direction);
    await this.showOverlay(page, `Scrolling ${direction}`);

    let deltaX = 0;
    let deltaY = 0;

    if (direction === 'up') deltaY = -amount;
    if (direction === 'down') deltaY = amount;
    if (direction === 'left') deltaX = -amount;
    if (direction === 'right') deltaX = amount;

    await page.evaluate(
      (args: { dx: number; dy: number }) => {
        window.scrollBy({
          top: args.dy,
          left: args.dx,
          behavior: 'smooth',
        });
      },
      { dx: deltaX, dy: deltaY },
    );

    // Wait for smooth scroll to complete
    await new Promise((resolve) => setTimeout(resolve, 500));
    await this.removeOverlay();
    return { output: `Scrolled ${direction} by ${amount}`, url: page.url() };
  }

  async pagedown(): Promise<ToolResult> {
    const page = await this.browserManager.getPage();
    await this.showOverlay(page, 'Pressing PageDown');
    await page.keyboard.press('PageDown');
    await this.removeOverlay();
    return { output: 'Pressed PageDown', url: page.url() };
  }

  async pageup(): Promise<ToolResult> {
    const page = await this.browserManager.getPage();
    await this.showOverlay(page, 'Pressing PageUp');
    await page.keyboard.press('PageUp');
    await this.removeOverlay();
    return { output: 'Pressed PageUp', url: page.url() };
  }

  async takeSnapshot(verbose: boolean = false): Promise<ToolResult> {
    const client = await this.browserManager.getMcpClient();
    const result = await client.callTool('take_snapshot', { verbose });

    // Handle standard MCP result content
    const content = result.content;
    let output = '';
    if (content && Array.isArray(content)) {
      output = content
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((item: any) => item.type === 'text')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((item: any) => item.text)
        .join('');
    }
    return { output };
  }

  async waitFor(text: string): Promise<ToolResult> {
    const client = await this.browserManager.getMcpClient();
    await client.callTool('wait_for', { text });
    return { output: `Waited for text "${text}"` };
  }

  async handleDialog(
    action: 'accept' | 'dismiss',
    promptText?: string,
  ): Promise<ToolResult> {
    const client = await this.browserManager.getMcpClient();
    await client.callTool('handle_dialog', { action, promptText });
    return { output: `Dialog ${action}ed` };
  }

  async evaluateScript(script: string): Promise<ToolResult> {
    const page = await this.browserManager.getPage();
    try {
      // Wrap script in a function call to handle both expressions and statements
      const wrappedScript = `(function() { return ${script}; })()`;
      const result = await page.evaluate(wrappedScript);

      let output = '';
      if (typeof result === 'object') {
        output = JSON.stringify(result);
      } else {
        output = String(result);
      }
      return { output };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return { error: `Script execution failed: ${message}` };
    }
  }

  async pressKey(key: string): Promise<ToolResult> {
    const client = await this.browserManager.getMcpClient();
    await client.callTool('press_key', { key });
    return { output: `Pressed key "${key}"` };
  }

  async drag(fromUid: string, toUid: string): Promise<ToolResult> {
    const client = await this.browserManager.getMcpClient();
    await client.callTool('drag', { from_uid: fromUid, to_uid: toUid });
    return { output: 'Dragged element' };
  }

  async hoverAt(x: number, y: number): Promise<ToolResult> {
    const page = await this.browserManager.getPage();
    try {
      const viewport = await this.getViewportSize(page);
      if (!viewport) {
        return { error: 'Viewport not available', url: page.url() };
      }
      const actualX = (x / 1000) * viewport.width;
      const actualY = (y / 1000) * viewport.height;

      await this.moveMouse(page, actualX, actualY);
      await this.showOverlay(page, `Hovering at ${x}, ${y}`);
      await page.mouse.move(actualX, actualY);

      await new Promise((resolve) => setTimeout(resolve, 500));
      await this.removeOverlay();
      return { output: 'Hovered', url: page.url() };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return { error: `Failed to hover at ${x}, ${y}: ${message}` };
    }
  }

  async scrollAt(
    x: number,
    y: number,
    direction: 'up' | 'down' | 'left' | 'right',
    magnitude: number = 400,
  ): Promise<ToolResult> {
    const page = await this.browserManager.getPage();
    try {
      const viewport = await this.getViewportSize(page);
      if (!viewport) {
        return { error: 'Viewport not available', url: page.url() };
      }
      const actualX = (x / 1000) * viewport.width;
      const actualY = (y / 1000) * viewport.height;

      await this.moveMouse(page, actualX, actualY);
      await this.showOverlay(
        page,
        `Scrolling element at ${x}, ${y} ${direction}`,
      );

      // Mouse wheel scroll relative to current hover position
      let deltaX = 0;
      let deltaY = 0;
      if (direction === 'up') deltaY = -magnitude;
      if (direction === 'down') deltaY = magnitude;
      if (direction === 'left') deltaX = -magnitude;
      if (direction === 'right') deltaX = magnitude;

      await page.mouse.wheel(deltaX, deltaY);

      await new Promise((resolve) => setTimeout(resolve, 500));
      await this.removeOverlay();
      return { output: `Scrolled at ${x}, ${y}`, url: page.url() };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return { error: `Failed to scroll at ${x}, ${y}: ${message}` };
    }
  }

  async navigate(url: string): Promise<ToolResult> {
    const page = await this.browserManager.getPage();
    try {
      await page.goto(url);
      return { output: `Navigated to ${url}`, url: page.url() };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return { error: `Failed to navigate: ${message}` };
    }
  }

  async goBack(): Promise<ToolResult> {
    const page = await this.browserManager.getPage();
    try {
      await page.goBack();
      return { output: 'Navigated back', url: page.url() };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return { error: `Failed to go back: ${message}` };
    }
  }

  async goForward(): Promise<ToolResult> {
    const page = await this.browserManager.getPage();
    try {
      await page.goForward();
      return { output: 'Navigated forward', url: page.url() };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return { error: `Failed to go forward: ${message}` };
    }
  }

  // Deprecated: Use pressKey if possible, but keeping for coordinate-based/legacy support or where UID isn't known
  async keyCombination(keys: string): Promise<ToolResult> {
    return this.pressKey(keys);
  }
}
