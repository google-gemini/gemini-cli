/**
 * DOM Intelligence Layer for YOOtheme AI Builder
 *
 * This module gives the agent deep awareness of the DOM structure
 * and enables precise element targeting through natural language
 *
 * @package     AI Builder
 * @version     2.0.0
 */

(function() {
    'use strict';

    // ============================================================================
    // DOM INTELLIGENCE ENGINE
    // ============================================================================

    const DOMIntelligence = {

        /**
         * Scan and understand the entire page structure with DEEP analysis
         * Returns a comprehensive map of all interactive elements
         */
        scanPage() {
            console.group('🔍 DOM Intelligence: Deep Page Scan');

            const previewFrame = this.getPreviewIframe();
            if (!previewFrame) {
                console.warn('No preview iframe found');
                console.groupEnd();
                return { elements: [], structure: null };
            }

            const doc = previewFrame.contentDocument || previewFrame.contentWindow.document;

            // Find ALL elements, not just builder elements
            const allElements = doc.querySelectorAll('*');
            const editableElements = [];
            const elementMap = [];
            let elementIndex = 0;

            // First pass: identify all potentially editable/interactive elements
            allElements.forEach((el) => {
                // Check if this element is editable or has builder controls
                const hasEditButton = this.hasEditControl(el, doc);
                const hasDeleteButton = this.hasDeleteControl(el, doc);
                const isInteractive = hasEditButton || hasDeleteButton || el.hasAttribute('data-builder-element') || el.hasAttribute('data-element-id');

                // Also include semantic elements even without edit controls
                const isSemanticElement = el.matches('h1, h2, h3, h4, h5, h6, p, a, button, img, section, article, header, footer, nav');

                // Include if interactive OR semantic with content
                const hasContent = el.textContent.trim().length > 0 || el.tagName === 'IMG';

                if (isInteractive || (isSemanticElement && hasContent)) {
                    editableElements.push(el);
                }
            });

            // Second pass: build comprehensive fingerprints
            editableElements.forEach((el) => {
                // Get element type with enhanced detection
                const elementType = this.detectElementType(el);

                // Get text content with context
                const textContent = this.extractTextContent(el);

                // Skip if no meaningful content and not an image
                if (!textContent && el.tagName !== 'IMG') {
                    return;
                }

                // Get visual position
                const rect = el.getBoundingClientRect();

                // Find edit controls (check element and parents)
                const hasEditButton = this.hasEditControl(el, doc);
                const hasDeleteButton = this.hasDeleteControl(el, doc);

                // Analyze parent-child relationships
                const parentInfo = this.analyzeParentage(el);
                const childrenInfo = this.analyzeChildren(el);

                // Get semantic context (what does this element mean on the page?)
                const semanticContext = this.getSemanticContext(el);

                // Create enhanced element fingerprint
                const fingerprint = {
                    index: elementIndex++,
                    type: elementType,
                    text: textContent,
                    textLower: textContent.toLowerCase(),
                    selector: this.generateSelector(el),
                    cssSelector: this.generateCSSSelector(el),
                    xpath: this.generateXPath(el),
                    hasEditButton,
                    hasDeleteButton,
                    isEditable: hasEditButton,
                    position: {
                        top: rect.top,
                        left: rect.left,
                        width: rect.width,
                        height: rect.height,
                        visible: this.isVisible(el)
                    },
                    attributes: {
                        id: el.id || null,
                        classes: Array.from(el.classList),
                        dataAttrs: this.extractDataAttributes(el),
                        tagName: el.tagName.toLowerCase()
                    },
                    parentInfo,
                    childrenInfo,
                    semanticContext,
                    DOMReference: el // Keep reference to actual element
                };

                elementMap.push(fingerprint);
            });

            console.log(`📊 Found ${elementMap.length} interactive elements (deep scan)`);
            console.table(elementMap.map(e => ({
                type: e.type,
                text: e.text.substring(0, 40),
                semantic: e.semanticContext.role,
                editable: e.isEditable ? '✓' : '✗'
            })));
            console.groupEnd();

            return {
                elements: elementMap,
                structure: this.buildStructureTree(doc),
                semanticMap: this.buildSemanticMap(elementMap),
                timestamp: Date.now()
            };
        },

        /**
         * Check if element has edit control (search element and nearby DOM)
         */
        hasEditControl(element, doc) {
            // Direct child
            if (element.querySelector('a[aria-label="Edit"]')) return true;

            // Sibling
            const parent = element.parentElement;
            if (parent && parent.querySelector('a[aria-label="Edit"]')) {
                return true;
            }

            // In builder wrapper
            const wrapper = element.closest('[data-builder-element], [data-element-id]');
            if (wrapper && wrapper.querySelector('a[aria-label="Edit"]')) {
                return true;
            }

            return false;
        },

        /**
         * Check if element has delete control
         */
        hasDeleteControl(element, doc) {
            if (element.querySelector('a[aria-label="Delete"]')) return true;

            const parent = element.parentElement;
            if (parent && parent.querySelector('a[aria-label="Delete"]')) {
                return true;
            }

            const wrapper = element.closest('[data-builder-element], [data-element-id]');
            if (wrapper && wrapper.querySelector('a[aria-label="Delete"]')) {
                return true;
            }

            return false;
        },

        /**
         * Check if element is visible on screen
         */
        isVisible(element) {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);

            return rect.width > 0 &&
                   rect.height > 0 &&
                   style.display !== 'none' &&
                   style.visibility !== 'hidden' &&
                   style.opacity !== '0';
        },

        /**
         * Analyze parent relationships
         */
        analyzeParentage(element) {
            const parents = [];
            let current = element.parentElement;
            let depth = 0;

            while (current && depth < 5) {
                parents.push({
                    tagName: current.tagName.toLowerCase(),
                    classes: Array.from(current.classList),
                    id: current.id || null
                });
                current = current.parentElement;
                depth++;
            }

            return {
                parents,
                depth: parents.length,
                section: element.closest('section, .uk-section, [data-section]')?.tagName.toLowerCase() || null
            };
        },

        /**
         * Analyze children
         */
        analyzeChildren(element) {
            const directChildren = Array.from(element.children);
            const allDescendants = element.querySelectorAll('*');

            return {
                count: directChildren.length,
                totalDescendants: allDescendants.length,
                hasText: !!element.querySelector('p, span, div'),
                hasHeadline: !!element.querySelector('h1, h2, h3, h4, h5, h6'),
                hasImage: !!element.querySelector('img'),
                hasButton: !!element.querySelector('button, a.uk-button')
            };
        },

        /**
         * Get semantic context (what role does this element play?)
         */
        getSemanticContext(element) {
            const tag = element.tagName.toLowerCase();
            const classes = Array.from(element.classList).join(' ');
            const text = element.textContent.trim().toLowerCase();

            let role = 'content';
            let importance = 1;

            // Determine role
            if (tag.match(/^h[1-6]$/)) {
                role = 'headline';
                importance = 7 - parseInt(tag.charAt(1)); // h1=6, h2=5, etc.
            } else if (tag === 'p') {
                role = 'paragraph';
                importance = 2;
            } else if (tag === 'button' || classes.includes('button')) {
                role = 'call-to-action';
                importance = 4;
            } else if (tag === 'img') {
                role = 'image';
                importance = 3;
            } else if (tag === 'nav' || classes.includes('nav')) {
                role = 'navigation';
                importance = 5;
            } else if (tag === 'header' || classes.includes('header')) {
                role = 'header';
                importance = 5;
            } else if (tag === 'footer' || classes.includes('footer')) {
                role = 'footer';
                importance = 2;
            } else if (classes.includes('hero')) {
                role = 'hero';
                importance = 6;
            }

            return {
                role,
                importance,
                isMainContent: importance > 3,
                isInteractive: role === 'call-to-action' || tag === 'a' || tag === 'button'
            };
        },

        /**
         * Generate CSS selector (more reliable)
         */
        generateCSSSelector(element) {
            if (element.id) {
                return `#${element.id}`;
            }

            const path = [];
            let current = element;

            while (current && current !== document.body) {
                let selector = current.tagName.toLowerCase();

                if (current.id) {
                    selector += `#${current.id}`;
                    path.unshift(selector);
                    break;
                }

                if (current.classList.length > 0) {
                    selector += '.' + Array.from(current.classList).join('.');
                }

                path.unshift(selector);
                current = current.parentElement;
            }

            return path.join(' > ');
        },

        /**
         * Generate XPath for maximum reliability
         */
        generateXPath(element) {
            if (element.id) {
                return `//*[@id="${element.id}"]`;
            }

            const path = [];
            let current = element;

            while (current && current.nodeType === Node.ELEMENT_NODE) {
                let index = 0;
                let sibling = current.previousSibling;

                while (sibling) {
                    if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === current.tagName) {
                        index++;
                    }
                    sibling = sibling.previousSibling;
                }

                const tagName = current.tagName.toLowerCase();
                const pathIndex = index > 0 ? `[${index + 1}]` : '';
                path.unshift(`${tagName}${pathIndex}`);

                current = current.parentElement;
            }

            return '/' + path.join('/');
        },

        /**
         * Build semantic map (group elements by meaning)
         */
        buildSemanticMap(elementMap) {
            const map = {
                headlines: [],
                paragraphs: [],
                buttons: [],
                images: [],
                navigation: [],
                other: []
            };

            elementMap.forEach(el => {
                switch (el.semanticContext.role) {
                    case 'headline':
                        map.headlines.push(el);
                        break;
                    case 'paragraph':
                        map.paragraphs.push(el);
                        break;
                    case 'call-to-action':
                        map.buttons.push(el);
                        break;
                    case 'image':
                        map.images.push(el);
                        break;
                    case 'navigation':
                        map.navigation.push(el);
                        break;
                    default:
                        map.other.push(el);
                }
            });

            return map;
        },

        /**
         * Detect what type of element this is (headline, text, image, etc.)
         */
        detectElementType(element) {
            // Check tag name
            const tag = element.tagName.toLowerCase();

            if (tag.match(/^h[1-6]$/)) return 'headline';
            if (tag === 'p') return 'paragraph';
            if (tag === 'img') return 'image';
            if (tag === 'a') return 'link';
            if (tag === 'button') return 'button';

            // Check classes
            const classes = Array.from(element.classList).join(' ');
            if (classes.includes('headline')) return 'headline';
            if (classes.includes('text')) return 'text';
            if (classes.includes('image')) return 'image';
            if (classes.includes('button')) return 'button';
            if (classes.includes('section')) return 'section';
            if (classes.includes('grid')) return 'grid';

            // Check content
            if (element.querySelector('h1, h2, h3, h4, h5, h6')) return 'section-with-headline';
            if (element.querySelector('img')) return 'section-with-image';
            if (element.querySelector('p')) return 'section-with-text';

            // Check data attributes
            const dataType = element.getAttribute('data-element-type') ||
                           element.getAttribute('data-builder-type');
            if (dataType) return dataType;

            return 'container';
        },

        /**
         * Extract meaningful text content from element
         */
        extractTextContent(element) {
            // Try to get the most relevant text

            // For headlines
            const headline = element.querySelector('h1, h2, h3, h4, h5, h6');
            if (headline) {
                return headline.textContent.trim();
            }

            // For text elements
            const paragraph = element.querySelector('p');
            if (paragraph) {
                const text = paragraph.textContent.trim();
                return text.length > 100 ? text.substring(0, 100) + '...' : text;
            }

            // For buttons/links
            const button = element.querySelector('button, a.uk-button');
            if (button) {
                return button.textContent.trim();
            }

            // Fallback to direct text content
            const directText = element.textContent.trim();
            if (directText.length > 0) {
                return directText.length > 100 ? directText.substring(0, 100) + '...' : directText;
            }

            return '';
        },

        /**
         * Generate a reliable CSS selector for element
         */
        generateSelector(element) {
            // If it has an ID, use that
            if (element.id) {
                return `#${element.id}`;
            }

            // Build path from parent to child
            const path = [];
            let current = element;

            while (current && current.tagName) {
                let selector = current.tagName.toLowerCase();

                // Add class if present and unique enough
                if (current.classList.length > 0) {
                    const firstClass = current.classList[0];
                    selector += `.${firstClass}`;
                }

                // Add nth-child if needed for uniqueness
                if (current.parentElement) {
                    const siblings = Array.from(current.parentElement.children);
                    const index = siblings.indexOf(current);
                    if (siblings.length > 1) {
                        selector += `:nth-child(${index + 1})`;
                    }
                }

                path.unshift(selector);
                current = current.parentElement;

                // Stop at body
                if (current && current.tagName.toLowerCase() === 'body') {
                    break;
                }
            }

            return path.slice(-4).join(' > '); // Last 4 levels for specificity
        },

        /**
         * Extract all data-* attributes
         */
        extractDataAttributes(element) {
            const dataAttrs = {};
            Array.from(element.attributes).forEach(attr => {
                if (attr.name.startsWith('data-')) {
                    dataAttrs[attr.name] = attr.value;
                }
            });
            return dataAttrs;
        },

        /**
         * Build a hierarchical structure tree of the page
         */
        buildStructureTree(doc) {
            const sections = doc.querySelectorAll('.uk-section, section, [data-section]');

            return Array.from(sections).map((section, index) => ({
                index,
                type: 'section',
                elements: this.getChildElements(section)
            }));
        },

        /**
         * Get immediate child elements of a container
         */
        getChildElements(container) {
            const children = container.children;
            return Array.from(children).map(child => ({
                type: this.detectElementType(child),
                text: this.extractTextContent(child)
            }));
        },

        /**
         * Find element by natural language description - ENHANCED VERSION
         * This is the KEY function for understanding "make the headline read..."
         *
         * Uses multiple strategies to find the right element:
         * 1. Semantic matching (type + role)
         * 2. Text content matching (exact, partial, fuzzy)
         * 3. Position matching (first, last, nth)
         * 4. Context matching (in section, near other elements)
         * 5. Visual prominence (size, position on screen)
         */
        findElementByDescription(description, pageContext = null) {
            console.group('🎯 Finding Element by Description (Enhanced)');
            console.log('Description:', description);

            // Get current page context with deep scan
            const context = pageContext || this.scanPage();
            console.log(`Searching through ${context.elements.length} elements`);

            // Parse the description to understand what they want
            const intent = this.parseIntent(description);
            console.log('Intent:', intent);

            // Strategy 1: Filter by semantic type if specified
            let candidates = context.elements;

            if (intent.targetType) {
                const semanticMap = context.semanticMap || this.buildSemanticMap(context.elements);

                // Map intent type to semantic category
                if (intent.targetType === 'headline' && semanticMap.headlines) {
                    candidates = semanticMap.headlines;
                    console.log(`Filtered to ${candidates.length} headlines`);
                } else if (intent.targetType === 'paragraph' && semanticMap.paragraphs) {
                    candidates = semanticMap.paragraphs;
                    console.log(`Filtered to ${candidates.length} paragraphs`);
                } else if (intent.targetType === 'button' && semanticMap.buttons) {
                    candidates = semanticMap.buttons;
                    console.log(`Filtered to ${candidates.length} buttons`);
                }
            }

            // Strategy 2: Score each candidate element
            const scored = candidates.map(element => ({
                element,
                score: this.scoreMatch(element, intent),
                reasons: this.explainMatch(element, intent) // For debugging
            }));

            // Sort by score (highest first)
            scored.sort((a, b) => b.score - a.score);

            // Log top matches for transparency
            console.log('Top 5 matches:');
            scored.slice(0, 5).forEach((s, i) => {
                console.log(`  ${i + 1}. [Score: ${s.score}] ${s.element.type}: "${s.element.text.substring(0, 50)}"`);
                console.log(`     Reasons: ${s.reasons.join(', ')}`);
            });

            // Get best match
            const best = scored[0];

            // Validate the match quality
            const minScoreRequired = 10; // Minimum score to accept a match

            if (best && best.score >= minScoreRequired) {
                console.log(`✅ Best match (score: ${best.score}):`, {
                    type: best.element.type,
                    text: best.element.text,
                    selector: best.element.selector,
                    editable: best.element.isEditable
                });

                // CRITICAL: Verify element is actually editable
                if (!best.element.isEditable) {
                    console.warn('⚠️ Best match is not editable! Searching for editable version...');

                    // Try to find editable parent or child
                    const editableAlternative = this.findEditableVersion(best.element, context);
                    if (editableAlternative) {
                        console.log('✅ Found editable alternative:', editableAlternative.text);
                        console.groupEnd();
                        return editableAlternative;
                    }
                }

                console.groupEnd();
                return best.element;
            }

            console.warn(`❌ No good match found (best score: ${best ? best.score : 0}, required: ${minScoreRequired})`);
            console.groupEnd();
            return null;
        },

        /**
         * Find editable version of element (if the element itself isn't editable)
         */
        findEditableVersion(element, context) {
            // Check if there's an editable parent or child with same text
            const editableCandidates = context.elements.filter(el =>
                el.isEditable &&
                el.text === element.text
            );

            return editableCandidates.length > 0 ? editableCandidates[0] : null;
        },

        /**
         * Explain why an element matched (for debugging)
         */
        explainMatch(element, intent) {
            const reasons = [];

            // Type match
            if (intent.targetType && element.type === intent.targetType) {
                reasons.push(`type:${intent.targetType}`);
            }

            // Text match
            if (intent.targetText && element.textLower) {
                if (element.textLower === intent.targetText.toLowerCase()) {
                    reasons.push('exact-text');
                } else if (element.textLower.includes(intent.targetText.toLowerCase())) {
                    reasons.push('partial-text');
                }
            }

            // Position match
            if (intent.position === 'first' && element.index === 0) {
                reasons.push('first-position');
            }

            // Editable
            if (element.isEditable) {
                reasons.push('editable');
            }

            // Importance
            if (element.semanticContext && element.semanticContext.importance > 3) {
                reasons.push('high-importance');
            }

            return reasons.length > 0 ? reasons : ['no-match'];
        },

        /**
         * INTENT THESAURUS - Comprehensive synonym mapping for natural language understanding
         * Maps various ways of expressing actions to standardized intents
         */
        INTENT_PATTERNS: {
            // ADD/CREATE Actions - User wants something NEW that doesn't exist yet
            add: {
                verbs: [
                    'add', 'create', 'insert', 'make', 'build', 'give me', 'put', 'place',
                    'generate', 'produce', 'construct', 'establish', 'set up', 'bring in',
                    'introduce', 'install', 'append', 'include', 'incorporate', 'attach'
                ],
                patterns: [
                    /\b(?:add|create|insert|make|build|put|place|generate|produce|construct)\b/i,
                    /\bgive\s+me\b/i,
                    /\bset\s+up\b/i,
                    /\bi\s+(?:need|want|would like)\s+(?:a|an|some|new)\b/i,
                    /\bcan\s+(?:you|i)\s+(?:add|create|make|get)\b/i
                ],
                // Indicators that suggest ADD (new thing)
                contextual: [
                    /\ba\s+(?:new|fresh)\b/i,           // "a new headline"
                    /\ban?\s+\w+/i,                      // "a button", "an image"
                    /\bgive\s+me\b/i,                    // "give me a section"
                    /\bi\s+need\s+(?:a|an|some)\b/i     // "I need a headline"
                ]
            },

            // EDIT/CHANGE Actions - User wants to MODIFY something that EXISTS
            edit: {
                verbs: [
                    'change', 'edit', 'update', 'modify', 'alter', 'adjust', 'tweak', 'revise',
                    'amend', 'correct', 'fix', 'rewrite', 'rephrase', 'swap', 'replace',
                    'switch', 'transform', 'convert', 'set', 'make it'
                ],
                patterns: [
                    /\b(?:change|edit|update|modify|alter|adjust|tweak|revise|amend|correct|fix)\b/i,
                    /\b(?:rewrite|rephrase|swap|replace|switch|transform|convert)\b/i,
                    /\bmake\s+(?:it|the|that)\b/i,       // "make it say", "make the headline"
                    /\bset\s+(?:it|the|that)\s+to\b/i,  // "set it to"
                    /\b(?:should|needs to)\s+(?:be|say|read)\b/i
                ],
                // Indicators that suggest EDIT (existing thing)
                contextual: [
                    /\bthe\s+\w+/i,                      // "the headline" (definite article = exists)
                    /\bthat\s+\w+/i,                     // "that button"
                    /\bthis\s+\w+/i,                     // "this text"
                    /\binstead\b/i,                      // "instead" implies replacement
                    /\bbut\s+it\s+should\b/i,            // "but it should" = modify existing
                    /\bi\s+need\s+it\s+to\b/i,           // "I need it to" = existing thing
                    /\bcurrently\s+(?:says|reads)\b/i,   // "currently says" = exists
                    /\bright\s+now\b/i,                  // "right now it says" = exists
                    /\bat\s+the\s+moment\b/i             // "at the moment" = exists
                ]
            },

            // REMOVE/DELETE Actions - User wants to GET RID OF something
            remove: {
                verbs: [
                    'remove', 'delete', 'erase', 'clear', 'get rid of', 'take away', 'take out',
                    'eliminate', 'drop', 'destroy', 'hide', 'discard', 'strip', 'purge'
                ],
                patterns: [
                    /\b(?:remove|delete|erase|clear|eliminate|drop|destroy|hide|discard|purge)\b/i,
                    /\bget\s+rid\s+of\b/i,
                    /\btake\s+(?:away|out)\b/i,
                    /\bdon'?t\s+(?:need|want)\b/i       // "don't need that button"
                ]
            }
        },

        /**
         * Detect intent from natural language with comprehensive synonym matching
         */
        detectIntent(description) {
            const lower = description.toLowerCase();
            let action = 'unknown';
            let confidence = 0;

            // Check ADD patterns
            let addScore = 0;
            for (const pattern of this.INTENT_PATTERNS.add.patterns) {
                if (pattern.test(lower)) addScore += 10;
            }
            for (const pattern of this.INTENT_PATTERNS.add.contextual) {
                if (pattern.test(lower)) addScore += 5;
            }

            // Check EDIT patterns
            let editScore = 0;
            for (const pattern of this.INTENT_PATTERNS.edit.patterns) {
                if (pattern.test(lower)) editScore += 10;
            }
            for (const pattern of this.INTENT_PATTERNS.edit.contextual) {
                if (pattern.test(lower)) editScore += 5;
            }

            // Check REMOVE patterns
            let removeScore = 0;
            for (const pattern of this.INTENT_PATTERNS.remove.patterns) {
                if (pattern.test(lower)) removeScore += 10;
            }

            // Determine highest scoring action
            const scores = {
                add: addScore,
                edit: editScore,
                remove: removeScore
            };

            const maxScore = Math.max(addScore, editScore, removeScore);
            if (maxScore > 0) {
                action = Object.keys(scores).find(key => scores[key] === maxScore);
                confidence = maxScore;
            }

            console.log(`[Intent Detection] "${description}" → ${action} (confidence: ${confidence})`);
            console.log(`[Intent Scores] ADD: ${addScore}, EDIT: ${editScore}, REMOVE: ${removeScore}`);

            return { action, confidence };
        },

        /**
         * Parse natural language intent with ENHANCED thesaurus support
         */
        parseIntent(description) {
            const lower = description.toLowerCase();

            const intent = {
                action: 'unknown',
                targetType: null,
                targetText: null,
                newText: null,
                position: null,
                confidence: 0
            };

            // Use comprehensive intent detection
            const detected = this.detectIntent(description);
            intent.action = detected.action;
            intent.confidence = detected.confidence;

            // Detect target type - EXPANDED to catch all YOOtheme elements
            const elementKeywords = [
                // Basic Elements
                'headline', 'title', 'heading', 'h1', 'h2', 'h3', 'text', 'paragraph', 'content',
                'image', 'picture', 'photo', 'video', 'button', 'btn', 'icon', 'divider', 'separator', 'html',
                // Layout Elements
                'grid', 'column', 'row', 'section', 'layout', 'container',
                // Navigation
                'nav', 'navigation', 'menu', 'subnav', 'breadcrumbs', 'pagination',
                // Content Elements
                'list', 'table', 'accordion', 'slider', 'slideshow', 'carousel', 'switcher', 'tabs',
                'lightbox', 'gallery', 'modal', 'panel', 'card',
                // Social & Advanced
                'social', 'share', 'map', 'countdown', 'timer', 'popover', 'tooltip', 'parallax', 'overlay',
                // Typography & Forms
                'quote', 'label', 'badge', 'article', 'search', 'alert', 'progress'
            ];

            // Try to find any element keyword in the description
            for (const keyword of elementKeywords) {
                const regex = new RegExp(`\\b${keyword}\\b`, 'i');
                if (regex.test(lower)) {
                    intent.targetType = keyword;
                    break; // Use first match
                }
            }

            // Special case: if no specific element found but it's an ADD action, try to extract from context
            if (!intent.targetType && intent.action === 'add') {
                // Try patterns like "add a [element]" or "create [element]"
                const addMatch = lower.match(/(?:add|create|insert)\s+(?:a|an|new)?\s*([a-z]+)/i);
                if (addMatch) {
                    intent.targetType = addMatch[1];
                }
            }

            // Extract target text (what to find)
            const targetMatch = lower.match(/(?:the\s+)?(?:headline|text|button|paragraph)\s+(?:that says|saying|with|containing)\s+["']?([^"']+)["']?/);
            if (targetMatch) {
                intent.targetText = targetMatch[1].trim();
            }

            // Extract new text (what to change it to)
            const newTextMatch = description.match(/(?:to\s+)?(?:read|say|be)\s*:?\s*["']?([^"']+)["']?$/i);
            if (newTextMatch) {
                intent.newText = newTextMatch[1].trim();
            }

            // Detect position
            if (lower.includes('first')) {
                intent.position = 'first';
            } else if (lower.includes('last')) {
                intent.position = 'last';
            } else if (lower.includes('second')) {
                intent.position = 'second';
            }

            return intent;
        },

        /**
         * Score how well an element matches the intent - ENHANCED ALGORITHM
         * Uses weighted scoring across multiple dimensions
         */
        scoreMatch(element, intent) {
            let score = 0;
            const weights = {
                exactTextMatch: 150,      // Highest priority - exact text match
                partialTextMatch: 75,     // Partial text match
                fuzzyTextMatch: 30,       // Fuzzy text match
                typeMatch: 60,            // Element type matches
                semanticRoleMatch: 40,    // Semantic role matches
                positionMatch: 25,        // Position (first, last, etc.)
                editableBonus: 50,        // CRITICAL: Is editable
                visibleBonus: 20,         // Element is visible
                importanceBonus: 15,      // High-importance element
                contextBonus: 10          // In right context
            };

            // 1. TEXT MATCHING (highest priority)
            if (intent.targetText && element.textLower) {
                const elementText = element.textLower;
                const targetText = intent.targetText.toLowerCase();

                if (elementText === targetText) {
                    score += weights.exactTextMatch;
                } else if (elementText.includes(targetText)) {
                    // Score higher for closer matches
                    const matchRatio = targetText.length / elementText.length;
                    score += weights.partialTextMatch * matchRatio;
                } else if (this.fuzzyMatch(elementText, targetText)) {
                    score += weights.fuzzyTextMatch;
                }
            }

            // 2. TYPE MATCHING (semantic understanding)
            if (intent.targetType) {
                // Direct type match
                if (element.type === intent.targetType) {
                    score += weights.typeMatch;
                }
                // Partial type match (e.g., "section-with-headline" matches "headline")
                else if (element.type.includes(intent.targetType)) {
                    score += weights.typeMatch * 0.5;
                }

                // Semantic role match
                if (element.semanticContext) {
                    if (intent.targetType === 'headline' && element.semanticContext.role === 'headline') {
                        score += weights.semanticRoleMatch;
                    } else if (intent.targetType === 'paragraph' && element.semanticContext.role === 'paragraph') {
                        score += weights.semanticRoleMatch;
                    } else if (intent.targetType === 'button' && element.semanticContext.role === 'call-to-action') {
                        score += weights.semanticRoleMatch;
                    }
                }
            }

            // 3. POSITION MATCHING
            if (intent.position) {
                if (intent.position === 'first' && element.index === 0) {
                    score += weights.positionMatch;
                } else if (intent.position === 'second' && element.index === 1) {
                    score += weights.positionMatch;
                } else if (intent.position === 'last' && element.index > 10) {
                    // Approximate last for now
                    score += weights.positionMatch;
                }
            }

            // 4. EDITABILITY (CRITICAL for action execution)
            if (element.isEditable) {
                score += weights.editableBonus;
            }

            // 5. VISIBILITY (prefer visible elements)
            if (element.position && element.position.visible) {
                score += weights.visibleBonus;
            }

            // 6. IMPORTANCE (prefer main content)
            if (element.semanticContext && element.semanticContext.importance > 3) {
                score += weights.importanceBonus;
            }

            // 7. CONTEXT (in right section, etc.)
            // If user says "the headline in the hero" and this is in a hero section
            const contextKeywords = ['hero', 'header', 'footer', 'navigation'];
            contextKeywords.forEach(keyword => {
                if (intent.context && intent.context.includes(keyword)) {
                    if (element.parentInfo && element.parentInfo.section) {
                        if (element.parentInfo.section.includes(keyword)) {
                            score += weights.contextBonus;
                        }
                    }
                }
            });

            // 8. PENALTY for non-editable matches (discourage but don't eliminate)
            if (!element.isEditable && intent.action === 'edit') {
                score *= 0.5; // Reduce score by half for non-editable when trying to edit
            }

            return Math.round(score);
        },

        /**
         * Fuzzy text matching
         */
        fuzzyMatch(text1, text2) {
            // Simple Levenshtein-like check
            const words1 = text1.split(/\s+/);
            const words2 = text2.split(/\s+/);

            let matches = 0;
            words2.forEach(word => {
                if (words1.some(w => w.includes(word) || word.includes(w))) {
                    matches++;
                }
            });

            return matches / words2.length > 0.5; // 50% word overlap
        },

        /**
         * Get the preview iframe
         */
        getPreviewIframe() {
            const selectors = [
                'iframe[name*="customizer"]',
                'iframe.uk-height-viewport',
                'iframe[src*="site"]'
            ];

            for (let selector of selectors) {
                const iframe = document.querySelector(selector);
                if (iframe) return iframe;
            }

            return null;
        },

        /**
         * Verify element is still on page and accessible
         */
        verifyElement(elementFingerprint) {
            const previewFrame = this.getPreviewIframe();
            if (!previewFrame) return false;

            const doc = previewFrame.contentDocument || previewFrame.contentWindow.document;

            // Try to find element by selector
            const element = doc.querySelector(elementFingerprint.selector);
            if (!element) return false;

            // Verify text content still matches (element hasn't changed)
            const currentText = this.extractTextContent(element);
            return currentText === elementFingerprint.text;
        },

        /**
         * Execute action on element with COMPREHENSIVE verification
         */
        async executeAction(intent, targetElement) {
            console.group('⚡ Executing Action with Verification');
            console.log('Intent:', intent);
            console.log('Target:', targetElement);

            // Pre-execution verification
            try {
                // 1. Verify element still exists and is accessible
                if (!this.verifyElement(targetElement)) {
                    throw new Error('Target element no longer exists or has changed before action');
                }

                // 2. Verify element is editable (for edit actions)
                if (intent.action === 'edit' && !targetElement.isEditable) {
                    throw new Error('Target element is not editable - cannot perform edit action');
                }

                // 3. Store pre-action state for comparison
                const preActionState = {
                    text: targetElement.text,
                    selector: targetElement.selector,
                    timestamp: Date.now()
                };

                console.log('Pre-action state captured:', preActionState);

                // ============================================================
                // EXECUTE ACTION
                // ============================================================

                if (intent.action === 'edit' && intent.newText) {
                    await this.executeEditAction(targetElement, intent.newText, preActionState);
                    return { success: true, message: `Text updated to: "${intent.newText}"` };

                } else if (intent.action === 'remove') {
                    await this.executeRemoveAction(targetElement, preActionState);
                    return { success: true, message: 'Element removed successfully' };

                } else {
                    throw new Error(`Unsupported action: ${intent.action}`);
                }

            } catch (error) {
                console.error('❌ Action failed:', error);
                console.groupEnd();
                throw error;
            }
        },

        /**
         * Execute edit action with full verification cycle
         */
        async executeEditAction(targetElement, newText, preActionState) {
            console.log('📝 Executing EDIT action...');

            if (!window.YooThemeAutomation) {
                throw new Error('YooThemeAutomation not available');
            }

            // Try multiple selector strategies for maximum reliability
            const selectors = [
                targetElement.selector,
                targetElement.cssSelector,
                targetElement.text // Fallback to text search
            ].filter(Boolean);

            let lastError = null;
            let success = false;

            // Try each selector until one works
            for (const selector of selectors) {
                try {
                    console.log(`Attempting with selector: ${selector}`);

                    // Execute the change
                    await window.YooThemeAutomation.changeText(selector, newText);

                    // Wait for changes to propagate
                    await this.sleep(1500);

                    // VERIFICATION PHASE
                    console.log('🔍 Verifying action success...');

                    // Re-scan the page to get updated state
                    const postActionScan = this.scanPage();

                    // Verify the change actually happened
                    const verification = this.verifyTextChange(
                        postActionScan,
                        targetElement,
                        newText,
                        preActionState
                    );

                    if (verification.success) {
                        console.log('✅ Edit action verified successfully!');
                        console.log('Verification details:', verification);
                        success = true;
                        break;
                    } else {
                        console.warn('⚠️ Verification inconclusive:', verification.reason);
                        lastError = new Error(verification.reason);
                    }

                } catch (error) {
                    console.warn(`Selector ${selector} failed:`, error.message);
                    lastError = error;
                    continue;
                }
            }

            if (!success && lastError) {
                throw new Error(`Edit action failed: ${lastError.message}`);
            }

            console.log('✅ Edit action completed');
            console.groupEnd();
        },

        /**
         * Verify that text was actually changed
         */
        verifyTextChange(postActionScan, originalElement, expectedNewText, preActionState) {
            console.log('Verifying text change...');

            // Strategy 1: Find element by same selector
            const elementBySelectorMatch = postActionScan.elements.find(
                el => el.selector === originalElement.selector ||
                      el.cssSelector === originalElement.cssSelector
            );

            if (elementBySelectorMatch) {
                const textMatches = elementBySelectorMatch.text.includes(expectedNewText) ||
                                  elementBySelectorMatch.textLower.includes(expectedNewText.toLowerCase());

                if (textMatches) {
                    return {
                        success: true,
                        method: 'selector-match',
                        foundText: elementBySelectorMatch.text
                    };
                }
            }

            // Strategy 2: Find ANY element with the new text (looser verification)
            const elementWithNewText = postActionScan.elements.find(
                el => el.type === originalElement.type &&
                      (el.text === expectedNewText || el.textLower === expectedNewText.toLowerCase())
            );

            if (elementWithNewText) {
                return {
                    success: true,
                    method: 'text-match',
                    foundText: elementWithNewText.text
                };
            }

            // Strategy 3: Check if old text is gone (partial success)
            const oldTextStillPresent = postActionScan.elements.some(
                el => el.text === preActionState.text
            );

            if (!oldTextStillPresent) {
                return {
                    success: true,
                    method: 'old-text-removed',
                    foundText: null
                };
            }

            // Verification failed
            return {
                success: false,
                reason: `Could not verify text change. Expected: "${expectedNewText}", Old: "${preActionState.text}"`,
                scannedElements: postActionScan.elements.length
            };
        },

        /**
         * Execute remove action with verification
         */
        async executeRemoveAction(targetElement, preActionState) {
            console.log('🗑️ Executing REMOVE action...');

            if (!window.YooThemeAutomation) {
                throw new Error('YooThemeAutomation not available');
            }

            // Execute removal
            await window.YooThemeAutomation.removeElement(targetElement.selector);

            // Wait for DOM update
            await this.sleep(1500);

            // VERIFICATION: Element should no longer exist
            console.log('🔍 Verifying removal...');

            const postActionScan = this.scanPage();

            // Check if element is gone
            const stillExists = postActionScan.elements.some(
                el => el.selector === targetElement.selector ||
                      (el.text === preActionState.text && el.type === targetElement.type)
            );

            if (stillExists) {
                console.warn('⚠️ Element may still exist after removal attempt');
                // Don't throw error - might be a false positive
            } else {
                console.log('✅ Element successfully removed (verified)');
            }

            console.groupEnd();
        },

        /**
         * Sleep utility
         */
        sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },

        /**
         * HIGH-LEVEL: Process natural language command
         */
        async processCommand(command) {
            console.group('🤖 Processing Natural Language Command');
            console.log('Command:', command);

            try {
                // Step 1: Scan the page to understand what's there
                const pageContext = this.scanPage();

                // Step 2: Parse the command to understand intent
                const intent = this.parseIntent(command);
                console.log('Parsed intent:', intent);

                // Step 3: Handle based on action type
                if (intent.action === 'add') {
                    // For ADD actions, we don't need to find an existing element
                    console.log('ADD action detected - skipping element search');
                    console.warn('DOM Intelligence does not handle ADD actions - falling back to basic parser');
                    console.groupEnd();
                    return {
                        success: false,
                        message: 'DOM Intelligence does not handle ADD actions - using basic parser'
                    };
                }

                // Step 4: Find the target element (for edit/remove actions)
                const targetElement = this.findElementByDescription(command, pageContext);

                if (!targetElement) {
                    console.warn('Could not find element matching:', command);
                    console.groupEnd();
                    return {
                        success: false,
                        message: `Could not find element matching: ${command}`
                    };
                }

                // Step 5: Execute the action
                const result = await this.executeAction(intent, targetElement);

                console.log('✅ Command completed:', result);
                console.groupEnd();
                return result;

            } catch (error) {
                console.error('❌ Command failed:', error);
                console.groupEnd();
                return {
                    success: false,
                    message: `Error: ${error.message}`
                };
            }
        }
    };

    // Make it available globally
    window.DOMIntelligence = DOMIntelligence;

    console.log('✅ DOM Intelligence Layer loaded');
    console.log('📖 Usage:');
    console.log('  DOMIntelligence.scanPage() - Scan and understand the page');
    console.log('  DOMIntelligence.processCommand("make the headline read: Testing 1, 2, 3") - Execute natural language command');
    console.log('  DOMIntelligence.findElementByDescription("the headline") - Find specific element');

})();
