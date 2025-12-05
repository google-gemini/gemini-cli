/**
 * YOOtheme AI Builder - Enhanced UI with Advanced LLM Integration
 *
 * This version integrates with the Advanced LLM system for Claude/Gemini-level
 * natural language understanding and instruction execution.
 *
 * @package     AI Builder
 * @version     5.0.0
 * @author      AI Builder Team
 */

(function() {
    'use strict';

    console.log('[AI Builder Enhanced UI] Loading v5.0.0...');

    // ============================================================================
    // WAIT FOR DEPENDENCIES
    // ============================================================================

    function waitForDependencies(callback, timeout = 15000) {
        const startTime = Date.now();

        const checkInterval = setInterval(() => {
            const hasAdvancedLLM = !!window.AdvancedLLMIntegration;
            const hasYooTheme = !!(window.$customizer || (window.parent && window.parent.$customizer));

            if (hasAdvancedLLM && hasYooTheme) {
                clearInterval(checkInterval);
                console.log('[AI Builder Enhanced UI] ✅ All dependencies loaded');
                callback();
            } else if (Date.now() - startTime > timeout) {
                clearInterval(checkInterval);
                console.warn('[AI Builder Enhanced UI] ⚠️ Timeout waiting for dependencies');
                console.log('Status:', { hasAdvancedLLM, hasYooTheme });

                // Try to initialize anyway with degraded functionality
                if (hasYooTheme) {
                    console.warn('Initializing without Advanced LLM - limited functionality');
                    callback();
                }
            }
        }, 200);
    }

    // ============================================================================
    // CONFIGURATION
    // ============================================================================

    const CONFIG = {
        uiPosition: 'bottom-right',
        theme: 'dark',
        showTimestamps: true,
        enableKeyboardShortcuts: true,
        enableVoiceInput: true,
        showConfidence: true,
        showAssumptions: true,
        autoSave: true
    };

    // ============================================================================
    // STATE MANAGEMENT
    // ============================================================================

    const state = {
        isProcessing: false,
        isListening: false,
        recognition: null,
        styleId: null,
        llmIntegration: null,
        currentProgress: null
    };

    // ============================================================================
    // UI CREATION
    // ============================================================================

    function createUI() {
        console.log('[AI Builder Enhanced UI] Creating interface...');

        const container = document.createElement('div');
        container.id = 'ai-builder-enhanced';
        container.className = `ai-builder-enhanced ${CONFIG.theme}`;
        container.style.cssText = `
            position: fixed;
            ${CONFIG.uiPosition === 'bottom-right' ? 'bottom: 20px; right: 20px;' : ''}
            ${CONFIG.uiPosition === 'bottom-left' ? 'bottom: 20px; left: 20px;' : ''}
            ${CONFIG.uiPosition === 'top-right' ? 'top: 20px; right: 20px;' : ''}
            ${CONFIG.uiPosition === 'top-left' ? 'top: 20px; left: 20px;' : ''}
            z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        `;

        container.innerHTML = `
            <style>
                .ai-builder-enhanced {
                    --primary-color: #6366f1;
                    --success-color: #10b981;
                    --error-color: #ef4444;
                    --warning-color: #f59e0b;
                    --bg-color: #1f2937;
                    --text-color: #f9fafb;
                    --border-color: #374151;
                    --hover-color: #4b5563;
                }

                .ai-builder-enhanced.light {
                    --bg-color: #ffffff;
                    --text-color: #1f2937;
                    --border-color: #e5e7eb;
                    --hover-color: #f3f4f6;
                }

                .ai-builder-container {
                    background: var(--bg-color);
                    border: 2px solid var(--border-color);
                    border-radius: 16px;
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);
                    width: 420px;
                    max-width: 90vw;
                    overflow: hidden;
                }

                .ai-builder-header {
                    background: linear-gradient(135deg, var(--primary-color), #8b5cf6);
                    padding: 16px 20px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }

                .ai-builder-title {
                    color: white;
                    font-size: 18px;
                    font-weight: 600;
                    margin: 0;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .ai-builder-status {
                    background: rgba(255, 255, 255, 0.2);
                    padding: 4px 12px;
                    border-radius: 12px;
                    font-size: 12px;
                    color: white;
                    font-weight: 500;
                }

                .ai-builder-status.ready {
                    background: var(--success-color);
                }

                .ai-builder-status.processing {
                    background: var(--warning-color);
                    animation: pulse 2s infinite;
                }

                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.7; }
                }

                .ai-builder-body {
                    padding: 20px;
                }

                .ai-builder-input-group {
                    display: flex;
                    gap: 8px;
                    margin-bottom: 16px;
                }

                .ai-builder-input {
                    flex: 1;
                    padding: 12px 16px;
                    border: 2px solid var(--border-color);
                    border-radius: 12px;
                    background: var(--bg-color);
                    color: var(--text-color);
                    font-size: 14px;
                    outline: none;
                    transition: all 0.2s;
                }

                .ai-builder-input:focus {
                    border-color: var(--primary-color);
                    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
                }

                .ai-builder-btn {
                    padding: 12px 20px;
                    border: none;
                    border-radius: 12px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    outline: none;
                }

                .ai-builder-btn-primary {
                    background: var(--primary-color);
                    color: white;
                }

                .ai-builder-btn-primary:hover {
                    background: #4f46e5;
                    transform: translateY(-1px);
                }

                .ai-builder-btn-icon {
                    padding: 12px;
                    background: var(--hover-color);
                    color: var(--text-color);
                }

                .ai-builder-btn-icon:hover {
                    background: var(--primary-color);
                    color: white;
                }

                .ai-builder-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .ai-builder-progress {
                    margin-bottom: 16px;
                    padding: 12px;
                    background: var(--hover-color);
                    border-radius: 12px;
                    display: none;
                }

                .ai-builder-progress.visible {
                    display: block;
                }

                .ai-builder-progress-text {
                    color: var(--text-color);
                    font-size: 13px;
                    margin-bottom: 8px;
                }

                .ai-builder-progress-bar {
                    height: 4px;
                    background: var(--border-color);
                    border-radius: 2px;
                    overflow: hidden;
                }

                .ai-builder-progress-fill {
                    height: 100%;
                    background: var(--primary-color);
                    transition: width 0.3s;
                    border-radius: 2px;
                }

                .ai-builder-message {
                    padding: 12px 16px;
                    border-radius: 12px;
                    margin-bottom: 12px;
                    font-size: 13px;
                    line-height: 1.5;
                }

                .ai-builder-message.success {
                    background: rgba(16, 185, 129, 0.1);
                    border: 1px solid var(--success-color);
                    color: var(--success-color);
                }

                .ai-builder-message.error {
                    background: rgba(239, 68, 68, 0.1);
                    border: 1px solid var(--error-color);
                    color: var(--error-color);
                }

                .ai-builder-message.info {
                    background: rgba(99, 102, 241, 0.1);
                    border: 1px solid var(--primary-color);
                    color: var(--primary-color);
                }

                .ai-builder-conversation {
                    max-height: 300px;
                    overflow-y: auto;
                    margin-bottom: 16px;
                    padding: 12px;
                    background: var(--hover-color);
                    border-radius: 12px;
                    display: none;
                }

                .ai-builder-conversation.visible {
                    display: block;
                }

                .ai-builder-message-item {
                    padding: 8px 12px;
                    margin-bottom: 8px;
                    border-radius: 8px;
                    font-size: 13px;
                }

                .ai-builder-message-item.user {
                    background: var(--primary-color);
                    color: white;
                    margin-left: 40px;
                }

                .ai-builder-message-item.assistant {
                    background: var(--border-color);
                    color: var(--text-color);
                    margin-right: 40px;
                }

                .ai-builder-quick-actions {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    margin-bottom: 16px;
                }

                .ai-builder-quick-action {
                    padding: 8px 12px;
                    background: var(--hover-color);
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    font-size: 12px;
                    cursor: pointer;
                    transition: all 0.2s;
                    color: var(--text-color);
                }

                .ai-builder-quick-action:hover {
                    background: var(--primary-color);
                    color: white;
                    border-color: var(--primary-color);
                }

                .ai-builder-footer {
                    padding: 12px 20px;
                    border-top: 1px solid var(--border-color);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .ai-builder-footer-text {
                    font-size: 11px;
                    color: var(--text-color);
                    opacity: 0.6;
                }

                .ai-builder-footer-actions {
                    display: flex;
                    gap: 8px;
                }

                .ai-builder-confidence {
                    display: inline-block;
                    padding: 2px 8px;
                    background: var(--hover-color);
                    border-radius: 6px;
                    font-size: 11px;
                    font-weight: 600;
                    margin-left: 8px;
                }

                .ai-builder-assumptions {
                    font-size: 12px;
                    color: var(--warning-color);
                    margin-top: 4px;
                }
            </style>

            <div class="ai-builder-container">
                <div class="ai-builder-header">
                    <h3 class="ai-builder-title">
                        🤖 AI Builder
                        <span class="ai-builder-status ready">Ready</span>
                    </h3>
                </div>

                <div class="ai-builder-body">
                    <div id="ai-builder-progress" class="ai-builder-progress">
                        <div class="ai-builder-progress-text">Processing...</div>
                        <div class="ai-builder-progress-bar">
                            <div class="ai-builder-progress-fill" style="width: 0%"></div>
                        </div>
                    </div>

                    <div id="ai-builder-messages"></div>

                    <div id="ai-builder-conversation" class="ai-builder-conversation"></div>

                    <div class="ai-builder-quick-actions">
                        <button class="ai-builder-quick-action" data-action="hero">
                            Create Hero Section
                        </button>
                        <button class="ai-builder-quick-action" data-action="features">
                            Add Features Grid
                        </button>
                        <button class="ai-builder-quick-action" data-action="pricing">
                            Pricing Table
                        </button>
                        <button class="ai-builder-quick-action" data-action="cta">
                            Call to Action
                        </button>
                        <button class="ai-builder-quick-action" data-action="undo">
                            ↶ Undo
                        </button>
                        <button class="ai-builder-quick-action" data-action="help">
                            ? Help
                        </button>
                    </div>

                    <div class="ai-builder-input-group">
                        <input
                            type="text"
                            id="ai-builder-input"
                            class="ai-builder-input"
                            placeholder="Tell me what you want to build..."
                            autocomplete="off"
                        />
                        <button id="ai-builder-voice-btn" class="ai-builder-btn ai-builder-btn-icon" title="Voice Input">
                            🎤
                        </button>
                        <button id="ai-builder-send-btn" class="ai-builder-btn ai-builder-btn-primary">
                            Send
                        </button>
                    </div>
                </div>

                <div class="ai-builder-footer">
                    <div class="ai-builder-footer-text">
                        Powered by Advanced LLM
                    </div>
                    <div class="ai-builder-footer-actions">
                        <button id="ai-builder-inspect-btn" class="ai-builder-btn ai-builder-btn-icon" title="Inspect Element (Click to select)" style="padding: 6px 12px; font-size: 12px;">
                            🔍
                        </button>
                        <button id="ai-builder-clear-btn" class="ai-builder-btn ai-builder-btn-icon" title="Clear History" style="padding: 6px 12px; font-size: 12px;">
                            Clear
                        </button>
                        <button id="ai-builder-minimize-btn" class="ai-builder-btn ai-builder-btn-icon" title="Minimize" style="padding: 6px 12px; font-size: 12px;">
                            −
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(container);
        return container;
    }

    // ============================================================================
    // EVENT HANDLERS
    // ============================================================================

    function attachEventHandlers() {
        const input = document.getElementById('ai-builder-input');
        const sendBtn = document.getElementById('ai-builder-send-btn');
        const voiceBtn = document.getElementById('ai-builder-voice-btn');
        const clearBtn = document.getElementById('ai-builder-clear-btn');
        const minimizeBtn = document.getElementById('ai-builder-minimize-btn');

        // Send button
        sendBtn.addEventListener('click', handleSend);

        // Enter key
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !state.isProcessing) {
                handleSend();
            }
        });

        // Voice input
        if (CONFIG.enableVoiceInput && 'webkitSpeechRecognition' in window) {
            voiceBtn.addEventListener('click', toggleVoiceInput);
        } else {
            voiceBtn.style.display = 'none';
        }

        // Quick actions
        document.querySelectorAll('.ai-builder-quick-action').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                handleQuickAction(action);
            });
        });

        // Clear button
        clearBtn.addEventListener('click', () => {
            if (confirm('Clear conversation history?')) {
                clearConversation();
            }
        });

        // Minimize button
        minimizeBtn.addEventListener('click', toggleMinimize);

        // Inspect button
        const inspectBtn = document.getElementById('ai-builder-inspect-btn');
        if (inspectBtn) {
            inspectBtn.addEventListener('click', toggleInspectMode);
        }
    }

    // ============================================================================
    // COMMAND PROCESSING
    // ============================================================================

    async function handleSend() {
        const input = document.getElementById('ai-builder-input');
        const command = input.value.trim();

        if (!command || state.isProcessing) {
            return;
        }

        input.value = '';
        setProcessingState(true);

        try {
            // Add user message to conversation
            addMessageToConversation('user', command);

            // Update UI
            updateStatus('processing', 'Processing...');
            showProgress('Understanding your command...', 10);

            // Process using Advanced LLM Integration
            const result = await state.llmIntegration.processCommand(command, (progress) => {
                handleProgress(progress);
            });

            // Show result
            if (result.success) {
                showMessage('success', result.message);
                if (result.confidence && CONFIG.showConfidence) {
                    showConfidence(result.confidence);
                }
                addMessageToConversation('assistant', result.message);
            } else if (result.needsClarification) {
                showClarificationRequest(result);
            } else {
                showMessage('error', result.message);
                if (result.suggestions && result.suggestions.length > 0) {
                    showSuggestions(result.suggestions);
                }
            }

        } catch (error) {
            console.error('[AI Builder Enhanced UI] Error:', error);
            showMessage('error', `Error: ${error.message}`);
        } finally {
            setProcessingState(false);
            hideProgress();
            updateStatus('ready', 'Ready');
        }
    }

    function handleQuickAction(action) {
        const commands = {
            'hero': 'create a hero section with headline, description, and call to action button',
            'features': 'add a features section with 3 cards',
            'pricing': 'create a pricing table with 3 tiers',
            'cta': 'add a call to action section',
            'undo': 'undo',
            'help': 'help'
        };

        const command = commands[action];
        if (command) {
            document.getElementById('ai-builder-input').value = command;
            handleSend();
        }
    }

    function handleProgress(progress) {
        console.log('[AI Builder Enhanced UI] Progress:', progress);

        if (progress.phase === 'understanding') {
            showProgress(progress.message, 30);
        } else if (progress.phase === 'assumptions') {
            if (CONFIG.showAssumptions) {
                showMessage('info', progress.message);
            }
        } else if (progress.phase === 'executing') {
            showProgress(progress.message, progress.percentage || 50);
        }
    }

    // ============================================================================
    // UI UPDATES
    // ============================================================================

    function showMessage(type, message) {
        const container = document.getElementById('ai-builder-messages');
        const messageEl = document.createElement('div');
        messageEl.className = `ai-builder-message ${type}`;
        messageEl.textContent = message;
        container.appendChild(messageEl);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            messageEl.remove();
        }, 5000);
    }

    function showProgress(text, percentage) {
        const progress = document.getElementById('ai-builder-progress');
        progress.classList.add('visible');
        progress.querySelector('.ai-builder-progress-text').textContent = text;
        progress.querySelector('.ai-builder-progress-fill').style.width = `${percentage}%`;
    }

    function hideProgress() {
        const progress = document.getElementById('ai-builder-progress');
        progress.classList.remove('visible');
    }

    function updateStatus(type, text) {
        const status = document.querySelector('.ai-builder-status');
        status.className = `ai-builder-status ${type}`;
        status.textContent = text;
    }

    function setProcessingState(processing) {
        state.isProcessing = processing;
        document.getElementById('ai-builder-send-btn').disabled = processing;
        document.getElementById('ai-builder-input').disabled = processing;
    }

    function addMessageToConversation(role, message) {
        const container = document.getElementById('ai-builder-conversation');
        container.classList.add('visible');

        const messageEl = document.createElement('div');
        messageEl.className = `ai-builder-message-item ${role}`;
        messageEl.textContent = message;
        container.appendChild(messageEl);

        // Scroll to bottom
        container.scrollTop = container.scrollHeight;
    }

    function clearConversation() {
        document.getElementById('ai-builder-conversation').innerHTML = '';
        document.getElementById('ai-builder-messages').innerHTML = '';
        if (state.llmIntegration) {
            state.llmIntegration.clearHistory();
        }
        showMessage('info', 'Conversation cleared');
    }

    function showConfidence(confidence) {
        const messages = document.getElementById('ai-builder-messages');
        const lastMessage = messages.lastChild;
        if (lastMessage) {
            const confidenceSpan = document.createElement('span');
            confidenceSpan.className = 'ai-builder-confidence';
            confidenceSpan.textContent = `${confidence}% confident`;
            lastMessage.appendChild(confidenceSpan);
        }
    }

    function showClarificationRequest(result) {
        showMessage('info', result.questions.join(' '));
        result.alternatives.forEach(alt => {
            const btn = document.createElement('button');
            btn.className = 'ai-builder-quick-action';
            btn.textContent = alt;
            btn.addEventListener('click', () => {
                document.getElementById('ai-builder-input').value = alt;
                handleSend();
            });
            document.querySelector('.ai-builder-quick-actions').appendChild(btn);
        });
    }

    function showSuggestions(suggestions) {
        suggestions.forEach(suggestion => {
            showMessage('info', `💡 ${suggestion}`);
        });
    }

    function toggleMinimize() {
        const container = document.querySelector('.ai-builder-container');
        const body = container.querySelector('.ai-builder-body');
        const footer = container.querySelector('.ai-builder-footer');
        const btn = document.getElementById('ai-builder-minimize-btn');

        if (body.style.display === 'none') {
            body.style.display = 'block';
            footer.style.display = 'flex';
            btn.textContent = '−';
        } else {
            body.style.display = 'none';
            footer.style.display = 'none';
            btn.textContent = '+';
        }
    }

    // ============================================================================
    // VOICE INPUT WITH WAKE WORD DETECTION
    // ============================================================================

    const WAKE_WORDS = ['ai builder', 'hey ai', 'ai', 'builder', 'listen up', 'wake up'];
    let wakeWordRecognition = null;
    let commandRecognition = null;
    let isWakeWordMode = true;

    function toggleVoiceInput() {
        if (state.isListening) {
            stopVoiceInput();
        } else {
            startWakeWordListening();
        }
    }

    function startWakeWordListening() {
        if (!('webkitSpeechRecognition' in window)) {
            showMessage('error', 'Voice input not supported in this browser');
            return;
        }

        // Stop any existing recognition
        stopVoiceInput();

        wakeWordRecognition = new webkitSpeechRecognition();
        wakeWordRecognition.continuous = true;
        wakeWordRecognition.interimResults = true;
        wakeWordRecognition.lang = 'en-US';

        wakeWordRecognition.onstart = () => {
            state.isListening = true;
            isWakeWordMode = true;
            document.getElementById('ai-builder-voice-btn').textContent = '👂';
            showMessage('info', 'Listening for wake words: "AI Builder", "Hey AI", "Listen up"...');
        };

        wakeWordRecognition.onresult = (event) => {
            const results = Array.from(event.results);
            const lastResult = results[results.length - 1];

            if (lastResult.isFinal) {
                const transcript = lastResult[0].transcript.toLowerCase().trim();
                console.log('[Voice] Wake word mode transcript:', transcript);

                // Check for wake words
                const wakeWordDetected = WAKE_WORDS.some(word =>
                    transcript.includes(word) ||
                    transcript.split(' ').some(part => word.includes(part) || part.includes(word))
                );

                if (wakeWordDetected) {
                    console.log('[Voice] Wake word detected!');
                    showMessage('success', '🎤 Wake word detected! Listening for command...');

                    // Switch to command mode
                    switchToCommandMode();
                }
            }
        };

        wakeWordRecognition.onerror = (event) => {
            console.error('Wake word recognition error:', event.error);
            if (event.error !== 'not-allowed') {
                showMessage('error', `Voice input error: ${event.error}`);
            }
            stopVoiceInput();
        };

        wakeWordRecognition.onend = () => {
            // Restart wake word listening if we're still in wake word mode
            if (isWakeWordMode && state.isListening) {
                setTimeout(() => {
                    if (state.isListening && isWakeWordMode) {
                        startWakeWordListening();
                    }
                }, 1000);
            } else {
                stopVoiceInput();
            }
        };

        try {
            wakeWordRecognition.start();
        } catch (error) {
            console.error('Failed to start wake word recognition:', error);
            showMessage('error', 'Failed to start voice input');
        }
    }

    function switchToCommandMode() {
        // Stop wake word recognition
        if (wakeWordRecognition) {
            wakeWordRecognition.stop();
            wakeWordRecognition = null;
        }

        isWakeWordMode = false;

        // Start command recognition
        commandRecognition = new webkitSpeechRecognition();
        commandRecognition.continuous = false;
        commandRecognition.interimResults = false;
        commandRecognition.lang = 'en-US';

        commandRecognition.onstart = () => {
            document.getElementById('ai-builder-voice-btn').textContent = '🔴';
            showMessage('info', 'Listening for command...');
        };

        commandRecognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript.trim();
            console.log('[Voice] Command transcript:', transcript);

            // Put the transcript in the input and send it
            document.getElementById('ai-builder-input').value = transcript;
            handleSend();

            // Go back to wake word mode after command
            setTimeout(() => {
                if (state.isListening) {
                    startWakeWordListening();
                }
            }, 2000);
        };

        commandRecognition.onerror = (event) => {
            console.error('Command recognition error:', event.error);
            showMessage('error', `Command recognition error: ${event.error}`);
            // Go back to wake word mode
            startWakeWordListening();
        };

        commandRecognition.onend = () => {
            // This will trigger the restart to wake word mode
        };

        try {
            commandRecognition.start();
        } catch (error) {
            console.error('Failed to start command recognition:', error);
            startWakeWordListening();
        }
    }

    function stopVoiceInput() {
        // Stop wake word recognition
        if (wakeWordRecognition) {
            wakeWordRecognition.stop();
            wakeWordRecognition = null;
        }

        // Stop command recognition
        if (commandRecognition) {
            commandRecognition.stop();
            commandRecognition = null;
        }

        state.isListening = false;
        isWakeWordMode = true;
        document.getElementById('ai-builder-voice-btn').textContent = '🎤';
    }

    // ============================================================================
    // INITIALIZATION
    // ============================================================================

    function init() {
        console.log('[AI Builder Enhanced UI] Initializing...');

        // Get LLM integration
        state.llmIntegration = window.AdvancedLLMIntegration;

        if (!state.llmIntegration) {
            console.error('[AI Builder Enhanced UI] Advanced LLM Integration not available');
            alert('AI Builder: Advanced LLM Integration not loaded. Please check console for errors.');
            return;
        }

        // Create UI
        createUI();
        attachEventHandlers();

        // Get style ID
        getStyleId().then(styleId => {
            state.styleId = styleId;
            console.log('[AI Builder Enhanced UI] Using style ID:', styleId);
        }).catch(error => {
            console.error('[AI Builder Enhanced UI] Failed to get style ID:', error);
        });

        console.log('[AI Builder Enhanced UI] ✅ Initialization complete');
        showMessage('success', '🎉 AI Builder ready! Try: "create a hero section"');
    }

    async function getStyleId() {
        try {
            const response = await fetch(CONFIG.ajaxEndpoint + '&task=getDefaultStyleId');
            const data = await response.json();
            if (data.success) {
                return data.data.styleId;
            }
            throw new Error(data.message || 'Failed to get style ID');
        } catch (error) {
            console.error('Error getting style ID:', error);
            return null;
        }
    }

    // ============================================================================
    // INSPECT MODE
    // ============================================================================

    let inspectModeActive = false;
    let inspectListener = null;
    let highlightOverlay = null;

    function toggleInspectMode() {
        inspectModeActive = !inspectModeActive;
        const inspectBtn = document.getElementById('ai-builder-inspect-btn');

        if (inspectModeActive) {
            // Enable inspect mode
            document.body.style.cursor = 'crosshair';
            if (inspectBtn) {
                inspectBtn.style.background = '#10b981';
                inspectBtn.style.color = 'white';
            }

            updateStatus('info', '🔍 Inspect Mode: Click any element to select it');

            inspectListener = (e) => {
                // Don't intercept clicks on AI Builder panel
                if (e.target.closest('#ai-builder-panel')) {
                    return;
                }

                e.preventDefault();
                e.stopPropagation();

                const element = e.target;
                highlightElement(element);

                // Get selector info
                const tagName = element.tagName.toLowerCase();
                const id = element.id ? `#${element.id}` : '';
                const classes = element.className ? `.${element.className.split(' ').join('.')}` : '';
                const selector = `${tagName}${id}${classes}`;

                addMessageToConversation('system', `Selected: <code>${selector}</code>`);

                // Exit inspect mode
                toggleInspectMode();
            };

            document.addEventListener('click', inspectListener, true);
        } else {
            // Disable inspect mode
            document.body.style.cursor = '';
            if (inspectBtn) {
                inspectBtn.style.background = '';
                inspectBtn.style.color = '';
            }

            if (inspectListener) {
                document.removeEventListener('click', inspectListener, true);
                inspectListener = null;
            }

            if (highlightOverlay) {
                highlightOverlay.remove();
                highlightOverlay = null;
            }

            updateStatus('ready', 'Ready');
        }
    }

    function highlightElement(element) {
        // Remove previous highlight
        if (highlightOverlay) {
            highlightOverlay.remove();
        }

        const rect = element.getBoundingClientRect();

        highlightOverlay = document.createElement('div');
        highlightOverlay.style.cssText = `
            position: fixed;
            top: ${rect.top}px;
            left: ${rect.left}px;
            width: ${rect.width}px;
            height: ${rect.height}px;
            border: 2px solid #10b981;
            background: rgba(16, 185, 129, 0.1);
            pointer-events: none;
            z-index: 999999;
            transition: all 0.2s ease;
        `;

        document.body.appendChild(highlightOverlay);

        // Auto-remove after 2 seconds
        setTimeout(() => {
            if (highlightOverlay) {
                highlightOverlay.remove();
                highlightOverlay = null;
            }
        }, 2000);
    }

    // ============================================================================
    // INITIALIZATION
    // ============================================================================

    // Start initialization when dependencies are ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                waitForDependencies(init);
            }, 1000);
        });
    } else {
        setTimeout(() => {
            waitForDependencies(init);
        }, 1000);
    }

})();
