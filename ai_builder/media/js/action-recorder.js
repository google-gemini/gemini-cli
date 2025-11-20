/**
 * Action Recorder
 *
 * Records user interactions and generates replayable scripts. This is the
 * foundation for the AI's skill acquisition and learning capabilities.
 *
 * @package     AI Builder
 * @version     6.0.0
 * @author      CLEO AI
 */

(function() {
    'use strict';

    console.log('[ActionRecorder] 🔴 Initializing...');

    class ActionRecorder {
        constructor() {
            this.isRecording = false;
            this.recordedEvents = [];
            this.eventListeners = {};
            this.targetDocument = document; // Default to the main document
        }

        /**
         * Starts the recording session.
         */
        start() {
            if (this.isRecording) {
                console.warn('[ActionRecorder] Already recording.');
                return;
            }

            // Determine the target document (YOOtheme preview iframe or main document)
            const previewIframe = document.querySelector('iframe[name^="preview-"]');
            if (previewIframe && previewIframe.contentDocument) {
                this.targetDocument = previewIframe.contentDocument;
                console.log('[ActionRecorder] Targeting YOOtheme preview iframe.');
            } else {
                this.targetDocument = document;
                console.log('[ActionRecorder] Targeting main document.');
            }

            this.isRecording = true;
            this.recordedEvents = [];
            this.attachEventListeners();
            console.log('[ActionRecorder] ▶️ Recording started.');
        }

        /**
         * Stops the recording session and returns the generated script.
         * @param {string} skillName - The name for the generated skill.
         * @returns {string|null} The generated JavaScript code for the skill.
         */
        stop(skillName = 'newSkill') {
            if (!this.isRecording) {
                console.warn('[ActionRecorder] Not currently recording.');
                return null;
            }

            this.isRecording = false;
            this.removeEventListeners();
            console.log(`[ActionRecorder] ⏹️ Recording stopped. ${this.recordedEvents.length} events captured.`);

            return this.generateScript(skillName);
        }

        /**
         * Attaches event listeners to the target document to capture user actions.
         */
        attachEventListeners() {
            this.eventListeners.click = this.handleEvent.bind(this, 'click');
            this.eventListeners.change = this.handleEvent.bind(this, 'change');
            // Add more listeners as needed (e.g., keydown, mousedown)

            this.targetDocument.addEventListener('click', this.eventListeners.click, true);
            this.targetDocument.addEventListener('change', this.eventListeners.change, true);
        }

        /**
         * Removes all attached event listeners.
         */
        removeEventListeners() {
            this.targetDocument.removeEventListener('click', this.eventListeners.click, true);
            this.targetDocument.removeEventListener('change', this.eventListeners.change, true);
        }

        /**
         * Generic event handler to process and record events.
         * @param {string} eventType - The type of event being handled.
         * @param {Event} event - The DOM event object.
         */
        handleEvent(eventType, event) {
            if (!this.isRecording) return;

            // Ignore clicks on the command center itself
            if (event.target.closest('#command-center-ui')) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            const target = event.target;
            const selector = this.getUniqueSelector(target);

            const recordedEvent = {
                type: eventType,
                selector: selector,
                tag: target.tagName.toLowerCase(),
            };

            if (eventType === 'change' && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
                recordedEvent.value = target.value;
            }

            console.log('[ActionRecorder] 🔴 Event recorded:', recordedEvent);
            this.recordedEvents.push(recordedEvent);
        }

        /**
         * Generates a unique and robust CSS selector for a given element.
         * @param {Element} el - The element to generate a selector for.
         * @returns {string} The generated CSS selector.
         */
        getUniqueSelector(el) {
            if (!el) return '';
            let path = '';
            while (el.parentElement) {
                let selector = el.tagName.toLowerCase();
                if (el.id) {
                    selector += `#${el.id}`;
                    path = selector + ' > ' + path;
                    break; // ID is unique, no need to go further
                } else {
                    let sibling = el;
                    let nth = 1;
                    while (sibling.previousElementSibling) {
                        sibling = sibling.previousElementSibling;
                        if (sibling.tagName.toLowerCase() === selector) {
                            nth++;
                        }
                    }
                    if (nth > 1) {
                        selector += `:nth-of-type(${nth})`;
                    }
                }
                path = selector + (path ? ' > ' + path : '');
                el = el.parentElement;
            }
            return path.slice(0, -3); // Remove trailing ' > '
        }

        /**
         * Compiles the recorded events into a replayable JavaScript function.
         * @param {string} skillName - The name of the skill/function.
         * @returns {string} The generated script as a string.
         */
        generateScript(skillName) {
            let scriptBody = `
/**
 * Auto-generated skill: ${skillName}
 * Recorded on: ${new Date().toISOString()}
 */
async function ${skillName}() {
    console.log("▶️ Running skill: ${skillName}");
    const api = window.YooThemeAPI;
    const automation = window.YooThemeAutomation;

    if (!api && !automation) {
        console.error("Neither YooThemeAPI nor YooThemeAutomation are available.");
        return;
    }

`;

            for (const event of this.recordedEvents) {
                scriptBody += `
    // Action: ${event.type} on ${event.tag}
    try {
        console.log("Executing: ${event.type} on '${event.selector}'");
        const element = document.querySelector('${event.selector}');
        if (!element) throw new Error('Element not found');
`;

                switch (event.type) {
                    case 'click':
                        scriptBody += `        element.click();\n`;
                        break;
                    case 'change':
                        scriptBody += `        element.value = '${event.value.replace(/'/g, "\'வுகளை") }';\n`;
                        scriptBody += `        element.dispatchEvent(new Event('input', { bubbles: true }));\n`;
                        scriptBody += `        element.dispatchEvent(new Event('change', { bubbles: true }));\n`;
                        break;
                }

                scriptBody += `
        await new Promise(r => setTimeout(r, 500)); // Wait for UI to update
    } catch (e) {
        console.error("Action failed for selector '${event.selector}':", e);
        // Optionally, try a fallback using automation
    }
`;
            }

            scriptBody += `
    console.log("✅ Skill '${skillName}' finished.");
}
`;
            console.log('[ActionRecorder] 📜 Generated Script:\n', scriptBody);
            return scriptBody;
        }
    }

    // Make it available globally
    window.ActionRecorder = new ActionRecorder();

    console.log('[ActionRecorder] ✅ Recorder initialized. Use `ActionRecorder.start()` and `ActionRecorder.stop()`.');

})();
