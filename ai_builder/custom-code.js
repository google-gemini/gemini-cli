/**
 * YOOtheme AI Builder - Frontend Controller
 *
 * INSTRUCTIONS:
 * Copy this entire file and paste it into:
 * YOOtheme Customizer → Settings → Custom Code → JavaScript
 *
 * @package     AI Builder
 * @version     1.0.0
 * @copyright   Copyright (C) 2025 AI Builder Team
 * @license     GNU GPL v2 or later
 */

(function() {
    'use strict';

    // ============================================================================
    // CONFIGURATION
    // ============================================================================

    const CONFIG = {
        ajaxEndpoint: '/index.php?option=com_ajax&plugin=ai_builder&group=system&format=json',
        autoSubmitOnSpeech: true,
        autoReloadAfterChanges: true, // Now uses hot reload (NO page refresh!)
        useSeparatePreviewWindow: false, // Disabled by default - hot reload is better!
        showTimestamps: true,
        enableKeyboardShortcuts: true,
        uiPosition: 'bottom-right', // Options: 'bottom-right', 'bottom-left', 'top-right', 'top-left'
        theme: 'light' // Options: 'light', 'dark'
    };

    // ============================================================================
    // STATE MANAGEMENT
    // ============================================================================

    const state = {
        isListening: false,
        isProcessing: false,
        recognition: null,
        styleId: null,
        conversationHistory: [],
        previewWindow: null, // Reference to the separate preview window
        domIntelligenceLoaded: false,
        domIntelligenceLoading: false
    };

    // ============================================================================
    // UI ELEMENTS
    // ============================================================================

    let elements = {
        container: null,
        messagesArea: null,
        inputField: null,
        micButton: null,
        submitButton: null,
        toggleButton: null,
        statusIndicator: null
    };

    // ============================================================================
    // INITIALIZATION
    // ============================================================================

    /**
     * Initialize the AI Builder UI
     */
    function init() {
        // Try to restore style ID from localStorage first
        const savedStyleId = localStorage.getItem('ai_builder_style_id');
        if (savedStyleId) {
            state.styleId = parseInt(savedStyleId, 10);
            console.log('[AI Builder] Restored style ID from localStorage:', state.styleId);
        } else {
            // Get template style ID from URL or page meta
            state.styleId = getTemplateStyleId();

            if (!state.styleId) {
                console.warn('AI Builder: Could not determine template style ID');
            } else {
                // Save to localStorage for future page loads
                localStorage.setItem('ai_builder_style_id', state.styleId);
                console.log('[AI Builder] Saved style ID to localStorage:', state.styleId);
            }
        }

        // Inject UI
        injectStyles();
        injectUI();
        attachEventListeners();

        // Initialize speech recognition if available
        initSpeechRecognition();

        // Keyboard shortcuts
        if (CONFIG.enableKeyboardShortcuts) {
            setupKeyboardShortcuts();
        }

        // Load YooTheme Automation Engine
        if (!window.YooThemeAutomation) {
            console.log('[AI Builder] Loading YooTheme Automation Engine...');
            loadYooThemeAutomation();
        }

        // Load DOM Intelligence Layer
        if (!window.DOMIntelligence) {
            console.log('[AI Builder] Loading DOM Intelligence Layer...');
            loadDOMIntelligence();
        }

        // Load Self-Healing Core
        if (!window.SelfHealingAutomation) {
            console.log('[AI Builder] Loading Self-Healing Core...');
            loadSelfHealingCore();
        }

        console.log('AI Builder initialized successfully');

        // Debug: Log YOOtheme customizer availability
        console.log('[AI Builder] YOOtheme Inspector:', {
            hasCustomizer: !!window.$customizer,
            customizerType: window.$customizer ? typeof window.$customizer : 'undefined',
            customizerMethods: window.$customizer ? Object.keys(window.$customizer).slice(0, 10) : [],
            hasVue: !!window.Vue,
            isInIframe: window !== window.top,
            iframeCount: document.querySelectorAll('iframe').length,
            automationEngine: !!window.YooThemeAutomation
        });
    }

    /**
     * Load YooTheme Automation Engine (inline)
     */
    function loadYooThemeAutomation() {
        // Inline the automation engine here
        window.YooThemeAutomation = {
            async addElement(elementType, targetContainer = null) {
                console.log('[Automation] Adding element:', elementType, 'to container:', targetContainer);

                // Find the add element button in the YOOtheme interface
                const addBtn = this.findAddButton();
                if (!addBtn) throw new Error('Add button not found');

                addBtn.click();
                await this.sleep(500);

                // Find the element type in the dropdown/modal
                const elementBtn = this.findElementButton(elementType);
                if (!elementBtn) throw new Error(`Element type button not found: ${elementType}`);

                elementBtn.click();
                await this.sleep(1000);
                return true;
            },

            resolveElement(selector) {
                const previewFrame = this.getPreviewIframe();
                if (!previewFrame) throw new Error('No preview iframe');

                const previewDoc = previewFrame.contentDocument || previewFrame.contentWindow.document;
                let targetElement = null;
                const trimmedSelector = selector ? selector.trim() : '';

                if (trimmedSelector && (trimmedSelector.startsWith('.') || trimmedSelector.startsWith('#') || trimmedSelector.startsWith('['))) {
                    targetElement = previewDoc.querySelector(trimmedSelector);
                }

                if (!targetElement) {
                    const searchText = trimmedSelector || '';
                    const elements = previewDoc.querySelectorAll('h1, h2, h3, h4, h5, h6, p, div, span, button, a');
                    for (let el of elements) {
                        if (searchText && el.textContent && el.textContent.trim().toLowerCase().includes(searchText.toLowerCase())) {
                            targetElement = el;
                            break;
                        }
                    }
                }

                if (!targetElement) {
                    throw new Error(`Element not found: ${selector}`);
                }

                return { previewDoc, targetElement };
            },

            async editElement(selector) {
                const { previewDoc, targetElement } = this.resolveElement(selector);

                const editButton = targetElement.querySelector('a.uk-position-cover[aria-label="Edit"]') ||
                                  targetElement.closest('[data-builder-element]')?.querySelector('a.uk-position-cover[aria-label="Edit"]');

                if (!editButton) throw new Error('Edit button not found');

                editButton.click();
                await this.waitForEditor();
                return true;
            },

            findAddButton() {
                // Try multiple selectors for the add element button
                const selectors = [
                    'button[uk-icon="plus"]',
                    'button[data-add-element]',
                    'button[data-element="add"]'
                ];

                for (const selector of selectors) {
                    try {
                        const element = document.querySelector(selector);
                        if (element) return element;
                    } catch (e) {
                        continue;
                    }
                }

                // Manual search for buttons containing "Add"
                const buttons = document.querySelectorAll('button, [role="button"]');
                for (const btn of buttons) {
                    if (btn.textContent && btn.textContent.toLowerCase().includes('add')) {
                        return btn;
                    }
                }

                // Look for YOOtheme-specific patterns
                const yoothemeSelectors = [
                    '.builder-add-element',
                    '[data-builder-add-element]',
                    '.uk-icon-button[uk-icon="plus"]'
                ];

                for (const selector of yoothemeSelectors) {
                    const element = document.querySelector(selector);
                    if (element) return element;
                }

                return null;
            },

            findElementButton(elementType) {
                // Map common element types to YOOtheme element names
                const elementMap = {
                    'headline': ['headline', 'title', 'h1', 'heading'],
                    'text': ['text', 'paragraph', 'content'],
                    'image': ['image', 'img', 'photo'],
                    'button': ['button', 'cta', 'link'],
                    'section': ['section', 'container'],
                    'row': ['row', 'grid'],
                    'column': ['column', 'col']
                };

                // Get potential selectors for this element type
                const potentialNames = elementMap[elementType.toLowerCase()] || [elementType];

                for (const name of potentialNames) {
                    // Look for elements with data attributes matching the element type
                    const element = document.querySelector(`[data-element-type*="${name}"], [data-builder-element*="${name}"], .element-${name}`);
                    if (element) return element;

                    // Manual search in buttons containing the name
                    const buttons = document.querySelectorAll('button, [role="button"]');
                    for (const btn of buttons) {
                        if (btn.textContent && btn.textContent.toLowerCase().includes(name.toLowerCase())) {
                            return btn;
                        }
                    }
                }

                // Generic fallback - find any button since we're in the element selection modal
                const allButtons = document.querySelectorAll('button, [role="button"]');
                return allButtons.length > 0 ? allButtons[0] : null;
            },

            async typeInEditor(text) {
                await this.sleep(500);
                const editorBody = this.getEditorBody();
                if (!editorBody) throw new Error('Editor body not found');

                editorBody.innerHTML = '';
                editorBody.textContent = text;

                const inputEvent = new Event('input', { bubbles: true });
                editorBody.dispatchEvent(inputEvent);
                return true;
            },

            async saveLayout() {
                await this.sleep(300);
                const saveButton = document.querySelector('button.uk-button-primary, button:contains("Save")');
                if (!saveButton) throw new Error('Save button not found');

                saveButton.click();
                await this.sleep(1000);
                return true;
            },

            getPreviewIframe() {
                return document.querySelector('iframe[name*="customizer"], iframe.uk-height-viewport, iframe[src*="site"]');
            },

            getEditorBody() {
                const tinyIframe = document.querySelector('iframe[id*="mce"]');
                if (tinyIframe) {
                    const body = tinyIframe.contentDocument?.body;
                    if (body && body.id === 'tinymce') return body;
                }

                const iframes = document.querySelectorAll('iframe');
                for (let iframe of iframes) {
                    try {
                        const body = iframe.contentDocument?.body;
                        if (body && (body.id === 'tinymce' || body.contentEditable === 'true')) {
                            return body;
                        }
                    } catch (e) {}
                }
                return null;
            },

            async waitForEditor(timeout = 5000) {
                const startTime = Date.now();
                while (Date.now() - startTime < timeout) {
                    if (this.getEditorBody()) return true;
                    await this.sleep(100);
                }
                throw new Error('Timeout waiting for editor');
            },

            sleep(ms) {
                return new Promise(resolve => setTimeout(resolve, ms));
            },

            async changeText(selector, newText) {
                console.log('[Automation] Changing text:', selector, '→', newText);
                await this.editElement(selector);
                await this.typeInEditor(newText);
                await this.saveLayout();
                return true;
            },

            findDeleteButton(targetElement, searchRoot = document) {
                if (!targetElement) {
                    return null;
                }

                const scopes = [];
                const container = targetElement.closest('[data-builder-element], [data-element-id]') || targetElement.parentElement;
                if (container) {
                    scopes.push(container);
                }
                scopes.push(targetElement);
                scopes.push(searchRoot);

                const selectors = [
                    'a[aria-label="Delete"]',
                    'button[aria-label="Delete"]',
                    'a[uk-icon*="trash"]',
                    'button[uk-icon*="trash"]',
                    '[data-builder-action="delete"]',
                    '[data-builder-action="remove"]',
                    '[data-action="delete"]',
                    '[data-action="remove"]'
                ];

                for (const scope of scopes) {
                    if (!scope) continue;
                    for (const selector of selectors) {
                        try {
                            const btn = scope.querySelector(selector);
                            if (btn) {
                                return btn;
                            }
                        } catch (e) {
                            continue;
                        }
                    }
                }

                return null;
            },

            async removeElement(selector) {
                console.group('🤖 YOOtheme Automation: Remove Element');
                console.log('Selector:', selector);

                try {
                    const { previewDoc, targetElement } = this.resolveElement(selector);
                    let deleteButton = this.findDeleteButton(targetElement, previewDoc);

                    if (!deleteButton) {
                        deleteButton = this.findDeleteButton(targetElement, document);
                    }

                    if (!deleteButton) {
                        throw new Error('Delete button not found');
                    }

                    deleteButton.click();
                    await this.confirmDeletion();
                    await this.saveLayout();

                    console.log('✅ Element removed successfully!');
                    console.groupEnd();
                    return true;
                } catch (error) {
                    console.error('❌ Remove failed:', error);
                    console.groupEnd();
                    throw error;
                }
            },

            async confirmDeletion(timeout = 2000) {
                const start = Date.now();

                while (Date.now() - start < timeout) {
                    const buttons = document.querySelectorAll('button, .uk-button, .uk-button-danger');
                    for (const btn of buttons) {
                        const text = btn.textContent ? btn.textContent.trim().toLowerCase() : '';
                        if (text && (text === 'delete' || text === 'remove' || text === 'ok' || text === 'confirm')) {
                            if (!btn.disabled) {
                                btn.click();
                                await this.sleep(200);
                                return true;
                            }
                        }
                    }
                    await this.sleep(200);
                }

                return true;
            },

            async addElementAndSetText(elementType, text, targetContainer = null) {
                console.log('[Automation] Adding element and setting text:', elementType, text);

                // Add the element
                await this.addElement(elementType, targetContainer);

                // Get the newly added element and update its text
                await this.sleep(1000); // Wait for element to be fully added

                // Find the last added element and update its content
                const allElements = document.querySelectorAll('[data-builder-element], .builder-element, [data-element-id]');
                const lastElement = allElements[allElements.length - 1];

                if (lastElement) {
                    const editable = lastElement.querySelector('[contenteditable], textarea, input') ||
                                   lastElement.querySelector('h1, h2, h3, h4, h5, h6, p, span');

                    if (editable) {
                        editable.textContent = text;
                        const inputEvent = new Event('input', { bubbles: true });
                        editable.dispatchEvent(inputEvent);
                    }
                }

                await this.saveLayout();
                return true;
            },

            async setElementStyle(selector, property, value) {
                console.log('[Automation] Setting style:', selector, property, value);
                // Placeholder for styling implementation
                // In a real scenario, this would interact with YOOtheme's style settings
                addMessage('agent', `⚠️ Styling not fully implemented yet (Simulated: ${property} = ${value})`);
                return true;
            },

            async moveElement(selector, targetContainer) {
                console.log('[Automation] Moving element:', selector, 'to', targetContainer);
                // Placeholder for drag & drop implementation
                addMessage('agent', `⚠️ Move not fully implemented yet (Simulated move of ${selector})`);
                return true;
            },

            async navigateTo(target) {
                console.log('[Automation] Navigating to:', target);
                addMessage('agent', `🚀 Navigating to ${target}...`);
                // Simulate navigation
                if (target.includes('home')) {
                    window.location.href = '/';
                } else {
                     addMessage('agent', `⚠️ Navigation target "${target}" not recognized, staying on page.`);
                }
                return true;
            }
        };

        console.log('✅ YooTheme Automation Engine loaded');
    }

    /**
     * Load DOM Intelligence Layer with retry and proper state tracking
     */
    function loadDOMIntelligence() {
        if (state.domIntelligenceLoading) {
            console.log('[AI Builder] DOM Intelligence already loading...');
            return;
        }

        state.domIntelligenceLoading = true;

        console.log('[AI Builder] Loading DOM Intelligence Layer...');

        // Try to load from external file first
        const script = document.createElement('script');
        script.src = '/media/plg_system_ai_builder/js/dom-intelligence.js';

        script.onload = function() {
            console.log('✅ DOM Intelligence loaded from external file');
            state.domIntelligenceLoaded = true;
            state.domIntelligenceLoading = false;

            // The objects are in the preview iframe, create parent window references
            setTimeout(() => {
                const iframe = document.querySelector('iframe[name^="preview-"]');
                if (iframe && iframe.contentWindow) {
                    // Create global references in parent window to iframe objects
                    window.DOMIntelligence = iframe.contentWindow.DOMIntelligence;
                    window.YooThemeAutomation = iframe.contentWindow.YooThemeAutomation;
                    window.PageAwareness = iframe.contentWindow.PageAwareness;
                    window.YooThemeElements = iframe.contentWindow.YooThemeElements;

                    if (window.DOMIntelligence && typeof window.DOMIntelligence.processCommand === 'function') {
                        console.log('✅ DOM Intelligence verified and ready (via iframe)');
                        addMessage('agent', '✅ AI Builder ready! You can now use natural language commands.');

                        // Initialize page awareness
                        if (window.PageAwareness) {
                            setTimeout(() => {
                                console.log('[AI Builder] Starting page awareness...');
                                // Page awareness will auto-start from yootheme-automation.js
                            }, 1000);
                        }
                    } else {
                        console.error('❌ DOM Intelligence loaded but not functional');
                        state.domIntelligenceLoaded = false;
                    }
                } else {
                    console.warn('❌ Preview iframe not found - waiting for it to load');
                }
            }, 500);
        };

        script.onerror = function(error) {
            console.error('❌ Could not load external DOM Intelligence:', error);
            state.domIntelligenceLoading = false;
            state.domIntelligenceLoaded = false;

            addMessage('agent', '⚠️ DOM Intelligence failed to load - using basic parser');

            // Fallback: create a simplified version inline
            window.DOMIntelligence = {
                scanPage() {
                    console.warn('Using simplified DOM Intelligence fallback');
                    return { elements: [], structure: null };
                },
                processCommand(cmd) {
                    console.log('Fallback: Processing command with basic parser');
                    // Return false so we use the basic parser
                    return Promise.resolve({ success: false, message: 'DOM Intelligence not fully loaded - using fallback' });
                }
            };
        };

        // Append to head
        document.head.appendChild(script);

        // Also try to load the enhanced yootheme-automation.js if available
        const automationScript = document.createElement('script');
        automationScript.src = '/media/plg_system_ai_builder/js/yootheme-automation.js';
        automationScript.onload = function() {
            console.log('✅ Enhanced YooTheme Automation loaded');
        };
        automationScript.onerror = function() {
            console.log('ℹ️ Using inline automation engine');
        };
        document.head.appendChild(automationScript);

        // Load system introspection for deep knowledge extraction
        const introspectionScript = document.createElement('script');
        introspectionScript.src = '/media/plg_system_ai_builder/js/system-introspection.js';
        introspectionScript.onload = function() {
            console.log('✅ System Introspection loaded');
            // Auto-create knowledge base for AI
            if (window.parent.SystemIntrospection) {
                window.SystemIntrospection = window.parent.SystemIntrospection;
                console.log('📚 Knowledge base available via SystemIntrospection');
            }
        };
        introspectionScript.onerror = function() {
            console.log('ℹ️ System introspection not available');
        };
        document.head.appendChild(introspectionScript);
    }

    /**
     * Load Self-Healing Automation Core
     */
    function loadSelfHealingCore() {
        const script = document.createElement('script');
        script.src = '/media/plg_system_ai_builder/js/self-healing-core.js';
        script.onload = function() {
            console.log('✅ Self-Healing Core loaded');
            addMessage('agent', '🛡️ Self-Healing Automation Active');
        };
        document.head.appendChild(script);
    }

    /**
     * Get the template style ID from various sources
     */
    function getTemplateStyleId() {
        // MANUAL OVERRIDE: Uncomment and set your style ID if auto-detection fails
        // return 12; // <-- Replace 12 with your actual template style ID

        let styleId = null;

        // Try URL parameters (multiple variations)
        const urlParams = new URLSearchParams(window.location.search);
        styleId = urlParams.get('templateStyle')
               || urlParams.get('id')
               || urlParams.get('style')
               || urlParams.get('template');

        console.log('[AI Builder] Checking URL params:', {
            templateStyle: urlParams.get('templateStyle'),
            id: urlParams.get('id'),
            style: urlParams.get('style'),
            template: urlParams.get('template'),
            found: styleId
        });

        // Try to extract from hash
        if (!styleId && window.location.hash) {
            const hashMatch = window.location.hash.match(/[?&](?:id|style|templateStyle)=(\d+)/);
            if (hashMatch) {
                styleId = hashMatch[1];
                console.log('[AI Builder] Found in hash:', styleId);
            }
        }

        // Try Joomla options
        if (!styleId && typeof Joomla !== 'undefined' && Joomla.getOptions) {
            const options = Joomla.getOptions('ai_builder');
            if (options && options.styleId) {
                styleId = options.styleId;
                console.log('[AI Builder] Found in Joomla options:', styleId);
            }
        }

        // Try to find YOOtheme data
        if (!styleId && window.$customizer) {
            try {
                const customizerData = window.$customizer.$data || window.$customizer.data;
                if (customizerData && customizerData.styleId) {
                    styleId = customizerData.styleId;
                    console.log('[AI Builder] Found in YOOtheme customizer:', styleId);
                }
            } catch (e) {
                console.log('[AI Builder] Could not access YOOtheme customizer data');
            }
        }

        // Try meta tag
        if (!styleId) {
            const metaTag = document.querySelector('meta[name="template-style-id"]');
            if (metaTag) {
                styleId = metaTag.content;
                console.log('[AI Builder] Found in meta tag:', styleId);
            }
        }

        // Try to find from template styles dropdown
        if (!styleId) {
            const styleSelect = document.querySelector('select[name="template_style"], select[name="style"]');
            if (styleSelect && styleSelect.value) {
                styleId = styleSelect.value;
                console.log('[AI Builder] Found in style dropdown:', styleId);
            }
        }

        // Last resort: try to get default style from database via API
        if (!styleId) {
            console.warn('[AI Builder] Could not auto-detect style ID. Trying to fetch default...');
            fetchDefaultStyleId().then(id => {
                if (id) {
                    state.styleId = id;
                    console.log('[AI Builder] Fetched default style ID:', id);
                    addMessage('agent', '✅ Connected to default template style');
                }
            });
        }

        console.log('[AI Builder] Final style ID:', styleId || 'NOT FOUND');
        return styleId;
    }

    /**
     * Fetch default template style ID from backend
     */
    async function fetchDefaultStyleId() {
        try {
            const token = getCSRFToken();
            const response = await fetch('/index.php?option=com_ajax&plugin=ai_builder&group=system&format=json&task=getDefaultStyleId', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': token
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success && data.data && data.data.styleId) {
                    return data.data.styleId;
                }
            }
        } catch (e) {
            console.error('[AI Builder] Could not fetch default style ID:', e);
        }
        return null;
    }

    // ============================================================================
    // UI INJECTION
    // ============================================================================

    /**
     * Inject CSS styles into the page
     */
    function injectStyles() {
        const isDark = CONFIG.theme === 'dark';
        const positions = {
            'bottom-right': 'bottom: 20px; right: 20px;',
            'bottom-left': 'bottom: 20px; left: 20px;',
            'top-right': 'top: 80px; right: 20px;',
            'top-left': 'top: 80px; left: 20px;'
        };

        const style = document.createElement('style');
        style.textContent = `
            #ai-builder-container {
                position: fixed;
                ${positions[CONFIG.uiPosition] || positions['bottom-right']}
                width: 400px;
                max-width: calc(100vw - 40px);
                background: ${isDark ? '#1e1e1e' : '#ffffff'};
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, ${isDark ? '0.5' : '0.15'});
                z-index: 99999;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                transition: transform 0.3s ease, opacity 0.3s ease;
                border: 1px solid ${isDark ? '#333' : '#e0e0e0'};
            }

            #ai-builder-container.minimized {
                transform: translateY(calc(100% - 50px));
            }

            #ai-builder-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 12px 16px;
                background: ${isDark ? '#252525' : '#f8f9fa'};
                border-bottom: 1px solid ${isDark ? '#333' : '#e0e0e0'};
                border-radius: 12px 12px 0 0;
                cursor: pointer;
                user-select: none;
            }

            #ai-builder-title {
                font-weight: 600;
                font-size: 14px;
                color: ${isDark ? '#ffffff' : '#333333'};
                display: flex;
                align-items: center;
                gap: 8px;
            }

            #ai-builder-status {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #10b981;
                animation: pulse 2s infinite;
            }

            #ai-builder-status.processing {
                background: #f59e0b;
            }

            #ai-builder-status.listening {
                background: #ef4444;
            }

            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }

            #ai-builder-toggle {
                background: none;
                border: none;
                font-size: 18px;
                cursor: pointer;
                padding: 4px;
                color: ${isDark ? '#999' : '#666'};
            }

            #ai-builder-messages {
                height: 350px;
                max-height: 50vh;
                overflow-y: auto;
                padding: 16px;
                background: ${isDark ? '#1a1a1a' : '#fafafa'};
            }

            .ai-message {
                margin-bottom: 12px;
                padding: 10px 14px;
                border-radius: 8px;
                font-size: 13px;
                line-height: 1.5;
                animation: slideIn 0.2s ease;
            }

            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: translateY(10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            .ai-message.user {
                background: ${isDark ? '#2563eb' : '#e3f2fd'};
                color: ${isDark ? '#ffffff' : '#1565c0'};
                margin-left: 20px;
            }

            .ai-message.agent {
                background: ${isDark ? '#374151' : '#f1f5f9'};
                color: ${isDark ? '#e5e7eb' : '#334155'};
                margin-right: 20px;
            }

            .ai-message.error {
                background: #fee;
                color: #c33;
                border-left: 3px solid #c33;
            }

            .ai-message-time {
                font-size: 10px;
                opacity: 0.6;
                margin-top: 4px;
            }

            #ai-builder-input-area {
                display: flex;
                gap: 8px;
                padding: 12px;
                background: ${isDark ? '#252525' : '#ffffff'};
                border-top: 1px solid ${isDark ? '#333' : '#e0e0e0'};
                border-radius: 0 0 12px 12px;
            }

            #ai-builder-input {
                flex: 1;
                border: 1px solid ${isDark ? '#444' : '#ddd'};
                border-radius: 8px;
                padding: 10px 12px;
                font-size: 13px;
                resize: none;
                font-family: inherit;
                background: ${isDark ? '#1a1a1a' : '#ffffff'};
                color: ${isDark ? '#ffffff' : '#333333'};
                min-height: 40px;
                max-height: 120px;
            }

            #ai-builder-input:focus {
                outline: none;
                border-color: #2563eb;
                box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
            }

            .ai-builder-btn {
                border: none;
                background: #2563eb;
                color: white;
                border-radius: 8px;
                padding: 10px 14px;
                cursor: pointer;
                font-size: 16px;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .ai-builder-btn:hover {
                background: #1d4ed8;
                transform: scale(1.05);
            }

            .ai-builder-btn:active {
                transform: scale(0.95);
            }

            .ai-builder-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                transform: none;
            }

            #ai-builder-mic.listening {
                background: #ef4444;
                animation: pulse 1s infinite;
            }

            /* Scrollbar styling */
            #ai-builder-messages::-webkit-scrollbar {
                width: 6px;
            }

            #ai-builder-messages::-webkit-scrollbar-track {
                background: ${isDark ? '#1a1a1a' : '#f1f1f1'};
            }

            #ai-builder-messages::-webkit-scrollbar-thumb {
                background: ${isDark ? '#444' : '#ccc'};
                border-radius: 3px;
            }

            #ai-builder-messages::-webkit-scrollbar-thumb:hover {
                background: ${isDark ? '#555' : '#999'};
            }

            /* Mobile responsive */
            @media (max-width: 768px) {
                #ai-builder-container {
                    width: calc(100vw - 20px);
                    right: 10px;
                    left: 10px;
                }

                #ai-builder-messages {
                    height: 250px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Inject the AI Builder UI into the page
     */
    function injectUI() {
        const container = document.createElement('div');
        container.id = 'ai-builder-container';
        container.innerHTML = `
            <div id="ai-builder-header">
                <div id="ai-builder-title">
                    <span id="ai-builder-status"></span>
                    <span>🤖 AI Builder</span>
                </div>
                <button id="ai-builder-toggle" title="Minimize/Maximize">−</button>
            </div>
            <div id="ai-builder-messages"></div>
            <div id="ai-builder-input-area">
                <textarea
                    id="ai-builder-input"
                    placeholder="Describe what you want to build..."
                    rows="1"
                ></textarea>
                <button id="ai-builder-mic" class="ai-builder-btn" title="Voice Input (Alt+V)">🎤</button>
                <button id="ai-builder-submit" class="ai-builder-btn" title="Send (Enter)">➤</button>
            </div>
        `;

        document.body.appendChild(container);

        // Store element references
        elements.container = container;
        elements.messagesArea = document.getElementById('ai-builder-messages');
        elements.inputField = document.getElementById('ai-builder-input');
        elements.micButton = document.getElementById('ai-builder-mic');
        elements.submitButton = document.getElementById('ai-builder-submit');
        elements.toggleButton = document.getElementById('ai-builder-toggle');
        elements.statusIndicator = document.getElementById('ai-builder-status');

        // Welcome message
        addMessage('agent', 'Hello! I\'m your AI Builder assistant. Tell me what you want to create, or use voice input!');

        // If no style ID, show help message
        if (!state.styleId) {
            setTimeout(() => {
                addMessage('agent', '⚠️ Could not auto-detect template style ID. Click below to set it manually:');
                addManualStyleIdButton();
            }, 1000);
        } else {
            addMessage('agent', `✅ Connected to template style ID: ${state.styleId}`);
        }

        // Offer to open preview window
        if (CONFIG.useSeparatePreviewWindow) {
            setTimeout(() => {
                addMessage('agent', '💡 TIP: Open a separate preview window to see changes without losing your place here!');
                addPreviewWindowButton();
            }, 1500);
        }
    }

    /**
     * Add button to open preview window
     */
    function addPreviewWindowButton() {
        const buttonDiv = document.createElement('div');
        buttonDiv.className = 'ai-message agent';
        buttonDiv.innerHTML = `
            <button onclick="openPreviewWindowManually()" style="background: #8b5cf6; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px;">
                🪟 Open Preview Window
            </button>
        `;
        elements.messagesArea.appendChild(buttonDiv);

        // Make function available globally
        window.openPreviewWindowManually = function() {
            openPreviewWindow();
        };
    }

    /**
     * Open or reopen the preview window
     */
    function openPreviewWindow() {
        // Get the site URL from the customizer URL
        const urlParams = new URLSearchParams(window.location.search);
        const siteUrl = urlParams.get('site') || window.location.origin;

        // Decode if URL encoded
        const previewUrl = decodeURIComponent(siteUrl);

        console.log('[AI Builder] Opening preview window:', previewUrl);

        // Close old window if it exists
        if (state.previewWindow && !state.previewWindow.closed) {
            state.previewWindow.close();
        }

        // Open new window
        state.previewWindow = window.open(
            previewUrl,
            'ai_builder_preview',
            'width=1200,height=800,menubar=yes,toolbar=yes,location=yes,scrollbars=yes,status=yes'
        );

        if (state.previewWindow) {
            addMessage('agent', '🪟 Preview window opened! Changes will refresh there automatically.');
            localStorage.setItem('ai_builder_preview_opened', 'true');
            return true;
        } else {
            addMessage('error', '❌ Could not open preview window. Check if popups are blocked.');
            return false;
        }
    }

    /**
     * Refresh the preview window
     */
    function refreshPreviewWindow() {
        if (!state.previewWindow || state.previewWindow.closed) {
            addMessage('agent', '⚠️ Preview window was closed. Reopening...');
            return openPreviewWindow();
        }

        try {
            state.previewWindow.location.reload();
            addMessage('agent', '✅ Preview window refreshed!');
            return true;
        } catch (e) {
            console.error('[AI Builder] Could not refresh preview window:', e);
            addMessage('error', '❌ Could not refresh preview window. It may have been closed.');
            return false;
        }
    }

    /**
     * Add a button to reload the builder
     */
    function addReloadButton() {
        const buttonDiv = document.createElement('div');
        buttonDiv.className = 'ai-message agent';

        // Check if using separate preview window
        if (CONFIG.useSeparatePreviewWindow) {
            buttonDiv.innerHTML = `
                <button onclick="refreshPreviewWindowNow()" style="background: #10b981; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; margin-right: 8px;">
                    🪟 Refresh Preview
                </button>
                <button onclick="continueBuilding()" style="background: #2563eb; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px;">
                    ▶️ Continue Building
                </button>
            `;
        } else {
            buttonDiv.innerHTML = `
                <button onclick="reloadBuilderNow()" style="background: #10b981; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; margin-right: 8px;">
                    🔄 Reload Builder Now
                </button>
                <button onclick="continueBuilding()" style="background: #6b7280; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px;">
                    ▶️ Continue Building
                </button>
            `;
        }

        elements.messagesArea.appendChild(buttonDiv);

        // Make functions available globally
        window.refreshPreviewWindowNow = function() {
            refreshPreviewWindow();
        };

        window.reloadBuilderNow = function() {
            addMessage('agent', '🔄 Reloading builder...');
            setTimeout(() => reloadBuilder(), 500);
        };

        window.continueBuilding = function() {
            addMessage('agent', '👍 Great! Keep adding more elements. Type another prompt or click 🎤');
        };
    }

    /**
     * Add a button to manually set style ID
     */
    function addManualStyleIdButton() {
        const buttonDiv = document.createElement('div');
        buttonDiv.className = 'ai-message agent';
        buttonDiv.innerHTML = `
            <button onclick="setStyleIdManually()" style="background: #2563eb; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px;">
                🔧 Set Template Style ID
            </button>
        `;
        elements.messagesArea.appendChild(buttonDiv);

        // Make function available globally
        window.setStyleIdManually = function() {
            const styleId = prompt('Enter your template style ID:\n\n(Find it in Joomla Admin → Extensions → Templates → Styles)\n\nOr run this SQL query:\nSELECT id FROM #__template_styles WHERE client_id=0 AND template LIKE "yootheme%"');

            if (styleId && !isNaN(styleId)) {
                state.styleId = parseInt(styleId, 10);
                // Save to localStorage so it persists across page reloads
                localStorage.setItem('ai_builder_style_id', state.styleId);
                addMessage('agent', `✅ Template style ID set to: ${state.styleId}`);
                addMessage('agent', '💾 Saved to browser storage - will persist across reloads!');
                addMessage('agent', 'You can now use AI Builder! Try saying "Add a headline"');
                console.log('[AI Builder] Manually set style ID:', state.styleId);
            } else if (styleId) {
                addMessage('error', '❌ Invalid style ID. Please enter a number.');
            }
        };
    }

    /**
     * OLD INJECTION LOCATION - Moved above
     */
    function injectAgentUI_OLD() {
        // Welcome message moved to injectUI()
    }

    // ============================================================================
    // EVENT LISTENERS
    // ============================================================================

    /**
     * Attach event listeners to UI elements
     */
    function attachEventListeners() {
        // Submit button
        elements.submitButton.addEventListener('click', handleSubmit);

        // Microphone button
        elements.micButton.addEventListener('click', handleMicClick);

        // Toggle minimize/maximize
        elements.toggleButton.addEventListener('click', toggleMinimize);

        // Enter key to submit (Shift+Enter for new line)
        elements.inputField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
            }
        });

        // Auto-resize textarea
        elements.inputField.addEventListener('input', () => {
            elements.inputField.style.height = 'auto';
            elements.inputField.style.height = elements.inputField.scrollHeight + 'px';
        });
    }

    /**
     * Setup keyboard shortcuts
     */
    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Alt+V for voice input
            if (e.altKey && e.key === 'v') {
                e.preventDefault();
                handleMicClick();
            }

            // Alt+B to focus input
            if (e.altKey && e.key === 'b') {
                e.preventDefault();
                elements.inputField.focus();
            }
        });
    }

    // ============================================================================
    // CORE FUNCTIONALITY
    // ============================================================================

    /**
     * Parse user command to understand intent with COMPREHENSIVE synonym support
     * This is a "dictionary of meaning" that maps natural language to specific actions
     */
    function parseCommand(prompt) {
        const lower = prompt.toLowerCase();

        // ============================================================================
        // COMPREHENSIVE INTENT PATTERNS - The "Thesaurus" for Actions
        // ============================================================================

        // ADD/CREATE patterns - User wants something NEW
        const addPatterns = [
            /\b(?:add|create|insert|make|build|put|place|generate|produce|construct)\b/i,
            /\bgive\s+me\b/i,
            /\bset\s+up\b/i,
            /\bi\s+(?:need|want|would\s+like)\s+(?:a|an|some|new)\b/i,
            /\bcan\s+(?:you|i)\s+(?:add|create|make|get)\b/i,
            /\ba\s+new\b/i,
            /\ban?\s+\w+\s+(?:that|with)/i  // "a button that says", "an image with"
        ];

        // EDIT/CHANGE patterns - User wants to MODIFY existing content
        const editPatterns = [
            /\b(?:change|edit|update|modify|alter|adjust|tweak|revise|amend|correct|fix)\b/i,
            /\b(?:rewrite|rephrase|swap|replace|switch|transform|convert)\b/i,
            /\bmake\s+(?:it|the|that)\b/i,       // "make it say", "make the headline"
            /\bset\s+(?:it|the|that)\s+to\b/i,  // "set it to"
            /\binstead\b/i,                      // "instead" = replacement
            /\bbut\s+it\s+should\b/i,            // "but it should"
            /\bi\s+need\s+it\s+to\b/i,           // "I need it to"
            /\bthe\s+\w+/i,                      // "the headline" (definite = exists)
            /\bthat\s+\w+/i,                     // "that button"
            /\bthis\s+\w+/i                      // "this text"
        ];

        // REMOVE/DELETE patterns - User wants to GET RID OF something
        const removePatterns = [
            /\b(?:remove|delete|erase|clear|eliminate|drop|destroy|hide|discard|purge)\b/i,
            /\bget\s+rid\s+of\b/i,
            /\btake\s+(?:away|out)\b/i,
            /\bdon'?t\s+(?:need|want)\b/i
        ];

        // ============================================================================
        // INTENT DETECTION with Scoring
        // ============================================================================

        let addScore = 0;
        let editScore = 0;
        let removeScore = 0;

        // Score ADD intent
        for (const pattern of addPatterns) {
            if (pattern.test(lower)) addScore += 10;
        }

        // Score EDIT intent
        for (const pattern of editPatterns) {
            if (pattern.test(lower)) editScore += 10;
        }

        // Score REMOVE intent
        for (const pattern of removePatterns) {
            if (pattern.test(lower)) removeScore += 10;
        }

        console.log(`[Intent Parser] Scores - ADD: ${addScore}, EDIT: ${editScore}, REMOVE: ${removeScore}`);

        // ============================================================================
        // Determine Action Based on Highest Score
        // ============================================================================

        let action = 'add'; // Default
        const maxScore = Math.max(addScore, editScore, removeScore);

        if (maxScore > 0) {
            if (removeScore === maxScore) {
                action = 'remove';
            } else if (editScore === maxScore) {
                action = 'edit';
            } else {
                action = 'add';
            }
        }

        console.log(`[Intent Parser] Detected action: ${action}`);

        // ============================================================================
        // Extract Details Based on Action
        // ============================================================================

        if (action === 'edit') {
            // Try to extract "change X to Y" pattern
            const editToMatch = prompt.match(/(?:change|edit|update|modify|alter|tweak|set|make)\s+(?:the\s+)?(.+?)\s+to\s+(?:read\s+|say\s+)?["']?(.+?)["']?$/i);
            if (editToMatch && editToMatch[1] && editToMatch[2]) {
                return {
                    action: 'edit',
                    selector: editToMatch[1].trim(),
                    newText: editToMatch[2].trim(),
                    requiresAiPlan: false
                };
            }

            // Try "the headline should say X" pattern
            const shouldMatch = prompt.match(/(?:the|that|this)\s+(.+?)\s+should\s+(?:say|read|be)\s+["']?(.+?)["']?$/i);
            if (shouldMatch && shouldMatch[1] && shouldMatch[2]) {
                return {
                    action: 'edit',
                    selector: shouldMatch[1].trim(),
                    newText: shouldMatch[2].trim(),
                    requiresAiPlan: false
                };
            }

            // Generic edit - need AI to figure out details
            const editSimpleMatch = prompt.match(/(?:change|edit|update|modify|the|that|this)\s+(.+)$/i);
            if (editSimpleMatch && editSimpleMatch[1]) {
                return {
                    action: 'edit',
                    selector: editSimpleMatch[1].trim(),
                    newText: '',
                    requiresAiPlan: true
                };
            }
        }

        if (action === 'remove') {
            const removeMatch = prompt.match(/(?:remove|delete|get\s+rid\s+of|take\s+away)\s+(?:the\s+)?(.+)$/i);
            if (removeMatch && removeMatch[1]) {
                return {
                    action: 'remove',
                    selector: removeMatch[1].trim(),
                    requiresAiPlan: false
                };
            }
        }

        // Default to ADD
        return {
            action: 'add',
            selector: '',
            requiresAiPlan: true
        };
    }

    /**
     * Handle submit button click
     */
    async function handleSubmit() {
        const prompt = elements.inputField && elements.inputField.value ? elements.inputField.value.trim() : '';

        if (!prompt || state.isProcessing) {
            return;
        }

        // Add user message
        addMessage('user', prompt);
        elements.inputField.value = '';
        elements.inputField.style.height = 'auto';

        // Set processing state
        setProcessing(true);

        try {
            // Check if DOM Intelligence is still loading
            if (state.domIntelligenceLoading) {
                addMessage('agent', '⏳ DOM Intelligence is loading... Please wait a moment and try again.');
                return;
            }

            // Try to use DOM Intelligence for better understanding
            if (state.domIntelligenceLoaded && window.DOMIntelligence && window.DOMIntelligence.processCommand) {
                console.log('[AI Builder] Using DOM Intelligence to process command');
                addMessage('agent', '🧠 Understanding your command...');

                try {
                    const result = await window.DOMIntelligence.processCommand(prompt);
                    if (result.success) {
                        addMessage('agent', `✅ ${result.message}`);
                        handlePostUiMutation();
                        return;
                    } else {
                        console.warn('[AI Builder] DOM Intelligence returned unsuccessful result:', result.message);
                        addMessage('agent', '⚠️ DOM Intelligence incomplete - using fallback parser...');
                    }
                } catch (intelligenceError) {
                    console.warn('[AI Builder] DOM Intelligence failed, falling back to basic parser:', intelligenceError);
                    addMessage('agent', '⚠️ Using fallback command parser...');
                }
            } else if (!state.domIntelligenceLoaded) {
                console.log('[AI Builder] DOM Intelligence not loaded, using basic parser');
                addMessage('agent', 'ℹ️ Using basic parser (DOM Intelligence unavailable)...');
            }

            // Fallback to basic command parsing
            const command = parseCommand(prompt);
            console.log('[AI Builder] Parsed command:', command);

            if (command.action === 'edit') {
                await processEditCommand(command, prompt);

            } else if (command.action === 'add') {
                await processAddCommand(command, prompt);

            } else if (command.action === 'remove') {
                await processRemoveCommand(command, prompt);
            } else {
                throw new Error('Unknown action type');
            }

        } catch (error) {
            addMessage('error', '❌ Error: ' + error.message);
            console.error('[AI Builder] Error:', error);
            console.error('[AI Builder] Full error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
        } finally {
            setProcessing(false);
        }
    }

    async function processEditCommand(command, prompt) {
        if (!window.YooThemeAutomation) {
            throw new Error('YooThemeAutomation not loaded');
        }

        const selectorLabel = command.selector || 'element';

        if (!command.requiresAiPlan && command.newText) {
            addMessage('agent', `🤖 Automating: Edit "${selectorLabel}" to "${command.newText}"`);
            await window.YooThemeAutomation.changeText(selectorLabel, command.newText);
            addMessage('agent', '✅ Element updated via UI automation!');
            handlePostUiMutation();
            return;
        }

        addMessage('agent', `🤖 Planning edit for "${selectorLabel}"...`);
        const plan = await generateActionPlan(prompt, {
            action: 'edit_text',
            selector: command.selector,
            newText: command.newText
        });
        await executeActionPlan(plan);
    }

    async function processAddCommand(command, prompt) {
        if (!window.YooThemeAutomation) {
            throw new Error('YooThemeAutomation not loaded - cannot add elements via UI');
        }

        // Validate element type if YooThemeElements is available
        if (window.YooThemeElements) {
            const elementMatch = prompt.match(/(?:add|create|insert)\s+(?:a|an|new)?\s*([a-z\s]+?)(?:\s+that|\s+with|\s+to|$)/i);
            if (elementMatch) {
                const requestedElement = elementMatch[1].trim();
                const mappedElement = window.YooThemeElements.map(requestedElement);

                if (mappedElement && mappedElement !== requestedElement) {
                    console.log(`[AI Builder] Mapped "${requestedElement}" → "${mappedElement}"`);
                    addMessage('agent', `📝 Understanding: Adding ${mappedElement}`);
                }
            }
        }

        addMessage('agent', '🤖 Planning new element via UI automation...');
        const plan = await generateActionPlan(prompt, {
            action: 'add_element'
        });
        await executeActionPlan(plan);
    }

    async function processRemoveCommand(command, prompt) {
        if (!window.YooThemeAutomation) {
            throw new Error('YooThemeAutomation not loaded - cannot remove elements via UI');
        }

        if (command.selector && !command.requiresAiPlan) {
            addMessage('agent', `🗑️ Removing "${command.selector}" via UI...`);
            try {
                await window.YooThemeAutomation.removeElement(command.selector);
                addMessage('agent', '✅ Element removed!');
                return;
            } catch (error) {
                console.warn('[AI Builder] Direct remove failed, falling back to AI plan:', error);
            }
        }

        addMessage('agent', '🤖 Planning removal via AI automation...');
        const plan = await generateActionPlan(prompt, {
            action: 'remove_element',
            selector: command.selector
        });
        await executeActionPlan(plan);
    }

    async function generateActionPlan(prompt, overrides = {}) {
        if (!state.styleId) {
            throw new Error('Template style ID not detected yet.');
        }

        const response = await callBackend('process', {
            prompt,
            styleId: parseInt(state.styleId, 10),
            currentContext: '',
            mode: 'ui'
        });

        const plan = response.data?.actionPlan || response.data;

        if (!plan || typeof plan !== 'object') {
            throw new Error('Backend did not return a valid action plan.');
        }

        if (overrides.action && !plan.action) {
            plan.action = overrides.action;
        }

        if (!plan.action) {
            plan.action = overrides.action || 'edit_text';
        }

        if (overrides.selector && !plan.selector) {
            plan.selector = overrides.selector;
        }

        if (overrides.newText && !plan.text) {
            plan.text = overrides.newText;
        }

        if (overrides.elementType && !plan.elementType) {
            plan.elementType = overrides.elementType;
        }

        plan.prompt = overrides.prompt || prompt;
        return plan;
    }

    async function executeActionPlan(plan) {
        if (!plan || !plan.action) {
            throw new Error('Invalid automation plan');
        }

        // Use Self-Healing Engine if available, otherwise fallback
        const engine = window.SelfHealingAutomation || window.YooThemeAutomation;

        if (!engine) {
            throw new Error('Automation Engine not loaded');
        }

        // Helper wrapper for execution
        const run = async (action, ...args) => {
            if (window.SelfHealingAutomation) {
                return await window.SelfHealingAutomation.execute(action, args);
            } else {
                return await window.YooThemeAutomation[action](...args);
            }
        };

        const action = plan.action;
        const label = plan.target || plan.selector || plan.elementType || 'element';

        if (action === 'edit_text') {
            const selector = plan.selector || plan.target;
            const text = plan.text || plan.newText;

            if (!selector) throw new Error('Plan missing selector for edit');
            if (!text) throw new Error('Plan missing target text');

            addMessage('agent', `✏️ Editing "${label}"...`);
            await run('changeText', selector, text);
            addMessage('agent', '✅ Text updated!');
            handlePostUiMutation();
            return;
        }

        if (action === 'add_element') {
            addMessage('agent', `➕ Adding "${label}"...`);
            // Note: addElementViaUI handles its own logic, we might want to wrap it later
            await addElementViaUI(plan);
            addMessage('agent', '✅ Element added!');
            handlePostUiMutation();
            return;
        }

        if (action === 'remove_element') {
            const selector = plan.selector || plan.target;
            if (!selector) throw new Error('Plan missing selector for removal');

            addMessage('agent', `🗑️ Removing "${label}"...`);
            await run('removeElement', selector);
            addMessage('agent', '✅ Element removed!');
            handlePostUiMutation();
            return;
        }

        if (action === 'style_element') {
            const selector = plan.selector || plan.target;
            const styles = plan.styles || {};

            if (!selector) throw new Error('Plan missing selector for styling');

            addMessage('agent', `🎨 Styling "${label}"...`);
            for (const [prop, val] of Object.entries(styles)) {
                await run('setElementStyle', selector, prop, val);
            }
            addMessage('agent', '✅ Styles updated!');
            handlePostUiMutation();
            return;
        }

        if (action === 'move_element') {
            const selector = plan.selector || plan.target;
            const destination = plan.destination || plan.to;

            if (!selector) throw new Error('Plan missing selector for move');

            addMessage('agent', `🚚 Moving "${label}"...`);
            await run('moveElement', selector, destination);
            addMessage('agent', '✅ Element moved!');
            handlePostUiMutation();
            return;
        }

        if (action === 'navigate') {
            const target = plan.target || plan.url || plan.page;
            if (!target) throw new Error('Plan missing navigation target');

            // Navigation is less risky, direct call is fine, or wrap if needed
            await window.YooThemeAutomation.navigateTo(target);
            return;
        }

        throw new Error(`Unsupported automation plan action: ${action}`);
    }

    /**
     * Handle microphone button click
     */
    function handleMicClick() {
        if (!state.recognition) {
            addMessage('error', '❌ Speech recognition is not supported in your browser.');
            return;
        }

        if (state.isListening) {
            stopListening();
        } else {
            startListening();
        }
    }

    /**
     * Toggle minimize/maximize UI
     */
    function toggleMinimize() {
        elements.container.classList.toggle('minimized');
        elements.toggleButton.textContent = elements.container.classList.contains('minimized') ? '+' : '−';
    }

    // ============================================================================
    // SPEECH RECOGNITION
    // ============================================================================

    /**
     * Initialize speech recognition
     */
    function initSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            console.warn('Speech recognition not supported');
            elements.micButton.disabled = true;
            elements.micButton.title = 'Speech recognition not supported';
            return;
        }

        state.recognition = new SpeechRecognition();
        state.recognition.continuous = false;
        state.recognition.interimResults = true;
        state.recognition.lang = 'en-US';

        state.recognition.onstart = () => {
            state.isListening = true;
            elements.micButton.classList.add('listening');
            elements.statusIndicator.classList.add('listening');
            addMessage('agent', '🎤 Listening...');
        };

        state.recognition.onresult = (event) => {
            const transcript = Array.from(event.results)
                .map(result => result[0].transcript)
                .join('');

            elements.inputField.value = transcript;
        };

        state.recognition.onend = () => {
            state.isListening = false;
            elements.micButton.classList.remove('listening');
            elements.statusIndicator.classList.remove('listening');

            if (CONFIG.autoSubmitOnSpeech && elements.inputField && elements.inputField.value && elements.inputField.value.trim()) {
                handleSubmit();
            }
        };

        state.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            addMessage('error', `Speech error: ${event.error}`);
            stopListening();
        };
    }

    /**
     * Start listening for speech
     */
    function startListening() {
        if (state.recognition && !state.isListening) {
            elements.inputField.value = '';
            state.recognition.start();
        }
    }

    /**
     * Stop listening for speech
     */
    function stopListening() {
        if (state.recognition && state.isListening) {
            state.recognition.stop();
        }
    }

    // ============================================================================
    // API COMMUNICATION
    // ============================================================================

    /**
     * Call the backend AJAX endpoint
     */
    async function callBackend(task, data) {
        const token = getCSRFToken();

        const response = await fetch(CONFIG.ajaxEndpoint + '&task=' + task, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': token
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`Network error: ${response.status} ${response.statusText}`);
        }

        const jsonResponse = await response.json();

        if (!jsonResponse.success) {
            throw new Error(jsonResponse.message || 'Unknown backend error');
        }

        return jsonResponse;
    }

    /**
     * Get Joomla CSRF token
     */
    function getCSRFToken() {
        if (typeof Joomla !== 'undefined' && Joomla.getOptions) {
            return Joomla.getOptions('csrf.token') || '';
        }
        return '';
    }

    // ============================================================================
    // UI HELPERS
    // ============================================================================

    /**
     * Add a message to the chat
     */
    function addMessage(type, text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `ai-message ${type}`;

        const textSpan = document.createElement('span');
        textSpan.textContent = text;
        messageDiv.appendChild(textSpan);

        if (CONFIG.showTimestamps) {
            const timeSpan = document.createElement('div');
            timeSpan.className = 'ai-message-time';
            timeSpan.textContent = new Date().toLocaleTimeString();
            messageDiv.appendChild(timeSpan);
        }

        elements.messagesArea.appendChild(messageDiv);
        elements.messagesArea.scrollTop = elements.messagesArea.scrollHeight;

        // Store in history
        state.conversationHistory.push({ type, text, timestamp: Date.now() });
    }

    /**
     * Set processing state
     */
    function setProcessing(isProcessing) {
        state.isProcessing = isProcessing;
        elements.submitButton.disabled = isProcessing;
        elements.micButton.disabled = isProcessing;
        elements.inputField.disabled = isProcessing;

        if (isProcessing) {
            elements.statusIndicator.classList.add('processing');
        } else {
            elements.statusIndicator.classList.remove('processing');
        }
    }

    /**
     * Add element via YOOtheme's UI (like a human would)
     */
    async function addElementViaUI(planOrPrompt) {
        const plan = (planOrPrompt && typeof planOrPrompt === 'object' && !Array.isArray(planOrPrompt))
            ? planOrPrompt
            : { prompt: planOrPrompt, text: planOrPrompt };

        const promptText = (plan.prompt || plan.text || '').toString();
        const desiredText = plan.text || plan.prompt || '';
        let elementType = plan.elementType || inferElementType(promptText);

        console.log('[AI Builder] Adding element via UI automation:', {
            prompt: promptText,
            text: desiredText,
            elementType
        });

        // Use the real YOOtheme workflow - NO FALLBACKS
        if (!window.YooThemeAutomation) {
            throw new Error('YooThemeAutomation not loaded - please refresh the page');
        }

        // Use real YOOtheme workflow - this will show the ACTUAL error
        await window.YooThemeAutomation.addElementAndSetText(elementType, desiredText || promptText);
        console.log('[AI Builder] ✅ Element added and text set via real workflow');
        return true;
    }

    function inferElementType(text) {
        const lower = (text || '').toLowerCase();

        if (lower.includes('button') || lower.includes('cta') || lower.includes('call to action')) {
            return 'button';
        }

        if (lower.includes('image') || lower.includes('photo') || lower.includes('gallery')) {
            return 'image';
        }

        if (lower.includes('form') || lower.includes('contact')) {
            return 'form';
        }

        if (lower.includes('hero')) {
            return 'section';
        }

        if (lower.includes('section')) {
            return 'section';
        }

        if (lower.includes('row') || lower.includes('grid')) {
            return 'row';
        }

        if (lower.includes('column') || lower.includes('col')) {
            return 'column';
        }

        if (lower.includes('list')) {
            return 'list';
        }

        if (lower.includes('text') || lower.includes('paragraph') || lower.includes('description')) {
            return 'text';
        }

        if (lower.includes('card')) {
            return 'card';
        }

        if (lower.includes('counter') || lower.includes('stat')) {
            return 'counter';
        }

        return 'headline';
    }

    /**
     * Find the add element button in YOOtheme's interface
     */
    function findAddElementButton() {
        // Common selectors for YOOtheme's add element button
        const selectors = [
            'button[data-add-element]',
            'button:contains("Add Element")',
            '[data-element="add"]',
            '.uk-icon-button[data-element*="add"]',
            'button[title*="Add"]',
            'button[aria-label*="Add"]',
            '.uk-button-primary:contains("Add")',
            'button[data-type="add"]'
        ];

        for (const selector of selectors) {
            try {
                // Use a more basic selector since :contains is not standard
                if (selector.includes(':contains')) {
                    const text = selector.match(/:contains\("([^"]+)"\)/)?.[1] || selector.match(/:contains\('([^']+)'\)/)?.[1];
                    if (text) {
                        const buttons = document.querySelectorAll('button, [role="button"]');
                        for (const btn of buttons) {
                            if (btn.textContent && btn.textContent.toLowerCase().includes(text.toLowerCase())) {
                                return btn;
                            }
                        }
                    }
                } else {
                    const element = document.querySelector(selector);
                    if (element) return element;
                }
            } catch (e) {
                // Some selectors might be invalid, continue to next
                continue;
            }
        }

        // Try common YOOtheme-specific selectors
        const yoothemeSelectors = [
            'button[uk-icon="icon: plus"]',
            'button[uk-toggle*="add-element"]',
            'button[data-builder-action*="add"]',
            '[data-builder-add-element]',
            '.builder-add-element',
            '.uk-button[data-element-type]'
        ];

        for (const selector of yoothemeSelectors) {
            const element = document.querySelector(selector);
            if (element) return element;
        }

        return null;
    }

    /**
     * Update the content of a newly added element
     */
    async function updateNewElementContent(content) {
        const textContent = (content || '').toString().trim();
        console.log('[AI Builder] Updating new element content:', textContent);

        try {
            // Find the most recently added element by looking for elements added to the canvas
            const allElements = document.querySelectorAll('[data-builder-element], .builder-element, [data-element-id]');
            const lastElement = allElements[allElements.length - 1];

            if (lastElement) {
                console.log('[AI Builder] Found last added element:', lastElement);

                // Try to edit the content of the element
                const editable = lastElement.querySelector('[contenteditable], textarea, input') ||
                                lastElement.querySelector('p, h1, h2, h3, h4, h5, h6, span') ||
                                lastElement.parentElement?.querySelector('[contenteditable], textarea, input');

                if (editable) {
                    // Focus the element and update its content
                    editable.focus();

                    if (editable.contentEditable === 'true' || editable.tagName === 'TEXTAREA' || editable.tagName === 'INPUT') {
                        editable.textContent = textContent;

                        // Trigger input event to notify the editor
                        const inputEvent = new Event('input', { bubbles: true });
                        editable.dispatchEvent(inputEvent);
                    } else {
                        editable.textContent = textContent;
                    }

                    console.log('[AI Builder] Updated element content:', textContent);
                    return true;
                }
            }

            // If direct content update failed, try YOOtheme automation
            if (window.YooThemeAutomation && textContent) {
                // Let AI determine what to change based on the prompt
                const selector = lastElement ? lastElement.querySelector('h1, h2, h3, h4, h5, h6, p, span')?.textContent || 'last added element' : 'last added element';
                await window.YooThemeAutomation.changeText(selector, textContent);
                console.log('[AI Builder] Updated via YOOtheme automation');
                return true;
            }

            return false;
        } catch (e) {
            console.error('[AI Builder] Error updating element content:', e);
            return false;
        }
    }

    /**
     * Simple sleep utility
     */
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Handle preview sync after UI automation completes
     */
    function handlePostUiMutation() {
        if (CONFIG.autoReloadAfterChanges) {
            setTimeout(() => {
                if (!triggerYooThemeHotReload()) {
                    reloadBuilderPreview();
                }
            }, 500);
        } else {
            addReloadButton();
        }
    }

    /**
     * Trigger YOOtheme's hot reload (NO PAGE REFRESH!)
     */
    function triggerYooThemeHotReload() {
        console.log('[AI Builder] Triggering YOOtheme hot reload...');

        // Method 1: Try to access YOOtheme's customizer instance
        if (window.$customizer) {
            console.log('[AI Builder] Found $customizer, triggering update...');
            try {
                // Try to trigger a re-render
                if (typeof window.$customizer.update === 'function') {
                    window.$customizer.update();
                    console.log('[AI Builder] ✅ $customizer.update() called');
                    return true;
                }
                if (typeof window.$customizer.$forceUpdate === 'function') {
                    window.$customizer.$forceUpdate();
                    console.log('[AI Builder] ✅ $customizer.$forceUpdate() called');
                    return true;
                }
                if (typeof window.$customizer.load === 'function') {
                    window.$customizer.load();
                    console.log('[AI Builder] ✅ $customizer.load() called');
                    return true;
                }
            } catch (e) {
                console.warn('[AI Builder] Could not call $customizer methods:', e);
            }
        }

        // Method 2: Try to post message to builder iframe
        const builderIframe = document.querySelector('iframe[name*="customizer"], iframe.uk-height-viewport');
        if (builderIframe && builderIframe.contentWindow) {
            console.log('[AI Builder] Found builder iframe, posting message...');
            try {
                builderIframe.contentWindow.postMessage({
                    type: 'yootheme-reload',
                    source: 'ai-builder'
                }, '*');
                console.log('[AI Builder] ✅ postMessage sent to iframe');
                return true;
            } catch (e) {
                console.warn('[AI Builder] Could not post message to iframe:', e);
            }
        }

        // Method 3: Try to access parent window's customizer (if we're in iframe)
        if (window !== window.top) {
            console.log('[AI Builder] Inside iframe, trying parent window...');
            try {
                if (window.parent.$customizer) {
                    if (typeof window.parent.$customizer.update === 'function') {
                        window.parent.$customizer.update();
                        console.log('[AI Builder] ✅ parent.$customizer.update() called');
                        return true;
                    }
                }
                // Post message to parent
                window.parent.postMessage({
                    type: 'yootheme-reload',
                    source: 'ai-builder'
                }, '*');
                console.log('[AI Builder] ✅ postMessage sent to parent');
                return true;
            } catch (e) {
                console.warn('[AI Builder] Could not access parent:', e);
            }
        }

        // Method 4: Try to trigger a custom event that YOOtheme might listen to
        console.log('[AI Builder] Trying custom event...');
        try {
            const event = new CustomEvent('yootheme:update', {
                detail: { source: 'ai-builder' }
            });
            window.dispatchEvent(event);
            document.dispatchEvent(event);
            console.log('[AI Builder] ✅ Custom event dispatched');
        } catch (e) {
            console.warn('[AI Builder] Could not dispatch event:', e);
        }

        // Method 5: Try to find and trigger YOOtheme's Vue instance
        if (window.Vue && window.Vue._instance) {
            console.log('[AI Builder] Found Vue instance, forcing update...');
            try {
                window.Vue._instance.$forceUpdate();
                console.log('[AI Builder] ✅ Vue $forceUpdate() called');
                return true;
            } catch (e) {
                console.warn('[AI Builder] Could not update Vue:', e);
            }
        }

        // Method 6: Simulate a "save" action to trigger YOOtheme's native refresh
        console.log('[AI Builder] Trying to simulate save action...');
        try {
            // Try to find and click YOOtheme's save button (but don't actually navigate)
            const saveButton = document.querySelector('[data-action="save"], .uk-button[href*="save"]');
            if (saveButton) {
                console.log('[AI Builder] Found save button, triggering click event...');
                const clickEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                saveButton.dispatchEvent(clickEvent);
                console.log('[AI Builder] ✅ Save button click simulated');
                return true;
            }
        } catch (e) {
            console.warn('[AI Builder] Could not simulate save:', e);
        }

        console.warn('[AI Builder] ⚠️ Could not trigger hot reload, falling back to iframe refresh');
        return false;
    }

    /**
     * Fallback: Reload just the preview iframe (not the whole customizer)
     */
    function reloadBuilderPreview() {
        console.log('[AI Builder] Reloading preview iframe only...');

        // Find the preview iframe
        const previewIframe = document.querySelector('iframe[name*="customizer"], iframe.uk-height-viewport, iframe[src*="site"]');

        if (previewIframe) {
            try {
                // Reload just the iframe
                previewIframe.contentWindow.location.reload();
                console.log('[AI Builder] ✅ Preview iframe reloaded');
                return true;
            } catch (e) {
                console.warn('[AI Builder] Could not reload iframe:', e);
            }
        }

        console.warn('[AI Builder] ⚠️ Could not find preview iframe');
        return false;
    }

    /**
     * Smart reload: Try multiple approaches to refresh YOOtheme state
     */
    function reloadBuilder() {
        // First, try to force YOOtheme to reload from database
        if (window.$customizer && typeof window.$customizer.load === 'function') {
            try {
                // This should reload the layout from the database, reflecting our changes
                window.$customizer.load();
                console.log('[AI Builder] Called $customizer.load() to refresh from DB');
                addMessage('agent', '✅ Preview updated from database!');
                return;
            } catch (e) {
                console.warn('[AI Builder] $customizer.load() failed:', e);
            }
        }

        // If that doesn't work, try hot reload
        if (triggerYooThemeHotReload()) {
            addMessage('agent', '✅ Preview updated via hot reload!');
            return;
        }

        // Try iframe refresh (keeps customizer state)
        if (reloadBuilderPreview()) {
            addMessage('agent', '✅ Preview iframe refreshed!');
            return;
        }

        // Last resort: full page reload
        console.warn('[AI Builder] Falling back to full page reload');
        addMessage('agent', '⚠️ Using full page reload (couldn\'t trigger hot reload)');

        setTimeout(() => {
            if (window.top && window.top !== window) {
                try {
                    window.top.location.reload();
                } catch (e) {
                    window.location.reload();
                }
            } else {
                window.location.reload();
            }
        }, 1000);
    }

    // ============================================================================
    // START THE APPLICATION
    // ============================================================================

    // Handle focus conflicts before initializing
    function handleFocusBeforeInit() {
        // If an iframe currently has focus, blur it to allow our UI to function properly
        if (document.activeElement && document.activeElement.tagName === 'IFRAME') {
            document.activeElement.blur();
        }
        // Now initialize
        init();
    }

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', handleFocusBeforeInit);
    } else {
        handleFocusBeforeInit();
    }

    // ============================================================================
    // DEVELOPER HELPERS (accessible from console)
    // ============================================================================

    /**
     * Inspect YOOtheme customizer objects
     * Call from console: inspectYooTheme()
     */
    window.inspectYooTheme = function() {
        console.group('🔍 YOOtheme Customizer Inspector');

        console.log('Window objects:', {
            $customizer: window.$customizer,
            Vue: window.Vue,
            UIkit: window.UIkit
        });

        if (window.$customizer) {
            console.log('$customizer properties:', Object.keys(window.$customizer));
            console.log('$customizer methods:', Object.keys(window.$customizer).filter(key =>
                typeof window.$customizer[key] === 'function'
            ));
            console.log('$customizer data:', window.$customizer.$data || window.$customizer.data);
        }

        if (window.parent !== window) {
            console.log('Parent window $customizer:', window.parent.$customizer);
        }

        const iframes = document.querySelectorAll('iframe');
        console.log(`Found ${iframes.length} iframe(s):`, Array.from(iframes).map(iframe => ({
            name: iframe.name,
            src: iframe.src,
            id: iframe.id
        })));

        console.groupEnd();

        return {
            customizer: window.$customizer,
            vue: window.Vue,
            uikit: window.UIkit,
            iframes: Array.from(document.querySelectorAll('iframe'))
        };
    };

    /**
     * Manually trigger hot reload test
     * Call from console: testHotReload()
     */
    window.testHotReload = function() {
        console.log('🔥 Testing hot reload...');
        const result = triggerYooThemeHotReload();
        console.log('Result:', result ? '✅ Success' : '❌ Failed');
        return result;
    };

    // Log helper availability
    console.log('[AI Builder] 💡 Developer helpers available:');
    console.log('  - inspectYooTheme() - Inspect YOOtheme objects');
    console.log('  - testHotReload() - Test hot reload function');

})();
