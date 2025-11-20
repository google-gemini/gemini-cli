/**
 * YOOtheme AI Builder - Frontend Controller (SAFE VERSION)
 *
 * INSTRUCTIONS:
 * Copy this entire file and paste it into:
 * YOOtheme Customizer → Settings → Custom Code → JavaScript
 *
 * This version waits for YOOtheme to fully load before initializing
 *
 * @package     AI Builder
 * @version     1.0.1 (Safe)
 * @copyright   Copyright (C) 2025 AI Builder Team
 * @license     GNU GPL v2 or later
 */

(function() {
    'use strict';

    // ============================================================================
    // SAFE INITIALIZATION - Wait for YOOtheme to be ready
    // ============================================================================

    console.log('[AI Builder] Safe version loading...');

    // Don't initialize if we're not in the customizer
    function isInCustomizer() {
        return !!(window.$customizer || (window.parent && window.parent.$customizer));
    }

    // Wait for YOOtheme to be fully loaded before we do anything
    function waitForYooTheme(callback, timeout = 10000) {
        const startTime = Date.now();

        const checkInterval = setInterval(() => {
            if (isInCustomizer()) {
                clearInterval(checkInterval);
                console.log('[AI Builder] ✅ YOOtheme customizer detected, initializing AI Builder...');
                callback();
            } else if (Date.now() - startTime > timeout) {
                clearInterval(checkInterval);
                console.warn('[AI Builder] ⚠️ Timeout waiting for YOOtheme customizer - not initializing');
            }
        }, 500);
    }

    // Don't start initialization until YOOtheme is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                waitForYooTheme(initSafely);
            }, 1000); // Brief delay to let YOOtheme initialize
        });
    } else {
        setTimeout(() => {
            waitForYooTheme(initSafely);
        }, 1000);
    }

    function initSafely() {
        console.log('[AI Builder] Starting safe initialization...');

        // Double-check we're in the customizer
        if (!isInCustomizer()) {
            console.warn('[AI Builder] Not in customizer context - aborting initialization');
            return;
        }

        // Now run the actual init
        init();
    }

    // ============================================================================
    // CONFIGURATION
    // ============================================================================

    const CONFIG = {
        ajaxEndpoint: '/index.php?option=com_ajax&plugin=ai_builder&group=system&format=json',
        autoSubmitOnSpeech: true,
        autoReloadAfterChanges: true,
        useSeparatePreviewWindow: false,
        showTimestamps: true,
        enableKeyboardShortcuts: true,
        uiPosition: 'bottom-right',
        theme: 'light'
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
        previewWindow: null,
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

    function init() {
        console.log('[AI Builder] Initializing...');

        // Try to restore style ID from localStorage first
        const savedStyleId = localStorage.getItem('ai_builder_style_id');
        if (savedStyleId) {
            state.styleId = parseInt(savedStyleId, 10);
            console.log('[AI Builder] Restored style ID from localStorage:', state.styleId);
        } else {
            state.styleId = getTemplateStyleId();

            if (!state.styleId) {
                console.warn('AI Builder: Could not determine template style ID');
            } else {
                localStorage.setItem('ai_builder_style_id', state.styleId);
                console.log('[AI Builder] Saved style ID to localStorage:', state.styleId);
            }
        }

        // Inject UI - but do it gently
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

        // Load AI Task Planner (v4.0)
        if (!window.AITaskPlanner) {
            console.log('[AI Builder] Loading AI Task Planner...');
            loadAITaskPlanner();
        }

        // Load Enhanced AI Task Planner with Cleo.js Integration
        if (!window.CleoTaskPlannerEnhanced) {
            console.log('[AI Builder] Loading Enhanced AI Task Planner with Cleo.js Integration...');
            loadEnhancedTaskPlanner();
        }

        // Load Advanced Styling Engine (v4.0)
        if (!window.AdvancedStylingEngine) {
            console.log('[AI Builder] Loading Advanced Styling Engine...');
            loadAdvancedStylingEngine();
        }

        // Load AI Builder Integration (v4.0)
        if (!window.AIBuilderIntegration) {
            console.log('[AI Builder] Loading AI Builder Integration...');
            loadAIBuilderIntegration();
        }

        // Load Cleo.js Integration (superior capabilities)
        if (!window.CleoAIIntegration) {
            console.log('[AI Builder] Loading Cleo.js Integration (Chameleon AI-Forge)...');
            loadCleoIntegration();
        }

        console.log('[AI Builder] ✅ Initialized successfully');

        // Debug info
        console.log('[AI Builder] YOOtheme Inspector:', {
            hasCustomizer: !!window.$customizer,
            customizerType: window.$customizer ? typeof window.$customizer : 'undefined',
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
        window.YooThemeAutomation = {
            async addElement(elementType, targetContainer = null) {
                console.log('[Automation] Adding element:', elementType);
                const addBtn = this.findAddButton();
                if (!addBtn) throw new Error('Add button not found');
                addBtn.click();
                await this.sleep(500);
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
                if (!targetElement) throw new Error(`Element not found: ${selector}`);
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
                const selectors = ['button[uk-icon="plus"]', 'button[data-add-element]', 'button[data-element="add"]'];
                for (const selector of selectors) {
                    try {
                        const element = document.querySelector(selector);
                        if (element) return element;
                    } catch (e) { continue; }
                }
                const buttons = document.querySelectorAll('button, [role="button"]');
                for (const btn of buttons) {
                    if (btn.textContent && btn.textContent.toLowerCase().includes('add')) return btn;
                }
                return null;
            },

            findElementButton(elementType) {
                const elementMap = {
                    'headline': ['headline', 'title', 'h1', 'heading'],
                    'text': ['text', 'paragraph', 'content'],
                    'image': ['image', 'img', 'photo'],
                    'button': ['button', 'cta', 'link']
                };
                const potentialNames = elementMap[elementType.toLowerCase()] || [elementType];
                for (const name of potentialNames) {
                    const element = document.querySelector(`[data-element-type*="${name}"], [data-builder-element*="${name}"]`);
                    if (element) return element;
                    const buttons = document.querySelectorAll('button, [role="button"]');
                    for (const btn of buttons) {
                        if (btn.textContent && btn.textContent.toLowerCase().includes(name.toLowerCase())) return btn;
                    }
                }
                return null;
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
                const saveButton = document.querySelector('button.uk-button-primary');
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
                        if (body && (body.id === 'tinymce' || body.contentEditable === 'true')) return body;
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

            async addElementAndSetText(elementType, text) {
                console.log('[Automation] Adding element and setting text:', elementType, text);
                await this.addElement(elementType);
                await this.sleep(1000);
                const allElements = document.querySelectorAll('[data-builder-element], .builder-element');
                const lastElement = allElements[allElements.length - 1];
                if (lastElement) {
                    const editable = lastElement.querySelector('[contenteditable], textarea, input, h1, h2, h3, h4, h5, h6, p');
                    if (editable) {
                        editable.textContent = text;
                        const inputEvent = new Event('input', { bubbles: true });
                        editable.dispatchEvent(inputEvent);
                    }
                }
                await this.saveLayout();
                return true;
            }
        };
        console.log('✅ YooTheme Automation Engine loaded');
    }

    /**
     * Load DOM Intelligence Layer
     */
    function loadDOMIntelligence() {
        if (state.domIntelligenceLoading) return;
        state.domIntelligenceLoading = true;

        const script = document.createElement('script');
        script.src = '/media/plg_system_ai_builder/js/dom-intelligence.js';

        script.onload = function() {
            console.log('✅ DOM Intelligence loaded');
            state.domIntelligenceLoaded = true;
            state.domIntelligenceLoading = false;

            // Wait a bit for all scripts to finish loading
            setTimeout(() => {
                // Check if automation engine is available in parent window (where we loaded it)
                if (window.YooThemeAutomation && typeof window.YooThemeAutomation.addElementAndSetText === 'function') {
                    console.log('✅ YooTheme Automation verified in parent window');
                }

                if (window.DOMIntelligence && typeof window.DOMIntelligence.processCommand === 'function') {
                    console.log('✅ DOM Intelligence verified in parent window');

                    // Load Enhanced DOM Intelligence with Cleo.js Integration after base DOMIntelligence
                    setTimeout(() => {
                        loadEnhancedDOMIntelligence();
                    }, 1000); // Delay to ensure base DOMIntelligence is fully ready
                }

                if (window.YooThemeAutomation && window.DOMIntelligence) {
                    addMessage('agent', '✅ All systems ready! Try a command.');
                }
            }, 1000);
        };

        script.onerror = function() {
            console.error('❌ Could not load DOM Intelligence');
            state.domIntelligenceLoading = false;
            state.domIntelligenceLoaded = false;
            window.DOMIntelligence = {
                scanPage() { return { elements: [], structure: null }; },
                processCommand() { return Promise.resolve({ success: false }); }
            };
        };

        document.head.appendChild(script);

        const automationScript = document.createElement('script');
        automationScript.src = '/media/plg_system_ai_builder/js/yootheme-automation.js';
        automationScript.onload = () => console.log('✅ Enhanced Automation loaded');
        automationScript.onerror = () => console.log('ℹ️ Using inline automation');
        document.head.appendChild(automationScript);
    }

    /**
     * Load Enhanced DOM Intelligence with Cleo.js Integration
     */
    function loadEnhancedDOMIntelligence() {
        const script = document.createElement('script');
        script.src = '/media/plg_system_ai_builder/js/dom-intelligence-enhanced.js';
        script.onload = () => {
            console.log('✅ Enhanced DOM Intelligence with Cleo.js Integration loaded');
            window.CleoDOMIntelligenceEnhanced = true;
        };
        script.onerror = () => {
            console.error('❌ Could not load Enhanced DOM Intelligence with Cleo.js Integration');
        };
        document.head.appendChild(script);
    }

    /**
     * Load AI Task Planner (v4.0)
     */
    function loadAITaskPlanner() {
        const script = document.createElement('script');
        script.src = '/media/plg_system_ai_builder/js/ai-task-planner.js';
        script.onload = () => {
            console.log('✅ AI Task Planner loaded');
        };
        script.onerror = () => {
            console.error('❌ Could not load AI Task Planner');
        };
        document.head.appendChild(script);
    }

    /**
     * Load Enhanced AI Task Planner with Cleo.js Integration
     */
    function loadEnhancedTaskPlanner() {
        const script = document.createElement('script');
        script.src = '/media/plg_system_ai_builder/js/ai-task-planner-enhanced.js';
        script.onload = () => {
            console.log('✅ Enhanced AI Task Planner with Cleo.js Integration loaded');
            window.CleoTaskPlannerEnhanced = true;
        };
        script.onerror = () => {
            console.error('❌ Could not load Enhanced AI Task Planner with Cleo.js Integration');
        };
        document.head.appendChild(script);
    }

    /**
     * Load Advanced Styling Engine (v4.0)
     */
    function loadAdvancedStylingEngine() {
        const script = document.createElement('script');
        script.src = '/media/plg_system_ai_builder/js/advanced-styling-engine.js';
        script.onload = () => {
            console.log('✅ Advanced Styling Engine loaded');
        };
        script.onerror = () => {
            console.error('❌ Could not load Advanced Styling Engine');
        };
        document.head.appendChild(script);
    }

    /**
     * Load AI Builder Integration (v4.0)
     */
    function loadAIBuilderIntegration() {
        const script = document.createElement('script');
        script.src = '/media/plg_system_ai_builder/js/ai-builder-integration.js';
        script.onload = () => {
            console.log('✅ AI Builder Integration loaded');
            // Integration will dispatch 'ai-builder-ready' event when ready
        };
        script.onerror = () => {
            console.error('❌ Could not load AI Builder Integration');
        };
        document.head.appendChild(script);
    }

    /**
     * Load Cleo.js Integration (superior capabilities from Chameleon AI-Forge)
     */
    function loadCleoIntegration() {
        const script = document.createElement('script');
        script.src = '/media/plg_system_ai_builder/js/cleo-integration.js';
        script.onload = () => {
            console.log('✅ Cleo.js Integration (Chameleon AI-Forge) loaded');
        };
        script.onerror = () => {
            console.error('❌ Could not load Cleo.js Integration');
        };
        document.head.appendChild(script);
    }

    function getTemplateStyleId() {
        let styleId = null;
        const urlParams = new URLSearchParams(window.location.search);
        styleId = urlParams.get('templateStyle') || urlParams.get('id');
        if (!styleId && window.$customizer) {
            try {
                const customizerData = window.$customizer.$data || window.$customizer.data;
                if (customizerData && customizerData.styleId) styleId = customizerData.styleId;
            } catch (e) {}
        }
        return styleId;
    }

    // ============================================================================
    // UI INJECTION (Simplified - same as before but called after delay)
    // ============================================================================

    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #ai-builder-container {
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 380px;
                max-width: calc(100vw - 440px);
                background: #ffffff;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
                z-index: 9999;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                border: 1px solid #e0e0e0;
                transition: transform 0.3s ease, opacity 0.3s ease;
            }
            #ai-builder-container.minimized {
                transform: translateY(calc(100% - 48px));
            }
            #ai-builder-container.minimized #ai-builder-messages,
            #ai-builder-container.minimized #ai-builder-input-area {
                display: none;
            }
            #ai-builder-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 12px 16px;
                background: #f8f9fa;
                border-bottom: 1px solid #e0e0e0;
                border-radius: 12px 12px 0 0;
                cursor: pointer;
            }
            #ai-builder-title {
                font-weight: 600;
                font-size: 14px;
                color: #333333;
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
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }
            #ai-builder-messages {
                height: 280px;
                overflow-y: auto;
                padding: 16px;
                background: #fafafa;
            }
            #ai-builder-minimize {
                background: none;
                border: none;
                color: #666;
                cursor: pointer;
                font-size: 18px;
                padding: 4px 8px;
                border-radius: 4px;
                transition: background 0.2s;
            }
            #ai-builder-minimize:hover {
                background: #e0e0e0;
            }
            .ai-message {
                margin-bottom: 12px;
                padding: 10px 14px;
                border-radius: 8px;
                font-size: 13px;
                line-height: 1.5;
            }
            .ai-message.user {
                background: #e3f2fd;
                color: #1565c0;
                margin-left: 20px;
            }
            .ai-message.agent {
                background: #f1f5f9;
                color: #334155;
                margin-right: 20px;
            }
            .ai-message.error {
                background: #fee;
                color: #c33;
                border-left: 3px solid #c33;
            }
            #ai-builder-input-area {
                display: flex;
                gap: 8px;
                padding: 12px;
                background: #ffffff;
                border-top: 1px solid #e0e0e0;
                border-radius: 0 0 12px 12px;
            }
            #ai-builder-input {
                flex: 1;
                border: 1px solid #ddd;
                border-radius: 8px;
                padding: 10px 12px;
                font-size: 13px;
                resize: none;
                font-family: inherit;
                min-height: 40px;
            }
            .ai-builder-btn {
                border: none;
                background: #2563eb;
                color: white;
                border-radius: 8px;
                padding: 10px 14px;
                cursor: pointer;
                font-size: 16px;
            }
            .ai-builder-btn:hover {
                background: #1d4ed8;
            }
        `;
        document.head.appendChild(style);
    }

    function injectUI() {
        const container = document.createElement('div');
        container.id = 'ai-builder-container';
        container.innerHTML = `
            <div id="ai-builder-header">
                <div id="ai-builder-title">
                    <span id="ai-builder-status"></span>
                    <span>🤖 AI Builder</span>
                </div>
                <button id="ai-builder-minimize" title="Minimize">−</button>
            </div>
            <div id="ai-builder-messages"></div>
            <div id="ai-builder-input-area">
                <textarea id="ai-builder-input" placeholder="Describe what you want to build..." rows="1"></textarea>
                <button id="ai-builder-submit" class="ai-builder-btn" title="Send">➤</button>
            </div>
        `;
        document.body.appendChild(container);

        elements.container = container;
        elements.messagesArea = document.getElementById('ai-builder-messages');
        elements.inputField = document.getElementById('ai-builder-input');
        elements.submitButton = document.getElementById('ai-builder-submit');

        // Add minimize functionality
        const minimizeBtn = document.getElementById('ai-builder-minimize');
        minimizeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            container.classList.toggle('minimized');
            minimizeBtn.textContent = container.classList.contains('minimized') ? '+' : '−';
        });
        elements.statusIndicator = document.getElementById('ai-builder-status');

        addMessage('agent', 'AI Builder ready! Type your command or say "add a headline that reads: Testing 1, 2, 3"');
        if (state.styleId) {
            addMessage('agent', `✅ Connected to template style ID: ${state.styleId}`);
        }
    }

    function attachEventListeners() {
        elements.submitButton.addEventListener('click', handleSubmit);
        elements.inputField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
            }
        });
    }

    function initSpeechRecognition() {
        // Simplified - removed for now to avoid interference
    }

    function setupKeyboardShortcuts() {
        // Simplified - removed for now to avoid interference
    }

    // ============================================================================
    // COMMAND PARSING
    // ============================================================================

    /**
     * Parse natural language command to extract action, element type and text
     * Examples:
     *   "add a headline that reads: Testing 1, 2, 3" → {action: "add", elementType: "headline", text: "Testing 1, 2, 3"}
     *   "create a button that says: Click Me" → {action: "add", elementType: "button", text: "Click Me"}
     *   "change the headline to read: Hello" → {action: "change", elementType: "headline", text: "Hello"}
     *   "update button text to: Click Here" → {action: "change", elementType: "button", text: "Click Here"}
     */
    function parseNaturalLanguageCommand(input) {
        const lowercased = input.toLowerCase();

        // Pattern 1: "change/update/edit [the] [element] to [read/say]: [text]"
        const changePattern1 = /(?:change|update|edit|modify)\s+(?:the\s+)?(\w+)\s+(?:to\s+)?(?:read|say|text)?:\s*(.+)/i;
        const changeMatch1 = input.match(changePattern1);
        if (changeMatch1) {
            return {
                success: true,
                action: 'change',
                elementType: changeMatch1[1].trim(),
                text: changeMatch1[2].trim()
            };
        }

        // Pattern 2: "change/update [the] [element] to: [text]" (simpler form)
        const changePattern2 = /(?:change|update|edit|modify)\s+(?:the\s+)?(\w+)\s+to:\s*(.+)/i;
        const changeMatch2 = input.match(changePattern2);
        if (changeMatch2) {
            return {
                success: true,
                action: 'change',
                elementType: changeMatch2[1].trim(),
                text: changeMatch2[2].trim()
            };
        }

        // Pattern 3: "add/create a [new] [element] that reads/says: [text]"
        // Also handles variations like "add a new headline that reads:" or "add headline that reads:"
        const pattern1 = /(?:add|create|make)\s+(?:(?:a|an)\s+)?(?:new\s+)?(\w+)\s+(?:that\s+)?(?:reads|says|with\s+text):\s*(.+)/i;
        const match1 = input.match(pattern1);
        if (match1) {
            return {
                success: true,
                action: 'add',
                elementType: match1[1].trim(),
                text: match1[2].trim()
            };
        }

        // Pattern 4: "add/create [element]: [text]"
        const pattern2 = /(?:add|create|make)\s+(?:a|an)?\s*(\w+):\s*(.+)/i;
        const match2 = input.match(pattern2);
        if (match2) {
            return {
                success: true,
                action: 'add',
                elementType: match2[1].trim(),
                text: match2[2].trim()
            };
        }

        // Pattern 5: "[text]" (assume headline if no element specified and text is quoted)
        const pattern3 = /^["'](.+)["']$/;
        const match3 = input.match(pattern3);
        if (match3) {
            return {
                success: true,
                action: 'add',
                elementType: 'headline',
                text: match3[1].trim()
            };
        }

        // Pattern 6: "add a [element]" (layout elements that don't need text)
        const layoutPattern = /(?:add|create|make)\s+(?:a|an)\s+(?:new\s+)?(\w+)$/i;
        const layoutMatch = input.match(layoutPattern);
        if (layoutMatch) {
            const elementType = layoutMatch[1].trim().toLowerCase();
            // These elements don't require text content
            const layoutElements = ['section', 'navbar', 'nav', 'navigation', 'grid', 'column', 'row', 'divider', 'slider', 'gallery', 'map'];
            if (layoutElements.includes(elementType)) {
                return {
                    success: true,
                    action: 'add',
                    elementType: elementType,
                    text: '' // No text needed for layout elements
                };
            }
        }

        // Pattern 7: Just plain text (assume headline)
        if (!lowercased.includes('add') && !lowercased.includes('create') && !lowercased.includes('change')) {
            return {
                success: true,
                action: 'add',
                elementType: 'headline',
                text: input.trim()
            };
        }

        return {
            success: false,
            error: 'Could not parse command'
        };
    }

    // ============================================================================
    // SIMPLIFIED HANDLERS
    // ============================================================================

    /**
     * Detect if command has multiple parts (e.g., "add a section and add a headline")
     */
    function detectMultiPartCommand(prompt) {
        // Split on common conjunctions and punctuation
        const separators = [
            /,\s*and\s+then\s+/gi,
            /,\s*then\s+/gi,
            /\s+and\s+then\s+/gi,
            /\.\s+then\s+/gi,
            /\.\s+/g,
            /,\s*and\s+(?=add|create|make|change|remove)/gi
        ];

        let parts = [prompt];

        // Try each separator
        for (const separator of separators) {
            const newParts = [];
            for (const part of parts) {
                const split = part.split(separator);
                newParts.push(...split);
            }
            parts = newParts.filter(p => p.trim().length > 0);

            // If we got meaningful splits, use them
            if (parts.length > 1) {
                // Validate that each part looks like a command
                const validParts = parts.filter(p => {
                    const lower = p.toLowerCase().trim();
                    return lower.match(/^(add|create|make|change|edit|remove|delete)/);
                });

                if (validParts.length > 1) {
                    return validParts;
                }
            }
        }

        return [prompt]; // Return original if no valid multi-part detected
    }

    /**
     * Execute a basic parsed command
     */
    async function executeBasicCommand(parseResult) {
        if (!window.YooThemeAutomation) {
            addMessage('error', 'Automation engine not ready');
            return false;
        }

        if (parseResult.action === 'add') {
            if (typeof window.YooThemeAutomation.addElementAndSetText === 'function') {
                await window.YooThemeAutomation.addElementAndSetText(parseResult.elementType, parseResult.text);

                if (parseResult.text) {
                    addMessage('agent', `✅ Added ${parseResult.elementType}: "${parseResult.text}"`);
                } else {
                    addMessage('agent', `✅ Added ${parseResult.elementType}`);
                }
                return true;
            }
        }
        return false;
    }

    /**
     * Sleep utility
     */
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function handleSubmit() {
        const prompt = elements.inputField.value.trim();
        if (!prompt || state.isProcessing) return;

        addMessage('user', prompt);
        elements.inputField.value = '';
        state.isProcessing = true;

        try {
            addMessage('agent', '🤖 Processing command...');

            // Debug: Check what's available
            console.log('[AI Builder] Checking system availability:', {
                hasAIIntegration: !!window.AIBuilderIntegration,
                hasYooThemeAutomation: !!window.YooThemeAutomation,
                hasDOMIntelligence: !!window.DOMIntelligence,
                hasTaskPlanner: !!window.AITaskPlanner,
                hasStylingEngine: !!window.AdvancedStylingEngine
            });

            // PRIORITY 1: Try AI Builder Integration (v4.0 - Full Intelligence)
            if (window.AIBuilderIntegration && typeof window.AIBuilderIntegration.processCommand === 'function') {
                console.log('[AI Builder] 🧠 Using AI Builder Integration (v4.0)');

                const result = await window.AIBuilderIntegration.processCommand(
                    prompt,
                    (progress) => {
                        // Progress callback
                        if (progress.phase === 'planning') {
                            addMessage('agent', `📋 ${progress.message}`);
                        } else if (progress.phase === 'executing') {
                            addMessage('agent', `⚡ ${progress.message}`);
                        }
                    }
                );

                if (result.success) {
                    addMessage('agent', result.message);
                    state.isProcessing = false;
                    return;
                } else {
                    console.log('[AI Builder] Integration deferred:', result.message);
                    // Fall through to next layer
                }
            }

            // PRIORITY 2: Try DOM Intelligence (for edit/change operations)
            if (window.DOMIntelligence && typeof window.DOMIntelligence.processCommand === 'function') {
                console.log('[AI Builder] Using DOM Intelligence for natural language processing');

                const result = await window.DOMIntelligence.processCommand(prompt);

                if (result.success) {
                    addMessage('agent', `✅ ${result.message}`);
                    state.isProcessing = false;
                    return;
                } else {
                    // DOM Intelligence couldn't handle it (probably an ADD action)
                    console.log('[AI Builder] DOM Intelligence deferred to basic parser:', result.message);
                    // Fall through to basic parser below
                }
            } else {
                console.log('[AI Builder] DOM Intelligence not available, using basic parser');
            }

            // FALLBACK: Use basic regex parser for simple ADD commands
            // First, try to break down complex multi-part commands
            const multiPartCommands = detectMultiPartCommand(prompt);

            if (multiPartCommands.length > 1) {
                addMessage('agent', `🔍 I detected ${multiPartCommands.length} separate actions. Let me handle them one by one...`);

                for (let i = 0; i < multiPartCommands.length; i++) {
                    const subCommand = multiPartCommands[i];
                    addMessage('agent', `📌 Action ${i + 1}: "${subCommand}"`);

                    const parseResult = parseNaturalLanguageCommand(subCommand);
                    if (parseResult.success) {
                        await executeBasicCommand(parseResult);
                        await sleep(1500); // Wait between actions
                    } else {
                        addMessage('agent', `⚠️ Skipping unclear action: "${subCommand}"`);
                    }
                }

                addMessage('agent', '✅ Completed all actions!');
                return;
            }

            const parseResult = parseNaturalLanguageCommand(prompt);

            if (!parseResult.success) {
                addMessage('error', '❌ Could not understand that command.');
                addMessage('agent', '💡 Try simpler commands like:');
                addMessage('agent', '• "add a headline that reads: Your Title"');
                addMessage('agent', '• "add a button that says: Click Me"');
                addMessage('agent', '• "add text: Your paragraph here"');
                addMessage('agent', '• "add a section" (for layout elements)');
                addMessage('agent', '• "add a navbar" (for navigation)');
                addMessage('agent', '• "change the headline to: New Text" (edit existing)');
                addMessage('agent', '• Or complex: "add a section and add a headline that says: Welcome"');
                console.log('[AI Builder] Failed to parse:', prompt);
                return;
            }

            console.log('[AI Builder] Parsed command:', parseResult);

            // Execute the automation based on action type
            if (!window.YooThemeAutomation) {
                addMessage('error', 'Automation engine not ready. Check console for details.');
                console.error('[AI Builder] window.YooThemeAutomation:', window.YooThemeAutomation);
                return;
            }

            if (parseResult.action === 'add') {
                // Add new element
                if (typeof window.YooThemeAutomation.addElementAndSetText === 'function') {
                    await window.YooThemeAutomation.addElementAndSetText(parseResult.elementType, parseResult.text);

                    if (parseResult.text) {
                        addMessage('agent', `✅ Added ${parseResult.elementType} with text: "${parseResult.text}"`);
                    } else {
                        addMessage('agent', `✅ Added ${parseResult.elementType}`);
                    }
                } else {
                    addMessage('error', 'Add element function not available');
                }
            } else if (parseResult.action === 'change') {
                // Change existing element - Let DOM Intelligence handle this
                addMessage('agent', '🔄 Attempting to change existing element...');

                if (window.DOMIntelligence && typeof window.DOMIntelligence.processCommand === 'function') {
                    const result = await window.DOMIntelligence.processCommand(prompt);

                    if (result.success) {
                        addMessage('agent', `✅ ${result.message}`);
                    } else {
                        addMessage('error', `❌ ${result.message}`);
                        addMessage('agent', '💡 Try being more specific, like: "change the headline that says [old text] to: [new text]"');
                    }
                } else {
                    addMessage('error', 'DOM Intelligence not available for edit operations');
                }
            } else {
                addMessage('error', `Unknown action: ${parseResult.action}`);
            }
        } catch (error) {
            addMessage('error', '❌ Error: ' + error.message);
            console.error('[AI Builder] Command error:', error);
        } finally {
            state.isProcessing = false;
        }
    }

    function addMessage(type, text) {
        if (!elements.messagesArea) return;
        const messageDiv = document.createElement('div');
        messageDiv.className = `ai-message ${type}`;
        messageDiv.textContent = text;
        elements.messagesArea.appendChild(messageDiv);
        elements.messagesArea.scrollTop = elements.messagesArea.scrollHeight;
    }

    function getCSRFToken() {
        if (typeof Joomla !== 'undefined' && Joomla.getOptions) {
            return Joomla.getOptions('csrf.token') || '';
        }
        return '';
    }

    console.log('[AI Builder] Safe version loaded - waiting for YOOtheme...');

})();
