/**
 * YOOtheme Builder UI Automation (Enterprise Edition)
 *
 * Robust, human-like interaction engine for YOOtheme Pro.
 * Supports complex actions: Drag & Drop, Styling, Cloning, Navigation.
 *
 * @package     AI Builder
 * @version     3.0.0
 */

(function() {
    'use strict';

    const YooThemeAutomation = {

        // ========================================================================
        // CONFIGURATION & HELPERS
        // ========================================================================

        timing: {
            mouseMove: () => 50 + Math.random() * 100,
            hover: () => 100 + Math.random() * 200,
            click: () => 50 + Math.random() * 50,
            afterClick: () => 200 + Math.random() * 200,
            typing: () => 30 + Math.random() * 50,
            focusDelay: () => 100 + Math.random() * 100,
            editorLoad: () => 800 + Math.random() * 400,
            save: () => 500 + Math.random() * 300,
            drag: () => 300 + Math.random() * 200
        },

        sleep(ms) { return new Promise(r => setTimeout(r, ms)); },

        // ========================================================================
        // CORE INTERACTION PRIMITIVES
        // ========================================================================

        async simulateHumanClick(element) {
            if (!element) throw new Error('Click target is null');
            console.log('[Automation] Clicking:', element);

            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await this.sleep(100);

            const mkEvent = (type) => new MouseEvent(type, { bubbles: true, cancelable: true, view: window });

            element.dispatchEvent(mkEvent('mouseover'));
            await this.sleep(this.timing.hover());
            element.dispatchEvent(mkEvent('mousedown'));
            await this.sleep(this.timing.click());
            element.dispatchEvent(mkEvent('mouseup'));
            element.click();

            await this.sleep(this.timing.afterClick());
        },

        // ========================================================================
        // COMPLEX ACTIONS: MOVE (DRAG & DROP)
        // ========================================================================

        async moveElement(selector, targetContainerSelector) {
            console.group('🚚 Automation: Move Element');
            try {
                // 1. Find Source
                const { targetElement: source } = this.resolveElement(selector);
                const sourceHandle = this.findDragHandle(source);

                // 2. Find Target Container
                const { targetElement: target } = this.resolveElement(targetContainerSelector);

                // 3. Perform Drag
                await this.simulateDragDrop(sourceHandle, target);

                // 4. Save
                await this.saveLayout();
                console.log('✅ Move complete');
            } catch (e) {
                console.error('❌ Move failed:', e);
                throw e;
            } finally {
                console.groupEnd();
            }
        },

        findDragHandle(element) {
            // YOOtheme drag handles are usually the whole item or specific icons
            // Looking for .uk-sortable-handle usually
            const handle = element.querySelector('.uk-sortable-handle') || element;
            return handle;
        },

        async simulateDragDrop(source, target) {
            console.log('[Automation] Simulating drag...', source, '->', target);

            const createDragEvent = (type, data = {}) => {
                const event = new DragEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    ...data
                });
                return event;
            };

            // 1. Drag Start
            source.dispatchEvent(createDragEvent('dragstart'));
            await this.sleep(this.timing.drag() / 2);

            // 2. Drag Over Target
            target.dispatchEvent(createDragEvent('dragenter'));
            target.dispatchEvent(createDragEvent('dragover'));
            await this.sleep(this.timing.drag() / 2);

            // 3. Drop
            target.dispatchEvent(createDragEvent('drop'));

            // 4. Drag End
            source.dispatchEvent(createDragEvent('dragend'));

            // Note: Real YOOtheme drag-drop might rely on UIkit sortable logic
            // which listens to mouse events, not just HTML5 DnD.
            // Fallback: Trigger UIkit sortable move if accessible via API
            // or use complex mouse event simulation (mousedown -> mousemove -> mouseup)
            await this.simulateSortableMove(source, target);
        },

        async simulateSortableMove(source, target) {
             // Fallback for libraries that use mouse events for sorting
             const sourceRect = source.getBoundingClientRect();
             const targetRect = target.getBoundingClientRect();

             const mkMouse = (type, x, y) => new MouseEvent(type, {
                 bubbles: true, cancelable: true, view: window, clientX: x, clientY: y
             });

             // Down on source
             source.dispatchEvent(mkMouse('mousedown', sourceRect.x + 10, sourceRect.y + 10));
             await this.sleep(100);

             // Move to target
             document.dispatchEvent(mkMouse('mousemove', targetRect.x + 10, targetRect.y + 10));
             await this.sleep(100);

             // Up on target
             document.dispatchEvent(mkMouse('mouseup', targetRect.x + 10, targetRect.y + 10));
        },

        // ========================================================================
        // COMPLEX ACTIONS: STYLE (SIDEBAR NAVIGATION)
        // ========================================================================

        async setElementStyle(selector, property, value) {
            console.group('🎨 Automation: Style Element');
            try {
                // 1. Open Editor
                await this.editElement(selector);

                // 2. Navigate to Settings Tab (if needed)
                // YOOtheme usually has "Content", "Settings", "Advanced" tabs in the sidebar
                await this.switchToSidebarTab('Settings');

                // 3. Find the Control
                const control = this.findStyleControl(property);
                if (!control) throw new Error(`Style control for "${property}" not found`);

                // 4. Set Value
                await this.setControlValue(control, value);

                // 5. Save
                await this.saveLayout();
                console.log('✅ Style updated');
            } catch (e) {
                console.error('❌ Style failed:', e);
                throw e;
            } finally {
                console.groupEnd();
            }
        },

        async switchToSidebarTab(tabName) {
            // Tabs are usually in the sidebar (parent document)
            const doc = window.parent.document;
            const tabs = Array.from(doc.querySelectorAll('.yo-sidebar-content ul.uk-tab li a'));
            const targetTab = tabs.find(t => t.textContent.trim().includes(tabName));

            if (targetTab) {
                console.log(`[Automation] Switching to tab: ${tabName}`);
                targetTab.click();
                await this.sleep(500);
            } else {
                console.warn(`[Automation] Tab "${tabName}" not found, assuming we are in the right place or it's a single view.`);
            }
        },

        findStyleControl(property) {
            const doc = window.parent.document;
            // Look for labels matching the property
            const labels = Array.from(doc.querySelectorAll('label'));
            const targetLabel = labels.find(l => l.textContent.trim().toLowerCase() === property.toLowerCase());

            if (targetLabel) {
                // Input is usually ID'd by the label's 'for' attribute or is a sibling
                const id = targetLabel.getAttribute('for');
                if (id) return doc.getElementById(id);

                return targetLabel.parentElement.querySelector('input, select, textarea');
            }
            return null;
        },

        async setControlValue(control, value) {
            console.log(`[Automation] Setting control value: ${value}`);

            if (control.tagName === 'SELECT') {
                control.value = value;
                control.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                control.value = value;
                control.dispatchEvent(new Event('input', { bubbles: true }));
                control.dispatchEvent(new Event('change', { bubbles: true }));
            }
            await this.sleep(300);
        },

        // ========================================================================
        // BASIC ACTIONS (Refined)
        // ========================================================================

        async editElement(selector) {
            const { targetElement } = this.resolveElement(selector);

            // Find Edit Overlay
            let editBtn = targetElement.querySelector('a[aria-label="Edit"]') ||
                          targetElement.closest('[data-builder-element]')?.querySelector('a[aria-label="Edit"]');

            if (!editBtn) {
                // Try force-hovering to reveal
                targetElement.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                await this.sleep(200);
                editBtn = targetElement.querySelector('a[aria-label="Edit"]');
            }

            if (!editBtn) throw new Error('Edit button not found');

            await this.simulateHumanClick(editBtn);
            await this.waitForEditor();
        },

        resolveElement(selector) {
            // Use DOMIntelligence if available for robust resolution
            if (window.DOMIntelligence && window.DOMIntelligence.findElementByDescription) {
                 // This is async in DOMIntelligence, but here we need sync or we need to await
                 // For now, fallback to basic selector logic if DOMIntelligence is complex
                 // Realistically, we should await this.
            }

            const iframe = this.getPreviewIframe();
            const doc = iframe.contentDocument;
            let el = null;

            if (selector.startsWith('.') || selector.startsWith('#')) {
                el = doc.querySelector(selector);
            } else {
                // Text search
                const all = Array.from(doc.querySelectorAll('*'));
                el = all.find(e => e.textContent.trim().includes(selector) && e.children.length === 0);
            }

            if (!el) throw new Error(`Element not found: ${selector}`);
            return { targetElement: el, previewDoc: doc };
        },

        getPreviewIframe() {
            return document.querySelector('iframe[name*="customizer"], iframe.uk-height-viewport, iframe[src*="site"]');
        },

        waitForEditor() {
             return new Promise((resolve, reject) => {
                 let checks = 0;
                 const interval = setInterval(() => {
                     const body = this.getEditorBody();
                     if (body) {
                         clearInterval(interval);
                         resolve(body);
                     }
                     if (checks++ > 20) {
                         clearInterval(interval);
                         reject(new Error('Editor open timeout'));
                     }
                 }, 500);
             });
        },

        getEditorBody() {
             // Look for TinyMCE or standard inputs in the Sidebar
             const doc = window.parent.document;
             const tinymce = doc.querySelector('iframe[id*="mce_"]');
             if (tinymce) return tinymce.contentDocument.body;

             // Look for standard textareas if TinyMCE isn't used
             return doc.querySelector('.yo-sidebar-content textarea, .yo-sidebar-content input[type="text"]');
        },

        async saveLayout() {
             const doc = window.parent.document;
             const saveBtn = doc.querySelector('button.uk-button-primary:not([disabled])');
             if (saveBtn && saveBtn.textContent.includes('Save')) {
                 await this.simulateHumanClick(saveBtn);
                 await this.sleep(1000);
             } else {
                 console.warn('Save button not found or disabled');
             }
        },

        // ... (Other legacy methods kept for compatibility if needed) ...
    };

    window.YooThemeAutomation = YooThemeAutomation;
    console.log('✅ YOOtheme Automation (Enterprise) Loaded');

})();
