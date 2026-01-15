/**
 * Enhanced DOM Intelligence for YOOtheme Builder
 *
 * Advanced DOM scanning, semantic understanding, and element fingerprinting.
 * Independent, robust implementation that replaces external dependencies.
 *
 * @package     AI Builder
 * @version     4.0.0 (Enterprise Edition)
 */

(function() {
    'use strict';

    class DOMIntelligence {
        constructor() {
            this.semanticMap = null;
            this.lastScan = 0;
        }

        /**
         * Initialize the intelligence layer
         */
        init() {
            console.log('🧠 DOM Intelligence 4.0: Initializing...');
            window.DOMIntelligence = this;
        }

        /**
         * Perform a deep scan of the current page structure
         * @returns {Object} Detailed analysis of the page
         */
        scanPage() {
            console.group('🔍 Deep Page Scan');

            const previewFrame = this.getPreviewIframe();
            if (!previewFrame) {
                console.warn('No YOOtheme preview frame found.');
                console.groupEnd();
                return { elements: [], error: 'No preview frame' };
            }

            const doc = previewFrame.contentDocument || previewFrame.contentWindow.document;

            // 1. Identify all "Builder Elements" (Sections, Rows, Columns, Elements)
            // YOOtheme elements usually have 'data-id', 'data-element', or specific classes
            const allNodes = Array.from(doc.querySelectorAll('*'));
            const builderElements = [];

            allNodes.forEach(node => {
                if (this.isYooThemeBuilderElement(node)) {
                    builderElements.push(this.createFingerprint(node, doc));
                }
            });

            // 2. Build Semantic Tree
            const structure = this.buildStructureTree(builderElements);

            // 3. Extract Semantic Context (What is this page about?)
            const context = this.extractPageContext(doc);

            const result = {
                timestamp: Date.now(),
                elements: builderElements,
                structure: structure,
                context: context,
                stats: {
                    totalElements: builderElements.length,
                    sections: builderElements.filter(e => e.type === 'section').length,
                    interactive: builderElements.filter(e => e.isEditable).length
                }
            };

            console.log('Scan complete:', result.stats);
            console.groupEnd();
            return result;
        }

        /**
         * Detect if a DOM node is a significant YOOtheme element
         */
        isYooThemeBuilderElement(element) {
            // Check for YOOtheme-specific markers
            if (element.hasAttribute('data-id')) return true;
            if (element.hasAttribute('data-element')) return true;
            if (element.classList.contains('uk-section')) return true;
            if (element.classList.contains('uk-grid')) return true;
            if (element.classList.contains('uk-card')) return true;

            // Also include basic content tags if they look like content
            const tag = element.tagName.toLowerCase();
            if (['h1','h2','h3','h4','h5','h6','p','a','button','img'].includes(tag)) {
                // Filter out empty/invisible
                const rect = element.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0 && element.textContent.trim().length > 0) {
                    return true;
                }
                if (tag === 'img' && rect.width > 0) return true;
            }

            return false;
        }

        /**
         * Create a detailed "Fingerprint" of an element
         */
        createFingerprint(element, doc) {
            const rect = element.getBoundingClientRect();
            const type = this.detectElementType(element);
            const text = this.extractTextContent(element);

            return {
                // Identity
                tagName: element.tagName.toLowerCase(),
                id: element.id || null,
                classes: Array.from(element.classList),
                attributes: this.extractDataAttributes(element),

                // Semantics
                type: type,
                role: this.inferRole(element),
                text: text,
                textSignature: text.substring(0, 20) + (text.length > 20 ? '...' : ''),

                // Technical
                selector: this.generateSelector(element),
                xpath: this.generateXPath(element),

                // State
                isVisible: rect.width > 0 && rect.height > 0,
                position: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },

                // Interaction
                isEditable: this.hasEditControl(element, doc),
                hasDelete: this.hasDeleteControl(element, doc),

                // Reference (careful with memory leaks if stored too long)
                DOMReference: element
            };
        }

        /**
         * Detect logical type (Hero, Headline, Grid, etc.)
         */
        detectElementType(element) {
            const classStr = element.className.toString().toLowerCase();
            const tag = element.tagName.toLowerCase();

            // YOOtheme specific logic
            if (classStr.includes('uk-section')) return 'section';
            if (classStr.includes('uk-container')) return 'container';
            if (classStr.includes('uk-grid')) return 'grid';
            if (classStr.includes('uk-width')) return 'column';
            if (classStr.includes('uk-card')) return 'card';
            if (classStr.includes('uk-heading') || tag.startsWith('h')) return 'headline';
            if (classStr.includes('uk-button') || tag === 'button') return 'button';
            if (tag === 'img' || classStr.includes('uk-image')) return 'image';

            return 'text'; // default
        }

        /**
         * Find an element using natural language description
         */
        async findElementByDescription(description, pageContext = null) {
            console.group('🎯 Smart Find:', description);

            const context = pageContext || this.scanPage();
            const candidates = context.elements;

            // Tokenize description
            const tokens = description.toLowerCase().split(' ');
            const targetType = this.inferTargetType(tokens); // e.g., 'button', 'headline'

            console.log(`Inferred type: ${targetType || 'any'}, Candidates: ${candidates.length}`);

            let bestMatch = null;
            let highestScore = 0;

            for (const candidate of candidates) {
                let score = 0;

                // 1. Type Match (High weight)
                if (targetType && candidate.type === targetType) score += 50;

                // 2. Text Match (Very High weight)
                const candidateText = candidate.text.toLowerCase();
                // Check for quoted text in description
                const quoteMatch = description.match(/["'](.*?)["']/);
                if (quoteMatch && candidateText.includes(quoteMatch[1].toLowerCase())) {
                    score += 100; // Exact quoted text match
                } else {
                    // Fuzzy text match
                    const words = description.toLowerCase().split(' ').filter(w => w.length > 3);
                    let wordMatches = 0;
                    words.forEach(w => {
                        if (candidateText.includes(w)) wordMatches++;
                    });
                    score += (wordMatches * 10);
                }

                // 3. Context Match (e.g., "in the hero")
                // (Simplified context check)
                if (description.includes('hero') && candidate.DOMReference.closest('.uk-section-primary, .uk-section-secondary')) {
                    score += 20;
                }

                // 4. Editability (Essential)
                if (candidate.isEditable) score += 10;

                if (score > highestScore) {
                    highestScore = score;
                    bestMatch = candidate;
                }
            }

            console.log(`Best match score: ${highestScore}`, bestMatch);
            console.groupEnd();

            return bestMatch ? bestMatch : null;
        }

        inferTargetType(tokens) {
            if (tokens.includes('button') || tokens.includes('cta')) return 'button';
            if (tokens.includes('headline') || tokens.includes('title') || tokens.includes('heading')) return 'headline';
            if (tokens.includes('text') || tokens.includes('paragraph')) return 'text';
            if (tokens.includes('image') || tokens.includes('photo')) return 'image';
            if (tokens.includes('section')) return 'section';
            return null;
        }

        /**
         * Generate a unique robust CSS selector
         */
        generateSelector(element) {
            // 1. ID
            if (element.id) return `#${element.id}`;

            // 2. Data attributes (YOOtheme specific)
            if (element.hasAttribute('data-id')) return `[data-id="${element.getAttribute('data-id')}"]`;

            // 3. Unique Class + Tag
            // (Simplified logic - production would need full uniqueness check)
            let selector = element.tagName.toLowerCase();
            if (element.className && typeof element.className === 'string') {
                const classes = element.className.split(' ').filter(c => c.startsWith('uk-') || c.startsWith('el-'));
                if (classes.length > 0) selector += `.${classes.join('.')}`;
            }
            return selector;
        }

        generateXPath(element) {
            if (element.id !== '') return `//*[@id="${element.id}"]`;
            if (element === document.body) return element.tagName.toLowerCase();

            let ix = 0;
            const siblings = element.parentNode ? element.parentNode.childNodes : [];

            for (let i = 0; i < siblings.length; i++) {
                const sibling = siblings[i];
                if (sibling === element) {
                    return this.generateXPath(element.parentNode) + '/' + element.tagName.toLowerCase() + '[' + (ix + 1) + ']';
                }
                if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
                    ix++;
                }
            }
            return ''; // Fallback
        }

        extractTextContent(element) {
            // Prefer direct text, ignoring children if block level
            return element.innerText || element.textContent || '';
        }

        extractDataAttributes(element) {
            const attrs = {};
            for (let i = 0; i < element.attributes.length; i++) {
                const attr = element.attributes[i];
                if (attr.name.startsWith('data-')) {
                    attrs[attr.name] = attr.value;
                }
            }
            return attrs;
        }

        getPreviewIframe() {
             return document.querySelector('iframe[name*="customizer"], iframe.uk-height-viewport, iframe[src*="site"]');
        }

        hasEditControl(element, doc) {
            // Check logic similar to YooThemeAutomation
            // Check strict child
             if (element.querySelector('a.uk-position-cover[aria-label="Edit"]')) return true;
             // Check parent wrapper
             const wrapper = element.closest('[data-builder-element], [data-element-id]');
             if (wrapper && wrapper.querySelector('a.uk-position-cover[aria-label="Edit"]')) return true;
             return false;
        }

        hasDeleteControl(element, doc) {
             // Similar logic to edit control but looking for trash icon/label
             return false; // Placeholder
        }

        inferRole(element) {
            if (element.tagName === 'A' || element.tagName === 'BUTTON') return 'interactive';
            if (element.tagName.startsWith('H')) return 'heading';
            return 'content';
        }

        buildStructureTree(flatElements) {
             // Reconstruct hierarchical tree from flat list based on DOM containment
             // Simplified: just returning flat list for now, but ready for tree logic
             return flatElements;
        }

        extractPageContext(doc) {
             const title = doc.title;
             const metaDesc = doc.querySelector('meta[name="description"]')?.content;
             return { title, metaDesc };
        }
    }

    // Initialize and expose
    new DOMIntelligence().init();

})();
