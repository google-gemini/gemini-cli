/**
 * Unified Command Center - One Interface to Rule Them All
 *
 * Combines:
 * - Direct YOOtheme API Integration
 * - Action Recorder & Skill Manager
 * - API Tracer & Mocker
 * - AI Builder automation (Fallback)
 * - Simple, clear commands
 *
 * @version 8.0.0
 */

(function () {
    'use strict';

    console.log('%c[Command Center] 🎯 Loading Unified Interface...',
        'background: #10b981; color: white; padding: 8px 16px; border-radius: 4px; font-weight: bold;');

    const CONFIG = {
        DEBUG: true,
        SCRIPT_PATHS: {
            // Foundational
            api: '/media/plg_system_ai_builder/js/yootheme-api-integration.js',
            cleo: '/media/plg_system_ai_builder/js/cleo.js',
            automation: '/media/plg_system_ai_builder/js/yootheme-automation.js',
            dom: '/media/plg_system_ai_builder/js/dom-intelligence-enhanced.js',
            introspection: '/media/plg_system_ai_builder/js/system-introspection.js',

            // Core AI Builder systems
            builder_integration: '/media/plg_system_ai_builder/js/ai-builder-integration.js',
            planner: '/media/plg_system_ai_builder/js/ai-task-planner.js',

            // Integration & Enhancement Layer
            cleo_integration: '/media/plg_system_ai_builder/js/cleo-integration.js',
            planner_enhanced: '/media/plg_system_ai_builder/js/ai-task-planner-enhanced.js',

            // Tooling
            recorder: '/media/plg_system_ai_builder/js/action-recorder.js',
            skills: '/media/plg_system_ai_builder/js/skill-manager.js',
            tracer: '/media/plg_system_ai_builder/js/api-tracer.js',
        }
    };

    class UnifiedCommandCenter {
        constructor() {
            this.systems = {
                yoothemeApi: null,
                actionRecorder: null,
                skillManager: null,
                apiTracer: null,
                yoothemeAutomation: null,
                domIntelligence: null,
                taskPlanner: null,
                introspection: null,
                cleo: null,
                cleoIntegration: null,
            };
            this.init();
        }

        async init() {
            console.log('[Command Center] Initializing...');
            await this.loadAdditionalSystems();
            await this.waitForSystems();
            this.createUI();
            window.CommandCenter = this;
            console.log('%c[Command Center] ✅ Ready! All systems operational.',
                'background: #10b981; color: white; padding: 8px 16px; border-radius: 4px; font-weight: bold;');
        }

        async loadAdditionalSystems() {
            for (const path of Object.values(CONFIG.SCRIPT_PATHS)) {
                await new Promise(resolve => {
                    if (document.querySelector(`script[src="${path}"]`)) return resolve();
                    console.log(`[Command Center] Loading script: ${path}...`);
                    const script = document.createElement('script');
                    script.src = path;
                    script.async = true;
                    script.onload = resolve;
                    script.onerror = () => { console.error(`[Command Center] ❌ Failed to load script: ${path}.`); resolve(); };
                    document.head.appendChild(script);
                });
            }
        }

        async waitForSystems(timeout = 15000) {
            console.log('[Command Center] Waiting for all advanced systems to come online...');
            const startTime = Date.now();
            return new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    // Poll for all necessary objects
                    this.systems.yoothemeApi = window.YooThemeAPI;
                    this.systems.actionRecorder = window.ActionRecorder;
                    this.systems.skillManager = window.SkillManager;
                    this.systems.apiTracer = window.APITracer;
                    this.systems.yoothemeAutomation = window.YooThemeAutomation;
                    this.systems.domIntelligence = window.DOMIntelligence;
                    this.systems.taskPlanner = window.AITaskPlanner;
                    this.systems.introspection = window.SystemIntrospection;
                    this.systems.cleo = window.ChameleonAI;
                    this.systems.cleoIntegration = window.CleoAIIntegration;

                    const allLoaded = this.systems.yoothemeApi &&
                        this.systems.actionRecorder &&
                        this.systems.skillManager &&
                        this.systems.apiTracer &&
                        this.systems.yoothemeAutomation &&
                        this.systems.domIntelligence &&
                        this.systems.taskPlanner &&
                        this.systems.introspection &&
                        this.systems.cleo &&
                        this.systems.cleoIntegration;

                    if (allLoaded || (Date.now() - startTime > timeout)) {
                        clearInterval(checkInterval);
                        if (!allLoaded) {
                            console.warn('[Command Center] ⚠️ Not all systems loaded within timeout.');
                        }
                        console.log('[Command Center] System status:', {
                            yoothemeApi: !!this.systems.yoothemeApi,
                            actionRecorder: !!this.systems.actionRecorder,
                            skillManager: !!this.systems.skillManager,
                            apiTracer: !!this.systems.apiTracer,
                            yoothemeAutomation: !!this.systems.yoothemeAutomation,
                            domIntelligence: !!this.systems.domIntelligence,
                            taskPlanner: !!this.systems.taskPlanner,
                            introspection: !!this.systems.introspection,
                            cleo: !!this.systems.cleo,
                            cleoIntegration: !!this.systems.cleoIntegration,
                        });
                        resolve();
                    }
                }, 300);
            });
        }

        createUI() {
            if (document.getElementById('unified-command-center')) return;

            const container = document.createElement('div');
            container.id = 'unified-command-center';
            container.innerHTML = `
                <style>
                    #unified-command-center {
                        position: fixed;
                        bottom: 20px;
                        right: 20px;
                        width: 350px;
                        background: rgba(15, 23, 42, 0.95);
                        backdrop-filter: blur(10px);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        border-radius: 12px;
                        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
                        z-index: 9999;
                        font-family: 'Inter', system-ui, sans-serif;
                        color: #e2e8f0;
                        overflow: hidden;
                        transition: all 0.3s ease;
                    }
                    #unified-command-center.minimized {
                        width: 40px;
                        height: 40px;
                        border-radius: 50%;
                        cursor: pointer;
                    }
                    .ucc-header {
                        padding: 12px 16px;
                        background: rgba(255, 255, 255, 0.05);
                        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        cursor: grab;
                    }
                    .ucc-title {
                        font-weight: 600;
                        font-size: 14px;
                        color: #38bdf8;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }
                    .ucc-controls {
                        display: flex;
                        gap: 8px;
                    }
                    .ucc-btn {
                        background: none;
                        border: none;
                        color: #94a3b8;
                        cursor: pointer;
                        padding: 4px;
                        border-radius: 4px;
                        transition: all 0.2s;
                    }
                    .ucc-btn:hover {
                        color: white;
                        background: rgba(255, 255, 255, 0.1);
                    }
                    .ucc-btn.recording { color: #ef4444; animation: pulse 1.5s infinite; }
                    .ucc-btn.tracing { color: #10b981; }
                    .ucc-body {
                        padding: 16px;
                    }
                    .ucc-output {
                        min-height: 60px;
                        max-height: 200px;
                        overflow-y: auto;
                        margin-bottom: 12px;
                        font-size: 13px;
                        line-height: 1.5;
                        color: #94a3b8;
                    }
                    .ucc-output strong { color: #e2e8f0; }
                    .ucc-input-group {
                        display: flex;
                        gap: 8px;
                        background: rgba(0, 0, 0, 0.2);
                        padding: 4px;
                        border-radius: 8px;
                        border: 1px solid rgba(255, 255, 255, 0.1);
                    }
                    .ucc-input {
                        flex: 1;
                        background: none;
                        border: none;
                        color: white;
                        padding: 8px;
                        font-size: 14px;
                        outline: none;
                    }
                    .ucc-send {
                        background: #38bdf8;
                        color: #0f172a;
                        border: none;
                        padding: 0 12px;
                        border-radius: 6px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: background 0.2s;
                    }
                    .ucc-send:hover { background: #0ea5e9; }
                    @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }

                    /* Status Colors */
                    .ucc-msg-success { color: #4ade80; }
                    .ucc-msg-error { color: #f87171; }
                    .ucc-msg-info { color: #60a5fa; }
                    .ucc-msg-feedback { color: #fbbf24; font-style: italic; }
                </style>
                <div class="ucc-header">
                    <div class="ucc-title">⚡ Command Center</div>
                    <div class="ucc-controls">
                        <button class="ucc-btn" id="command-center-record-btn" title="Record Actions">●</button>
                        <button class="ucc-btn" id="command-center-trace-btn" title="Trace API">📡</button>
                        <button class="ucc-btn" id="command-center-min-btn" title="Minimize">_</button>
                    </div>
                </div>
                <div class="ucc-body">
                    <div class="ucc-output" id="ucc-output">
                        Welcome to Unified Command Center v8.0.0<br>
                        Type a command or ask for help.
                    </div>
                    <div class="ucc-input-group">
                        <input type="text" class="ucc-input" id="ucc-input" placeholder="What do you want to build?" autocomplete="off">
                        <button class="ucc-send" id="ucc-send">Go</button>
                    </div>
                </div>
            `;
            document.body.appendChild(container);

            // Event Listeners
            const input = container.querySelector('#ucc-input');
            const sendBtn = container.querySelector('#ucc-send');
            const minBtn = container.querySelector('#command-center-min-btn');
            const recordBtn = container.querySelector('#command-center-record-btn');
            const traceBtn = container.querySelector('#command-center-trace-btn');

            const submit = () => {
                const text = input.value.trim();
                if (text) {
                    this.executeCommand(text);
                    input.value = '';
                }
            };

            input.addEventListener('keypress', (e) => { if (e.key === 'Enter') submit(); });
            sendBtn.addEventListener('click', submit);

            minBtn.addEventListener('click', () => {
                container.classList.toggle('minimized');
            });

            recordBtn.addEventListener('click', () => {
                if (recordBtn.classList.contains('recording')) {
                    this.executeCommand('record_stop');
                } else {
                    this.executeCommand('record_start');
                }
            });

            traceBtn.addEventListener('click', () => {
                if (traceBtn.classList.contains('tracing')) {
                    this.executeCommand('trace_stop');
                } else {
                    this.executeCommand('trace_start');
                }
            });
        }

        showFeedback(message) {
            this.log(message, 'ucc-msg-feedback');
        }

        showSuccess(message) {
            this.log(message, 'ucc-msg-success');
        }

        showError(message) {
            this.log(message, 'ucc-msg-error');
        }

        showInfo(message) {
            this.log(message, 'ucc-msg-info');
        }

        log(message, className = '') {
            const output = document.getElementById('ucc-output');
            if (output) {
                const line = document.createElement('div');
                if (className) line.className = className;
                line.innerHTML = message;
                output.appendChild(line);
                output.scrollTop = output.scrollHeight;
            } else {
                console.log(`[Command Center] ${message}`);
            }
        }

        async executeCommand(prompt) {
            if (!prompt || this.isProcessing) {
                return;
            }
            this.showFeedback('🧠 Understanding command...');
            this.isProcessing = true;

            try {
                // Try to use DOM Intelligence for better understanding
                if (window.DOMIntelligence && typeof window.DOMIntelligence.processCommand === 'function') {
                    console.log('[Command Center] Using DOM Intelligence to process command');
                    const result = await window.DOMIntelligence.processCommand(prompt);
                    if (result.success) {
                        this.showSuccess(`✅ ${result.message}`);
                        // handlePostUiMutation(); // This needs to be implemented or adapted
                        return;
                    }
                }

                // Fallback to internal command parsing
                const command = this.parseIntent(prompt);
                console.log('[Command Center] Parsed command:', command);

                if (command.action === 'edit') {
                    await this.processEditCommand(command, prompt);
                } else if (command.action === 'add') {
                    await this.processAddCommand(command, prompt);
                } else if (command.action === 'remove') {
                    await this.processRemoveCommand(command, prompt);
                } else {
                    // Handle original simple commands
                    switch (command.action) {
                        case 'undo': return await this.handleUndo();
                        case 'redo': return await this.handleRedo();
                        case 'record_start': return await this.handleRecordStart();
                        case 'record_stop': return await this.handleRecordStop(command);
                        case 'run_skill': return await this.handleRunSkill(command);
                        case 'list_skills': return await this.handleListSkills();
                        case 'delete_skill': return await this.handleDeleteSkill(command);
                        case 'trace_start': return await this.handleTraceStart();
                        case 'trace_stop': return await this.handleTraceStop();
                        case 'trace_log': return await this.handleTraceLog();
                        case 'trace_clear': return await this.handleTraceClear();
                        case 'mock_api': return await this.handleMockApi(command);
                        case 'status': return this.showStatus();
                        default: return this.showError(`Unknown command type: ${command.action}`);
                    }
                }
            } catch (error) {
                this.showError('❌ Error: ' + error.message);
                console.error('[Command Center] Error:', error);
            } finally {
                this.isProcessing = false;
            }
        }

        parseIntent(prompt) {
            const lower = prompt.toLowerCase();
            const addPatterns = [
                /\b(?:add|create|insert|make|build|put|place|generate|produce|construct)\b/i,
                /\bgive\s+me\b/i,
                /\bset\s+up\b/i,
                /\bi\s+(?:need|want|would\s+like)\s+(?:a|an|some|new)\b/i,
                /\bcan\s+(?:you|i)\s+(?:add|create|make|get)\b/i,
                /\ba\s+new\b/i,
                /\ban?\s+\w+\s+(?:that|with)/i
            ];
            const editPatterns = [
                /\b(?:change|edit|update|modify|alter|adjust|tweak|revise|amend|correct|fix)\b/i,
                /\b(?:rewrite|rephrase|swap|replace|switch|transform|convert)\b/i,
                /\bmake\s+(?:it|the|that)\b/i,
                /\bset\s+(?:it|the|that)\s+to\b/i,
                /\binstead\b/i,
                /\bbut\s+it\s+should\b/i,
                /\bi\s+need\s+it\s+to\b/i,
                /\bthe\s+\w+/i,
                /\bthat\s+\w+/i,
                /\bthis\s+\w+/i
            ];
            const removePatterns = [
                /\b(?:remove|delete|erase|clear|eliminate|drop|destroy|hide|discard|purge)\b/i,
                /\bget\s+rid\s+of\b/i,
                /\btake\s+(?:away|out)\b/i,
                /\bdon'?t\s+(?:need|want)\b/i
            ];

            let addScore = 0, editScore = 0, removeScore = 0;
            for (const pattern of addPatterns) { if (pattern.test(lower)) addScore += 10; }
            for (const pattern of editPatterns) { if (pattern.test(lower)) editScore += 10; }
            for (const pattern of removePatterns) { if (pattern.test(lower)) removeScore += 10; }

            let action = 'add';
            const maxScore = Math.max(addScore, editScore, removeScore);
            if (maxScore > 0) {
                if (removeScore === maxScore) { action = 'remove'; }
                else if (editScore === maxScore) { action = 'edit'; }
            }

            if (action === 'edit') {
                const editToMatch = prompt.match(/(?:change|edit|update|modify|alter|tweak|set|make)\s+(?:the\s+)?(.+?)\s+to\s+(?:read\s+|say\s+)?["']?(.+?)["']?$/i);
                if (editToMatch && editToMatch[1] && editToMatch[2]) return { action: 'edit', selector: editToMatch[1].trim(), newText: editToMatch[2].trim(), requiresAiPlan: false };
                const shouldMatch = prompt.match(/(?:the|that|this)\s+(.+?)\s+should\s+(?:say|read|be)\s+["']?(.+?)["']?$/i);
                if (shouldMatch && shouldMatch[1] && shouldMatch[2]) return { action: 'edit', selector: shouldMatch[1].trim(), newText: shouldMatch[2].trim(), requiresAiPlan: false };
                const editSimpleMatch = prompt.match(/(?:change|edit|update|modify|the|that|this)\s+(.+)$/i);
                if (editSimpleMatch && editSimpleMatch[1]) return { action: 'edit', selector: editSimpleMatch[1].trim(), newText: '', requiresAiPlan: true };
            }

            if (action === 'remove') {
                const removeMatch = prompt.match(/(?:remove|delete|get\s+rid\s+of|take\s+away)\s+(?:the\s+)?(.+)$/i);
                if (removeMatch && removeMatch[1]) return { action: 'remove', selector: removeMatch[1].trim(), requiresAiPlan: false };
            }

            // Fallback for simple commands
            // Fallback for simple commands
            if (prompt.startsWith('undo')) return { action: 'undo' };
            if (prompt.startsWith('redo')) return { action: 'redo' };
            if (prompt === 'record_start') return { action: 'record_start' };
            if (prompt === 'record_stop') return { action: 'record_stop' };
            if (prompt === 'trace_start') return { action: 'trace_start' };
            if (prompt === 'trace_stop') return { action: 'trace_stop' };
            if (prompt === 'trace_log') return { action: 'trace_log' };
            if (prompt === 'trace_clear') return { action: 'trace_clear' };
            if (prompt === 'list_skills') return { action: 'list_skills' };
            if (prompt === 'status') return { action: 'status' };

            if (prompt.startsWith('run_skill')) {
                const name = prompt.replace('run_skill', '').trim();
                return { action: 'run_skill', name };
            }
            if (prompt.startsWith('delete_skill')) {
                const name = prompt.replace('delete_skill', '').trim();
                return { action: 'delete_skill', name };
            }
            if (prompt.startsWith('mock_api')) {
                // simplistic parsing for mock_api url response
                const parts = prompt.split(' ');
                if (parts.length >= 3) {
                    return { action: 'mock_api', url: parts[1], response: parts.slice(2).join(' ') };
                }
            }

            return { action: 'add', selector: '', requiresAiPlan: true };
        }

        async processEditCommand(command, prompt) {
            if (!window.YooThemeAutomation) throw new Error('YooThemeAutomation not loaded');
            const selectorLabel = command.selector || 'element';
            if (!command.requiresAiPlan && command.newText) {
                this.showFeedback(`🤖 Automating: Edit "${selectorLabel}"...`);
                await window.YooThemeAutomation.changeText(selectorLabel, command.newText);
                this.showSuccess('✅ Element updated!');
            } else {
                this.showFeedback(`🤖 Planning edit for "${selectorLabel}"...`);
                const plan = await this.generateActionPlan(prompt);
                await this.executeActionPlan(plan);
            }
        }

        async processAddCommand(command, prompt) {
            if (!window.YooThemeAutomation) throw new Error('YooThemeAutomation not loaded');
            this.showFeedback(`🤖 Planning new element...`);
            const plan = await this.generateActionPlan(prompt);
            await this.executeActionPlan(plan);
        }

        async processRemoveCommand(command, prompt) {
            if (!window.YooThemeAutomation) throw new Error('YooThemeAutomation not loaded');
            const selectorLabel = command.selector || 'element';
            if (command.selector && !command.requiresAiPlan) {
                this.showFeedback(`🗑️ Removing "${selectorLabel}"...`);
                await window.YooThemeAutomation.removeElement(command.selector);
                this.showSuccess('✅ Element removed!');
            } else {
                this.showFeedback(`🤖 Planning removal of "${selectorLabel}"...`);
                const plan = await this.generateActionPlan(prompt);
                await this.executeActionPlan(plan);
            }
        }

        async generateActionPlan(prompt) {
            const styleId = localStorage.getItem('ai_builder_style_id');
            if (!styleId) throw new Error('Template style ID not detected.');

            const response = await this.callBackend('process', { prompt, styleId: parseInt(styleId, 10), mode: 'ui' });
            const plan = response.data?.actionPlan || response.data;
            if (!plan || typeof plan !== 'object') throw new Error('Backend did not return a valid action plan.');
            return plan;
        }

        async executeActionPlan(plan) {
            if (!plan || !plan.action) throw new Error('Invalid automation plan');
            if (!window.YooThemeAutomation) throw new Error('YooThemeAutomation not loaded');

            const action = plan.action;
            const label = plan.target || plan.selector || plan.elementType || 'element';

            if (action === 'edit_text') {
                const selector = plan.selector || plan.target;
                const text = plan.text || plan.newText;
                if (!selector || !text) throw new Error('Plan missing selector or text for edit');
                this.showFeedback(`✏️ Editing "${label}"...`);
                await window.YooThemeAutomation.changeText(selector, text);
                this.showSuccess('✅ Text updated!');
            } else if (action === 'add_element') {
                this.showFeedback(`➕ Adding "${label}"...`);
                const elementType = plan.elementType || this.inferElementType(plan.prompt || '');
                await window.YooThemeAutomation.addElementAndSetText(elementType, plan.text || plan.prompt);
                this.showSuccess('✅ Element added!');
            } else if (action === 'remove_element') {
                const selector = plan.selector || plan.target;
                if (!selector) throw new Error('Plan missing selector for removal');
                this.showFeedback(`🗑️ Removing "${label}"...`);
                await window.YooThemeAutomation.removeElement(selector);
                this.showSuccess('✅ Element removed!');
            } else {
                throw new Error(`Unsupported plan action: ${action}`);
            }
        }

        inferElementType(text) {
            const lower = (text || '').toLowerCase();
            if (lower.includes('button')) return 'button';
            if (lower.includes('image')) return 'image';
            if (lower.includes('headline')) return 'headline';
            return 'text'; // Default
        }

        async callBackend(task, data) {
            const token = window.Joomla?.getOptions('csrf.token') || '';
            const response = await fetch(`/index.php?option=com_ajax&plugin=ai_builder&group=system&format=json&task=${task}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
                body: JSON.stringify(data)
            });
            if (!response.ok) throw new Error(`Network error: ${response.statusText}`);
            const jsonResponse = await response.json();
            if (!jsonResponse.success) throw new Error(jsonResponse.message || 'Unknown backend error');
            return jsonResponse;
        }

        // ======================================================================
        // COMMAND HANDLERS (for simple commands)
        // ======================================================================

        async handleClick(intent) {
            if (!this.systems.yoothemeAutomation) return this.showError('YOOtheme Automation not available.');
            try {
                const { targetElement } = this.systems.yoothemeAutomation.resolveElement(intent.selector);
                await this.systems.yoothemeAutomation.simulateHumanClick(targetElement);
                this.showSuccess(`✅ Clicked on "${intent.selector}"`);
            } catch (error) {
                this.showError(`❌ Failed to click: ${error.message}`);
            }
        }

        async handleAdd(intent) {
            if (!this.systems.yoothemeApi) return this.showError('YOOtheme API not available.');
            await this.systems.yoothemeApi.addElement(intent.element, { content: intent.content });
            this.showSuccess(`✅ Added ${intent.element} via Direct API`);
        }
        async handleUndo() {
            if (!this.systems.yoothemeApi) return this.showError('YOOtheme API not available.');
            await this.systems.yoothemeApi.undo();
            this.showSuccess('Action undone.');
        }
        async handleRedo() {
            if (!this.systems.yoothemeApi) return this.showError('YOOtheme API not available.');
            await this.systems.yoothemeApi.redo();
            this.showSuccess('Action redone.');
        }
        async handleRecordStart() {
            if (!this.systems.actionRecorder) return this.showError('Action Recorder not available.');
            this.systems.actionRecorder.start();
            this.showFeedback('🔴 Recording actions...');
            document.getElementById('command-center-record-btn').classList.add('recording');
        }
        async handleRecordStop(intent) {
            if (!this.systems.actionRecorder || !this.systems.skillManager) return this.showError('Recorder or Skill Manager not available.');

            let name = intent.name;
            if (!name) {
                // Simple prompt for now, can be improved later
                name = prompt('Enter a name for this new skill:', `Skill ${new Date().toLocaleTimeString()}`);
                if (!name) return; // User cancelled
            }

            const script = this.systems.actionRecorder.stop(name);
            if (script) {
                this.systems.skillManager.addSkill(name, script);
                this.showSuccess(`✨ Skill "${name}" saved!`);
            }
            document.getElementById('command-center-record-btn').classList.remove('recording');
        }
        async handleRunSkill(intent) {
            if (!this.systems.skillManager) return this.showError('Skill Manager not available.');
            const success = await this.systems.skillManager.runSkill(intent.name);
            if (success) this.showSuccess(`✅ Skill "${intent.name}" executed.`);
            else this.showError(`❌ Failed to execute skill "${intent.name}".`);
        }
        async handleListSkills() {
            if (!this.systems.skillManager) return this.showError('Skill Manager not available.');
            const skills = this.systems.skillManager.listSkills();
            this.showInfo(`<strong>📚 Available Skills:</strong><br>${skills.length > 0 ? skills.map(s => `• ${s}`).join('<br>') : '<i>No skills learned yet.</i>'}`);
        }
        async handleDeleteSkill(intent) {
            if (!this.systems.skillManager) return this.showError('Skill Manager not available.');
            this.systems.skillManager.deleteSkill(intent.name);
            this.showSuccess(`🗑️ Skill "${intent.name}" deleted.`);
        }
        async handleTraceStart() {
            if (!this.systems.apiTracer) return this.showError('API Tracer not available.');
            this.systems.apiTracer.start();
            this.showFeedback('📡 API Tracing activated.');
            document.getElementById('command-center-trace-btn').classList.add('tracing');
        }
        async handleTraceStop() {
            if (!this.systems.apiTracer) return this.showError('API Tracer not available.');
            this.systems.apiTracer.stop();
            this.showFeedback('📡 API Tracing deactivated.');
            document.getElementById('command-center-trace-btn').classList.remove('tracing');
        }
        async handleTraceLog() {
            if (!this.systems.apiTracer) return this.showError('API Tracer not available.');
            const log = this.systems.apiTracer.requestLog;
            let logHtml = `<strong>📡 API Trace Log (${log.length} requests):</strong><br>`;
            if (log.length > 0) {
                logHtml += log.map(r => `• [${r.status}] ${r.method} ${r.url.substring(0, 50)}... (${r.duration}ms)`).join('<br>');
            } else {
                logHtml += '<i>No requests logged yet.</i>';
            }
            this.showInfo(logHtml);
        }
        async handleTraceClear() {
            if (!this.systems.apiTracer) return this.showError('API Tracer not available.');
            this.systems.apiTracer.clearLog();
            this.showSuccess('🗑️ API trace log cleared.');
        }
        async handleMockApi(intent) {
            if (!this.systems.apiTracer) return this.showError('API Tracer not available.');
            this.systems.apiTracer.addMock(intent.url, intent.response);
            this.showSuccess(`🎭 Mock response set for URLs containing "${intent.url}".`);
        }

        showStatus() {
            this.showInfo(`
                <strong>Command Center Status</strong><br>
                🚀 Direct API: ${this.systems.yoothemeApi ? '✓' : '✗'}<br>
                🤖 Automation: ${this.systems.yoothemeAutomation ? '✓' : '✗'}<br>
                🧠 DOM Intelligence: ${this.systems.domIntelligence ? '✓' : '✗'}<br>
                🔴 Recorder: ${this.systems.actionRecorder ? '✓' : '✗'}<br>
                💡 Skills: ${this.systems.skillManager ? '✓' : '✗'}<br>
                📡 Tracer: ${this.systems.apiTracer ? '✓' : '✗'}
            `);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(() => new UnifiedCommandCenter(), 1000));
    } else {
        setTimeout(() => new UnifiedCommandCenter(), 1000);
    }

})();
