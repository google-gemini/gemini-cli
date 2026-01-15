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
            }, 2000); // Extra delay to let YOOtheme fully initialize
        });
    } else {
        setTimeout(() => {
            waitForYooTheme(initSafely);
        }, 2000);
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

            setTimeout(() => {
                const iframe = document.querySelector('iframe[name^="preview-"]');
                if (iframe && iframe.contentWindow) {
                    window.DOMIntelligence = iframe.contentWindow.DOMIntelligence;
                    window.YooThemeAutomation = iframe.contentWindow.YooThemeAutomation;
                    window.PageAwareness = iframe.contentWindow.PageAwareness;
                    window.YooThemeElements = iframe.contentWindow.YooThemeElements;

                    if (window.DOMIntelligence && typeof window.DOMIntelligence.processCommand === 'function') {
                        console.log('✅ DOM Intelligence verified (via iframe)');
                        addMessage('agent', '✅ AI Builder ready!');
                    }
                }
            }, 500);
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
                width: 400px;
                max-width: calc(100vw - 40px);
                background: #ffffff;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
                z-index: 99999;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                border: 1px solid #e0e0e0;
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
                height: 350px;
                overflow-y: auto;
                padding: 16px;
                background: #fafafa;
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
    // SIMPLIFIED HANDLERS
    // ============================================================================

    async function handleSubmit() {
        const prompt = elements.inputField.value.trim();
        if (!prompt || state.isProcessing) return;

        addMessage('user', prompt);
        elements.inputField.value = '';
        state.isProcessing = true;

        try {
            addMessage('agent', '🤖 Processing command...');

            // Simple test - just try to add a headline
            if (window.YooThemeAutomation) {
                await window.YooThemeAutomation.addElementAndSetText('headline', prompt);
                addMessage('agent', '✅ Added via UI automation!');
            } else {
                addMessage('error', 'Automation engine not ready');
            }
        } catch (error) {
            addMessage('error', '❌ Error: ' + error.message);
            console.error(error);
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
