/**
 * Cleo.js (Chameleon AI-Forge) Integration for AI Builder
 *
 * This module integrates the superior capabilities of Cleo.js (Chameleon AI-Forge)
 * into the existing AI Builder system to enhance its functionality.
 *
 * @package     AI Builder
 * @version     1.0.0
 * @copyright   Copyright (C) 2025 AI Builder Team
 * @license     GNU GPL v2 or later
 */

(function() {
    'use strict';

    // Wait for both systems to be available
    function waitForIntegrationSystems(callback, timeout = 10000) {
        const startTime = Date.now();

        const checkInterval = setInterval(() => {
            const hasAIIntegration = !!window.AIBuilderIntegration;
            const hasChameleon = !!window.ChameleonAI;
            const hasDOMIntelligence = !!window.DOMIntelligence;
            const hasYooThemeAutomation = !!window.YooThemeAutomation;

            if (hasAIIntegration && hasChameleon && hasDOMIntelligence && hasYooThemeAutomation) {
                clearInterval(checkInterval);
                console.log('[Cleo Integration] ✅ All systems ready for integration');
                callback();
            } else if (Date.now() - startTime > timeout) {
                clearInterval(checkInterval);
                console.warn('[Cleo Integration] ⚠️ Timeout waiting for integration systems');
                console.log('Status:', {
                    hasAIIntegration,
                    hasChameleon,
                    hasDOMIntelligence,
                    hasYooThemeAutomation
                });

                // Try to initialize with what we have available
                callback();
            }
        }, 100);
    }

    // Cleo Integration Class
    class CleoAIIntegration {
        constructor() {
            this.activated = false;
            this.chameleonAvailable = !!window.ChameleonAI;
            this.aiBuilderIntegration = window.AIBuilderIntegration;
            this.domIntelligence = window.DOMIntelligence;
            this.automation = window.YooThemeAutomation;

            this.initialize();
        }

        initialize() {
            console.log('[Cleo Integration] Initializing integration with superior Cleo.js capabilities...');

            if (!this.chameleonAvailable) {
                console.warn('[Cleo Integration] Chameleon AI-Forge not available - loading dynamically');
                this.loadChameleon();
                return;
            }

            this.activated = true;
            this.enhanceAIProcesses();
            this.registerCleoCommands();
            this.addCleoFeatures();

            console.log('[Cleo Integration] ✅ Cleo.js integration activated');
        }

        // Load Chameleon AI-Forge if not already available
        loadChameleon() {
            const chameleonScript = document.createElement('script');
            chameleonScript.src = '/media/plg_system_ai_builder/js/cleo.js';
            chameleonScript.onload = () => {
                console.log('[Cleo Integration] Chameleon AI-Forge loaded dynamically');

                // Wait a bit for Chameleon to fully initialize
                setTimeout(() => {
                    this.chameleonAvailable = !!window.ChameleonAI;
                    this.activated = true;
                    this.enhanceAIProcesses();
                    this.registerCleoCommands();
                    this.addCleoFeatures();

                    console.log('[Cleo Integration] ✅ Dynamic Cleo.js integration activated');
                }, 1000);
            };
            chameleonScript.onerror = () => {
                console.error('[Cleo Integration] Failed to load Chameleon AI-Forge');
            };
            document.head.appendChild(chameleonScript);
        }

        // Enhance existing AI Builder processes with Cleo.js capabilities
        enhanceAIProcesses() {
            if (!this.aiBuilderIntegration) {
                console.warn('[Cleo Integration] AI Builder Integration not available for enhancement');
                return;
            }

            // Enhance processCommand with Cleo's superior analysis and YOOtheme awareness
            const originalProcessCommand = this.aiBuilderIntegration.processCommand;
            this.aiBuilderIntegration.processCommand = async (command, progressCallback) => {
                console.log('[Cleo Integration] Enhancing processCommand with superior Cleo.js capabilities and YOOtheme awareness');

                // First, check if we need to perform YOOtheme-specific analysis
                if (this.isInYooThemeCustomizer()) {
                    // Enhance the command context for YOOtheme
                    const enhancedCommand = await this.enhanceCommandForYooTheme(command);
                    command = enhancedCommand;
                }

                // Use Cleo's advanced command parsing if available
                if (window.ChameleonAI && window.ChameleonAI.getController) {
                    const chameleonController = window.ChameleonAI.getController();

                    console.log('[Cleo Integration] Using Chameleon AI-Forge advanced parsing for:', command);

                    try {
                        // Parse command with Chameleon's superior parser
                        const chameleonOps = this.parseWithChameleon(command);

                        // Check if any operations should be handled with YOOtheme awareness
                        const processedOps = await this.processOpsWithYooThemeAwareness(chameleonOps);

                        if (processedOps.length > 0) {
                            console.log('[Cleo Integration] Executing', processedOps.length, 'YOOtheme-aware operations');
                            return await this.executeChameleonOperations(processedOps, progressCallback);
                        }
                    } catch (error) {
                        console.warn('[Cleo Integration] Chameleon parsing failed, falling back to original', error);
                    }
                }

                // Fall back to original processing if Chameleon fails
                return await originalProcessCommand.call(this.aiBuilderIntegration, command, progressCallback);
            };

            // Enhance DOM scanning with Cleo's deep analysis and YOOtheme awareness
            const originalScanPage = this.domIntelligence.scanPage;
            this.domIntelligence.scanPage = async function() {
                console.log('[Cleo Integration] Enhancing DOM scanning with superior analysis and YOOtheme awareness');

                // Get original scan
                const originalResult = originalScanPage.call(this);

                // Get YOOtheme-specific information
                const yooThemeInfo = await window.CleoAIIntegration.getYooThemeElements();

                // If Chameleon is available, enrich with its analysis
                if (window.ChameleonAI && window.ChameleonAI.getController) {
                    try {
                        const chameleonController = window.ChameleonAI.getController();
                        const chameleonAnalysis = chameleonController.analyzer.getPageMetrics();

                        // Merge additional insights
                        originalResult.cleoInsights = chameleonAnalysis;
                        originalResult.yooThemeElements = yooThemeInfo;
                        originalResult.enhanced = true;
                    } catch (error) {
                        console.warn('[Cleo Integration] Chameleon analysis enhancement failed', error);
                    }
                }

                return originalResult;
            };

            // Enhance the findElementByDescription with Cleo's superior element detection
            const originalFindElement = this.domIntelligence.findElementByDescription;
            this.domIntelligence.findElementByDescription = async function(description, pageContext) {
                console.log('[Cleo Integration] Enhancing element finding with superior Cleo.js capabilities');

                // First try the original method
                let result = originalFindElement.call(this, description, pageContext);

                // If not found and Cleo is available, use its advanced detection
                if (!result && window.CleoAIIntegration) {
                    try {
                        result = await window.CleoAIIntegration.findYooThemeElementByDescription(description);
                    } catch (error) {
                        console.warn('[Cleo Integration] Advanced element finding failed:', error);
                    }
                }

                return result;
            };
        }

        // Determine if a command needs advanced processing
        needsAdvancedProcessing(command) {
            const advancedKeywords = [
                'scan for vulnerabilities', 'security audit', 'api monitor', 'accessibility',
                'performance audit', 'xss scan', 'sql injection', 'analyze element',
                'generate component', 'create form', 'create card', 'theme', 'styling',
                'inspect', 'find security', 'check accessibility', 'performance',
                'mock api', 'record actions', 'remix component', 'isolate component'
            ];

            const lowerCommand = command.toLowerCase();
            return advancedKeywords.some(keyword => lowerCommand.includes(keyword));
        }

        // Parse command using Chameleon's superior parser
        parseWithChameleon(command) {
            if (!window.ChameleonAI || !window.ChameleonAI.getController) {
                return [];
            }

            try {
                const controller = window.ChameleonAI.getController();
                // Use the Genesis Driver's parsing capability
                const operations = controller.genesis.parseCommand(command);
                return operations;
            } catch (error) {
                console.error('[Cleo Integration] Command parsing with Chameleon failed:', error);
                return [];
            }
        }

        // Execute operations from Chameleon's parser
        async executeChameleonOperations(operations, progressCallback) {
            if (!Array.isArray(operations) || operations.length === 0) {
                return { success: false, message: 'No operations to execute' };
            }

            const results = {
                success: true,
                message: '',
                operationsExecuted: 0,
                operationResults: []
            };

            try {
                for (let i = 0; i < operations.length; i++) {
                    const op = operations[i];

                    if (progressCallback) {
                        progressCallback({
                            phase: 'executing',
                            message: `Executing operation ${i + 1}/${operations.length}: ${op.type}`,
                            progress: { current: i + 1, total: operations.length }
                        });
                    }

                    try {
                        // Execute the operation using our enhanced agent
                        const result = await this.executeOperation(op);
                        results.operationResults.push(result);
                        results.operationsExecuted++;

                        console.log(`[Cleo Integration] Operation ${op.type} completed:`, result);
                    } catch (opError) {
                        console.error(`[Cleo Integration] Operation ${op.type} failed:`, opError);
                        results.success = false;
                        results.operationResults.push({
                            operation: op.type,
                            error: opError.message
                        });
                    }
                }

                results.message = results.success
                    ? `Successfully executed ${results.operationsExecuted} operations`
                    : `Partially completed: ${results.operationsExecuted}/${operations.length} operations`;

                return results;
            } catch (error) {
                console.error('[Cleo Integration] Error executing operations:', error);
                return {
                    success: false,
                    message: `Error executing operations: ${error.message}`
                };
            }
        }

        // Execute a single operation using enhanced capabilities
        async executeOperation(op) {
            // Check if we're in YOOtheme customizer context and handle accordingly
            const inCustomizer = this.isInYooThemeCustomizer();

            // Use the AI Builder's agent core for operations when possible
            if (this.aiBuilderIntegration && typeof this.aiBuilderIntegration.automation === 'object') {
                try {
                    return await this.aiBuilderIntegration.automation.executeAgentOperation(op);
                } catch (error) {
                    console.warn('[Cleo Integration] AI Builder operation failed, trying alternatives:', error);
                }
            }

            // Fallback to Chameleon operations if available
            if (window.ChameleonAI && window.ChameleonAI.getController) {
                const controller = window.ChameleonAI.getController();
                try {
                    return await controller.agent.executeAgentOperation(op);
                } catch (error) {
                    console.warn('[Cleo Integration] Chameleon operation failed:', error);
                }
            }

            // Handle specific operations with YOOtheme awareness
            switch (op.type) {
                case 'theme':
                    if (window.ChameleonAI && window.ChameleonAI.getController) {
                        const styler = window.ChameleonAI.getController().styler;
                        if (styler && typeof styler.applyTheme === 'function') {
                            styler.applyTheme(op.theme);
                            return { success: true, message: `Theme ${op.theme} applied` };
                        }
                    }
                    break;

                case 'style':
                    if (op.selector && op.style) {
                        if (inCustomizer) {
                            // In YOOtheme customizer, we need to work with the preview iframe
                            const result = await this.styleYooThemeElement(op.selector, op.style);
                            return result;
                        } else {
                            // Standard DOM manipulation
                            const elements = document.querySelectorAll(op.selector);
                            elements.forEach(el => Object.assign(el.style, op.style));
                            return { success: true, message: `Style applied to ${elements.length} elements` };
                        }
                    }
                    break;

                case 'modify_dom':
                    if (inCustomizer) {
                        // Handle YOOtheme customizer element modification
                        return await this.modifyYooThemeElement(op.selector, op.attribute, op.value, op.textContent);
                    } else {
                        // Standard DOM modification
                        const targetElements = document.querySelectorAll(op.selector);
                        if (targetElements.length > 0) {
                            targetElements.forEach(el => {
                                if (op.attribute) {
                                    if (op.value === 'true') el.setAttribute(op.attribute, '');
                                    else if (op.value === '') el.removeAttribute(op.attribute);
                                    else el.setAttribute(op.attribute, op.value);
                                }
                                if (op.textContent !== undefined) {
                                    el.textContent = op.textContent;
                                }
                            });
                            return { success: true, message: `Modified ${targetElements.length} elements` };
                        }
                    }
                    break;

                case 'select':
                    if (inCustomizer) {
                        // Use YOOtheme automation to select elements
                        return await this.findYooThemeElement(op.selector);
                    } else {
                        // Standard element selection
                        const elements = document.querySelectorAll(op.selector);
                        return {
                            success: true,
                            elements: Array.from(elements),
                            count: elements.length,
                            message: `Selected ${elements.length} elements`
                        };
                    }
                    break;

                case 'generate_ui':
                    if (window.ChameleonAI && window.ChameleonAI.getController) {
                        const styler = window.ChameleonAI.getController().styler;
                        if (styler && typeof styler.generateUI === 'function') {
                            await styler.generateUI(op.prompt);
                            return { success: true, message: `Generated UI component: ${op.prompt}` };
                        }
                    }
                    break;

                case 'isolate_component':
                    if (inCustomizer) {
                        return await this.isolateYooThemeComponent(op);
                    } else {
                        return await this.isolateStandardComponent(op);
                    }
                    break;

                case 'automate_workflow':
                    return await this.automateWorkflow(op);
                    break;
            }

            return { success: false, message: `Unknown operation type: ${op.type}` };
        }

        // Register Cleo-specific commands in the AI Builder system
        registerCleoCommands() {
            console.log('[Cleo Integration] Registering superior Cleo.js commands');

            // Add Cleo commands to AI Builder's command system if available
            if (this.aiBuilderIntegration && this.aiBuilderIntegration.taskPlanner) {
                // Enhance task planner with Cleo's advanced patterns
                const cleoPatterns = {
                    security_scan: {
                        keywords: ['security', 'vulnerability', 'scan for issues', 'find security problems'],
                        template: 'execute_security_scan',
                        description: 'Run comprehensive security audit',
                        complexity: 'medium'
                    },
                    accessibility_audit: {
                        keywords: ['accessibility', 'a11y', 'wcag', 'screen reader'],
                        template: 'execute_accessibility_audit',
                        description: 'Check accessibility compliance',
                        complexity: 'medium'
                    },
                    api_analysis: {
                        keywords: ['api', 'network', 'requests', 'monitor api'],
                        template: 'execute_api_analysis',
                        description: 'Analyze API calls and performance',
                        complexity: 'high'
                    },
                    component_generation: {
                        keywords: ['generate', 'create component', 'build ui', 'make form', 'create card'],
                        template: 'execute_component_generation',
                        description: 'Generate custom UI components',
                        complexity: 'medium'
                    },
                    style_theming: {
                        keywords: ['theme', 'styling', 'visual', 'color scheme', 'design'],
                        template: 'execute_styling_engine',
                        description: 'Apply advanced styling and themes',
                        complexity: 'low'
                    }
                };

                // Merge Cleo patterns with existing patterns
                Object.assign(this.aiBuilderIntegration.taskPlanner.COMPLEX_PATTERNS, cleoPatterns);
            }
        }

        // Add Cleo features to the AI Builder system
        addCleoFeatures() {
            console.log('[Cleo Integration] Adding superior Cleo.js features');

            // Add Cleo capabilities to the global AI Builder object if available
            if (window.AIBuilderIntegration) {
                // Add security scanning capability
                window.AIBuilderIntegration.runSecurityScan = async () => {
                    if (window.ChameleonAI && window.ChameleonAI.getController) {
                        const scanner = window.ChameleonAI.getController().vulnerabilityScanner;
                        if (scanner) {
                            await scanner.scanXSS();
                            await scanner.scanSQLInjection();
                            await scanner.scanDirectoryExposure();
                            return { success: true, message: 'Security scan executed' };
                        }
                    }
                    return { success: false, message: 'Security scanner not available' };
                };

                // Add API monitoring capability
                window.AIBuilderIntegration.setupAPIMonitoring = (urlPattern) => {
                    if (window.ChameleonAI && window.ChameleonAI.getController) {
                        const apiMonitor = window.ChameleonAI.getController().apiMonitor;
                        if (apiMonitor) {
                            apiMonitor.addMockRule({
                                urlRegex: urlPattern,
                                method: 'ANY',
                                status: 200,
                                response: '{"message": "API call monitored"}'
                            });
                            return { success: true, message: 'API monitoring setup' };
                        }
                    }
                    return { success: false, message: 'API monitor not available' };
                };

                // Add component generation capability
                window.AIBuilderIntegration.generateComponent = async (prompt) => {
                    if (window.ChameleonAI && window.ChameleonAI.getController) {
                        const styler = window.ChameleonAI.getController().styler;
                        if (styler) {
                            await styler.generateUI(prompt);
                            return { success: true, message: 'Component generated' };
                        }
                    }
                    return { success: false, message: 'Component generation not available' };
                };

                // Add advanced styling capability
                window.AIBuilderIntegration.applyAdvancedStyling = (themeName) => {
                    if (window.ChameleonAI && window.ChameleonAI.getController) {
                        const styler = window.ChameleonAI.getController().styler;
                        if (styler) {
                            styler.applyTheme(themeName);
                            return { success: true, message: `Theme ${themeName} applied` };
                        }
                    }
                    return { success: false, message: 'Styling engine not available' };
                };
            }

            // Enhance the DOM Intelligence with Cleo's analysis
            if (window.DOMIntelligence) {
                // Add enhanced element finding using Cleo's selector detection
                const cleoFindElementByDescription = window.DOMIntelligence.findElementByDescription;
                window.DOMIntelligence.findElementByDescription = (description, pageContext) => {
                    console.log('[Cleo Integration] Using enhanced element finding');

                    // First try original method
                    const originalResult = cleoFindElementByDescription.call(window.DOMIntelligence, description, pageContext);

                    // If Cleo is available, cross-reference with its analysis
                    if (originalResult === null && window.ChameleonAI && window.ChameleonAI.getController) {
                        try {
                            // Use Chameleon's selector detection utilities
                            const controller = window.ChameleonAI.getController();
                            const selectorHints = controller.genesis.parseCommand(`find ${description}`).filter(op => op.type === 'select');

                            if (selectorHints.length > 0) {
                                const selector = selectorHints[0].selector;
                                const element = document.querySelector(selector);
                                if (element) {
                                    return {
                                        ...window.DOMIntelligence.generateSelector(element),
                                        DOMReference: element,
                                        isEditable: window.DOMIntelligence.hasEditControl(element, document)
                                    };
                                }
                            }
                        } catch (error) {
                            console.warn('[Cleo Integration] Enhanced finding failed:', error);
                        }
                    }

                    return originalResult;
                };
            }
        }

        // Check if we're in YOOtheme customizer context
        isInYooThemeCustomizer() {
            return !!(window.$customizer || (window.parent && window.parent.$customizer));
        }

        // Style a YOOtheme element in the customizer
        async styleYooThemeElement(selector, style) {
            try {
                // Get the preview iframe
                const previewFrame = this.getPreviewIframe();
                if (!previewFrame) {
                    throw new Error('No preview iframe found in YOOtheme customizer');
                }

                const previewDoc = previewFrame.contentDocument || previewFrame.contentWindow.document;
                const elements = previewDoc.querySelectorAll(selector);

                if (elements.length === 0) {
                    throw new Error(`No elements found with selector: ${selector}`);
                }

                // Apply styles to elements in preview
                elements.forEach(el => {
                    Object.assign(el.style, style);
                });

                // If these are builder elements, we may need to update their settings
                // Find parent builder elements and update their styles
                elements.forEach(el => {
                    const builderEl = el.closest('[data-builder-element], [data-element-id]');
                    if (builderEl) {
                        // Trigger a change event to save the changes
                        const changeEvent = new Event('change', { bubbles: true });
                        builderEl.dispatchEvent(changeEvent);
                    }
                });

                return {
                    success: true,
                    message: `Style applied to ${elements.length} element(s) in YOOtheme customizer`
                };
            } catch (error) {
                console.error('[Cleo Integration] Error styling YOOtheme element:', error);
                return { success: false, message: `Error styling: ${error.message}` };
            }
        }

        // Modify a YOOtheme element in the customizer
        async modifyYooThemeElement(selector, attribute, value, textContent) {
            try {
                const previewFrame = this.getPreviewIframe();
                if (!previewFrame) {
                    throw new Error('No preview iframe found in YOOtheme customizer');
                }

                const previewDoc = previewFrame.contentDocument || previewFrame.contentWindow.document;
                const elements = previewDoc.querySelectorAll(selector);

                if (elements.length === 0) {
                    throw new Error(`No elements found with selector: ${selector}`);
                }

                elements.forEach(el => {
                    if (attribute) {
                        if (value === 'true') el.setAttribute(attribute, '');
                        else if (value === '') el.removeAttribute(attribute);
                        else el.setAttribute(attribute, value);
                    }
                    if (textContent !== undefined) {
                        el.textContent = textContent;

                        // Trigger input event to update the content in YOOtheme
                        const inputEvent = new Event('input', { bubbles: true });
                        el.dispatchEvent(inputEvent);
                    }
                });

                return {
                    success: true,
                    message: `Modified ${elements.length} element(s) in YOOtheme customizer`
                };
            } catch (error) {
                console.error('[Cleo Integration] Error modifying YOOtheme element:', error);
                return { success: false, message: `Error modifying: ${error.message}` };
            }
        }

        // Find a YOOtheme element in the customizer
        async findYooThemeElement(selector) {
            try {
                const previewFrame = this.getPreviewIframe();
                if (!previewFrame) {
                    throw new Error('No preview iframe found in YOOtheme customizer');
                }

                const previewDoc = previewFrame.contentDocument || previewFrame.contentWindow.document;
                const elements = previewDoc.querySelectorAll(selector);

                return {
                    success: true,
                    elements: Array.from(elements),
                    count: elements.length,
                    message: `Found ${elements.length} element(s) in YOOtheme customizer`
                };
            } catch (error) {
                console.error('[Cleo Integration] Error finding YOOtheme element:', error);
                return { success: false, message: `Error finding: ${error.message}` };
            }
        }

        // Get YOOtheme preview iframe
        getPreviewIframe() {
            return document.querySelector('iframe[name*="customizer"], iframe.uk-height-viewport, iframe[src*="site"]');
        }

        // Isolate a YOOtheme component (extract its HTML for reuse)
        async isolateYooThemeComponent(op) {
            try {
                const previewFrame = this.getPreviewIframe();
                if (!previewFrame) {
                    throw new Error('No preview iframe found in YOOtheme customizer');
                }

                const previewDoc = previewFrame.contentDocument || previewFrame.contentWindow.document;

                // Use Cleo's component isolation capabilities if available
                if (window.ChameleonAI && window.ChameleonAI.getController) {
                    const isoEngine = window.ChameleonAI.getController().toolkit.appIsolation;
                    if (isoEngine && typeof isoEngine.extractComponents === 'function') {
                        // Select the element in the preview and extract it
                        const element = previewDoc.querySelector(op.selector);
                        if (element) {
                            isoEngine.selectedComponents.set(op.selector, element);
                            const html = element.outerHTML;

                            // Copy to clipboard
                            if (typeof navigator.clipboard !== 'undefined') {
                                await navigator.clipboard.writeText(html);
                            }

                            return {
                                success: true,
                                html: html,
                                message: `YOOtheme component isolated and copied to clipboard`
                            };
                        }
                    }
                }

                // Fallback: manual extraction
                const element = previewDoc.querySelector(op.selector);
                if (!element) {
                    throw new Error(`Element not found: ${op.selector}`);
                }

                const html = element.outerHTML;

                // Copy to clipboard
                if (typeof navigator.clipboard !== 'undefined') {
                    await navigator.clipboard.writeText(html);
                }

                return {
                    success: true,
                    html: html,
                    message: `YOOtheme component isolated and copied to clipboard`
                };
            } catch (error) {
                console.error('[Cleo Integration] Error isolating YOOtheme component:', error);
                return { success: false, message: `Error isolating component: ${error.message}` };
            }
        }

        // Isolate a standard component
        async isolateStandardComponent(op) {
            try {
                const element = document.querySelector(op.selector);
                if (!element) {
                    throw new Error(`Element not found: ${op.selector}`);
                }

                const html = element.outerHTML;

                // Copy to clipboard
                if (typeof navigator.clipboard !== 'undefined') {
                    await navigator.clipboard.writeText(html);
                }

                return {
                    success: true,
                    html: html,
                    message: `Component isolated and copied to clipboard`
                };
            } catch (error) {
                console.error('[Cleo Integration] Error isolating standard component:', error);
                return { success: false, message: `Error isolating component: ${error.message}` };
            }
        }

        // Automate a workflow using Cleo's session recording capabilities
        async automateWorkflow(op) {
            try {
                if (window.ChameleonAI && window.ChameleonAI.getController) {
                    const recorder = window.ChameleonAI.getController().toolkit.sessionRecorder;
                    if (recorder) {
                        if (op.action === 'start_recording') {
                            recorder.toggleRecording();
                            return { success: true, message: 'Workflow recording started' };
                        } else if (op.action === 'stop_recording') {
                            if (recorder.isRecording) {
                                recorder.toggleRecording();
                            }
                            return { success: true, message: 'Workflow recording stopped' };
                        } else if (op.action === 'playback') {
                            await recorder.playback();
                            return { success: true, message: 'Workflow playback completed' };
                        } else if (op.action === 'get_script') {
                            const script = recorder.copyScript();
                            return { success: true, message: 'Automation script generated' };
                        }
                    }
                }

                return { success: false, message: 'Workflow automation not available' };
            } catch (error) {
                console.error('[Cleo Integration] Error in workflow automation:', error);
                return { success: false, message: `Error in automation: ${error.message}` };
            }
        }

        // Enhanced DOM parsing with Cleo's advanced capabilities
        async enhancedDOMParse() {
            try {
                let result = {
                    structure: {},
                    elements: [],
                    patterns: [],
                    intelligence: {}
                };

                // Use Cleo's page analysis if available
                if (window.ChameleonAI && window.ChameleonAI.getController) {
                    const analyzer = window.ChameleonAI.getController().analyzer;
                    const pageMetrics = analyzer.getPageMetrics();

                    result.intelligence.pageMetrics = pageMetrics;

                    // Perform full page scan using Cleo's analyzer
                    const scanResults = await analyzer.runFullPageScan();
                    result.intelligence.scanResults = scanResults;
                }

                // Use DOM Intelligence for YOOtheme-specific analysis
                if (window.DOMIntelligence) {
                    const domScan = window.DOMIntelligence.scanPage();
                    result.structure = domScan.structure;
                    result.elements = domScan.elements;
                }

                // Combine with Cleo's analysis if available
                if (window.ChameleonAI && window.ChameleonAI.getController) {
                    const controller = window.ChameleonAI.getController();
                    if (controller.foresight) {
                        // Add foresight insights
                        result.intelligence.foresightInsights = this.extractForesightInsights(controller.foresight);
                    }
                }

                // Identify YOOtheme builder elements specifically
                const yooThemeElements = this.findYooThemeElements();
                result.intelligence.yooThemeElements = yooThemeElements;

                // If in customizer, also analyze the builder structure
                if (this.isInYooThemeCustomizer()) {
                    result.intelligence.yooThemeCustomizerStructure = this.analyzeYooThemeStructure();
                }

                return {
                    success: true,
                    result: result,
                    message: 'Enhanced DOM parsing completed'
                };
            } catch (error) {
                console.error('[Cleo Integration] Error in enhanced DOM parsing:', error);
                return { success: false, message: `Error in DOM parsing: ${error.message}` };
            }
        }

        // Analyze YOOtheme structure in customizer
        analyzeYooThemeStructure() {
            const structure = {
                sections: [],
                elements: [],
                settings: {}
            };

            const previewFrame = this.getPreviewIframe();
            if (!previewFrame) return structure;

            const previewDoc = previewFrame.contentDocument || previewFrame.contentWindow.document;

            // Find all YOOtheme sections
            const sections = previewDoc.querySelectorAll('.uk-section, [data-builder-section], [data-section-id]');
            sections.forEach((section, index) => {
                structure.sections.push({
                    index,
                    id: section.id || null,
                    classes: Array.from(section.classList),
                    elements: section.querySelectorAll('*').length,
                    selector: this.generateYooThemeSelector(section)
                });
            });

            // Find all builder elements
            const builderElements = previewDoc.querySelectorAll('[data-builder-element], [data-element-type]');
            builderElements.forEach((element, index) => {
                structure.elements.push({
                    index,
                    type: element.getAttribute('data-element-type') || element.tagName.toLowerCase(),
                    id: element.id || null,
                    classes: Array.from(element.classList),
                    selector: this.generateYooThemeSelector(element)
                });
            });

            return structure;
        }

        // Find YOOtheme-specific elements
        findYooThemeElements() {
            const previewFrame = this.getPreviewIframe();
            if (!previewFrame) return [];

            const previewDoc = previewFrame.contentDocument || previewFrame.contentWindow.document;
            const elements = [];

            // Look for YOOtheme builder elements
            const yooSelector = '[data-builder-element], [data-element-id], [data-yoo-*], .builder-element, .uk-section, .uk-grid, .uk-card, .uk-navbar';
            const yooElements = previewDoc.querySelectorAll(yooSelector);

            yooElements.forEach(el => {
                elements.push({
                    id: el.id || null,
                    class: el.className || '',
                    tagName: el.tagName.toLowerCase(),
                    selector: this.generateYooThemeSelector(el),
                    attributes: Array.from(el.attributes).map(attr => ({
                        name: attr.name,
                        value: attr.value
                    })),
                    isEditable: this.hasYooThemeEditControls(el, previewDoc)
                });
            });

            return elements;
        }

        // Check if element has YOOtheme edit controls
        hasYooThemeEditControls(element, doc) {
            // Check for YOOtheme edit buttons in parent or sibling elements
            const editButton = element.querySelector('a[aria-label="Edit"]') ||
                              element.closest('[data-builder-element]')?.querySelector('a[aria-label="Edit"]');
            return !!editButton;
        }

        // Generate a robust selector for YOOtheme elements
        generateYooThemeSelector(element) {
            if (element.id) {
                return `#${CSS.escape(element.id)}`;
            }

            const path = [];
            let current = element;

            while (current && current !== document.body) {
                let selector = current.tagName.toLowerCase();

                if (current.id) {
                    selector += `#${CSS.escape(current.id)}`;
                    path.unshift(selector);
                    break;
                }

                // Prioritize YOOtheme-specific classes
                const yooClasses = Array.from(current.classList).filter(cls =>
                    cls.startsWith('uk-') || cls.includes('builder') || cls.includes('yoo')
                );

                if (yooClasses.length > 0) {
                    selector += '.' + yooClasses.map(cls => CSS.escape(cls)).join('.');
                } else if (current.classList.length > 0) {
                    // Use first class as fallback
                    selector += '.' + CSS.escape(current.classList[0]);
                }

                path.unshift(selector);
                current = current.parentElement;
            }

            return path.join(' > ');
        }

        // Extract insights from Cleo's foresight engine
        extractForesightInsights(foresight) {
            const insights = {
                accessibilityIssues: [],
                performanceHints: [],
                userActionPatterns: []
            };

            // Add any stored issues from foresight
            if (foresight.observer) {
                // The observer would have detected issues and stored them in the agent
                // For now, we'll return an empty set, but in a full implementation,
                // we'd tap into the observed mutations
            }

            return insights;
        }

        // Enhance command for YOOtheme context
        async enhanceCommandForYooTheme(command) {
            // Add YOOtheme-specific context to the command
            const previewFrame = this.getPreviewIframe();
            if (!previewFrame) return command;

            const previewDoc = previewFrame.contentDocument || previewFrame.contentWindow.document;

            // Look for YOOtheme-specific elements in the preview
            const builderElements = previewDoc.querySelectorAll('[data-builder-element], [data-element-type]');
            const elementCount = builderElements.length;

            // Enhance command if it's related to building/editing
            if (command.toLowerCase().includes('add') || command.toLowerCase().includes('create') ||
                command.toLowerCase().includes('change') || command.toLowerCase().includes('edit')) {

                // Add context hint for YOOtheme
                return command + ` (in YOOtheme context with ${elementCount} builder elements available)`;
            }

            return command;
        }

        // Process operations with YOOtheme awareness
        async processOpsWithYooThemeAwareness(operations) {
            // Check if we're in YOOtheme customizer and adapt operations accordingly
            if (!this.isInYooThemeCustomizer()) {
                return operations;
            }

            // For YOOtheme context, we may need to modify operations to work through the builder
            const processedOps = [];

            for (const op of operations) {
                let processedOp = { ...op };

                // Convert standard DOM operations to YOOtheme builder operations where appropriate
                if (op.type === 'modify_dom' && op.selector) {
                    // Check if this is a YOOtheme builder element
                    const previewFrame = this.getPreviewIframe();
                    if (previewFrame) {
                        const previewDoc = previewFrame.contentDocument || previewFrame.contentWindow.document;
                        const element = previewDoc.querySelector(op.selector);

                        if (element && element.closest('[data-builder-element]')) {
                            // This is a builder element, we may need to edit it through the builder interface
                            processedOp.isYooThemeBuilderElement = true;
                        }
                    }
                }

                // For styling operations in YOOtheme, we might want to use theme settings instead of direct styling
                if (op.type === 'style' && op.selector) {
                    processedOp.useYooThemeStyling = true;
                }

                processedOps.push(processedOp);
            }

            return processedOps;
        }

        // Find YOOtheme element by description using Cleo's intelligence
        async findYooThemeElementByDescription(description) {
            try {
                const previewFrame = this.getPreviewIframe();
                if (!previewFrame) {
                    console.warn('[Cleo Integration] No preview frame for YOOtheme element finding');
                    return null;
                }

                const previewDoc = previewFrame.contentDocument || previewFrame.contentWindow.document;

                // Use Chameleon's CommandUtils if available to detect selectors from description
                let targetElements = [];

                if (window.ChameleonAI && window.ChameleonAI.getController) {
                    const controller = window.ChameleonAI.getController();
                    const normalizedCommand = description.replace(/\s+/g, ' ').trim();
                    const lowerCmd = normalizedCommand.toLowerCase();
                    const hasContextSelection = false; // No pre-selected context

                    // Use Chameleon's selector detection
                    const selectorHints = controller.genesis.parseCommand(normalizedCommand)
                        .filter(op => op.type === 'select')
                        .map(op => op.selector);

                    if (selectorHints.length > 0) {
                        for (const selector of selectorHints) {
                            const elements = previewDoc.querySelectorAll(selector);
                            targetElements = targetElements.concat(Array.from(elements));
                        }
                    }
                }

                // If Chameleon couldn't find specific selectors, try semantic matching
                if (targetElements.length === 0) {
                    // Look for YOOtheme builder elements that match the description
                    const allBuilderElements = previewDoc.querySelectorAll(
                        '[data-builder-element], [data-element-type], .uk-section, .uk-card, .uk-grid'
                    );

                    // Use text content matching for semantic search
                    for (const element of Array.from(allBuilderElements)) {
                        const text = element.textContent.toLowerCase();
                        if (text.includes(description.toLowerCase()) ||
                            element.getAttribute('data-element-type')?.toLowerCase().includes(description.toLowerCase())) {
                            targetElements.push(element);
                        }
                    }
                }

                if (targetElements.length > 0) {
                    const element = targetElements[0]; // Return the first match
                    return {
                        index: 0,
                        type: element.getAttribute('data-element-type') || element.tagName.toLowerCase(),
                        text: element.textContent.substring(0, 50),
                        textLower: element.textContent.toLowerCase(),
                        selector: this.generateYooThemeSelector(element),
                        cssSelector: this.generateYooThemeSelector(element),
                        xpath: this.generateXPathForElement(element),
                        hasEditButton: this.hasYooThemeEditControls(element, previewDoc),
                        hasDeleteButton: false, // Simplified
                        isEditable: this.hasYooThemeEditControls(element, previewDoc),
                        position: {
                            top: element.getBoundingClientRect().top,
                            left: element.getBoundingClientRect().left,
                            width: element.getBoundingClientRect().width,
                            height: element.getBoundingClientRect().height,
                            visible: this.isVisible(element)
                        },
                        attributes: {
                            id: element.id || null,
                            classes: Array.from(element.classList),
                            dataAttrs: this.extractDataAttributes(element),
                            tagName: element.tagName.toLowerCase()
                        },
                        DOMReference: element
                    };
                }

                return null;
            } catch (error) {
                console.error('[Cleo Integration] Error finding YOOtheme element by description:', error);
                return null;
            }
        }

        // Get YOOtheme elements
        async getYooThemeElements() {
            const elements = [];
            const previewFrame = this.getPreviewIframe();

            if (!previewFrame) return elements;

            const previewDoc = previewFrame.contentDocument || previewFrame.contentWindow.document;

            // Find all YOOtheme builder elements
            const builderElements = previewDoc.querySelectorAll('[data-builder-element], [data-element-type]');

            for (let i = 0; i < builderElements.length; i++) {
                const element = builderElements[i];
                elements.push({
                    index: i,
                    type: element.getAttribute('data-element-type') || element.tagName.toLowerCase(),
                    id: element.id || null,
                    class: element.className || '',
                    tagName: element.tagName.toLowerCase(),
                    selector: this.generateYooThemeSelector(element),
                    attributes: Array.from(element.attributes).map(attr => ({
                        name: attr.name,
                        value: attr.value
                    })),
                    isEditable: this.hasYooThemeEditControls(element, previewDoc),
                    position: {
                        top: element.getBoundingClientRect().top,
                        left: element.getBoundingClientRect().left,
                        width: element.getBoundingClientRect().width,
                        height: element.getBoundingClientRect().height,
                        visible: this.isVisible(element)
                    }
                });
            }

            return elements;
        }

        // Generate XPath for an element
        generateXPathForElement(element) {
            if (element.id) {
                return `//*[@id="${element.id}"]`;
            }

            const path = [];
            let current = element;

            while (current && current !== document.body) {
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
        }

        // Check if element is visible
        isVisible(element) {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);

            return rect.width > 0 &&
                   rect.height > 0 &&
                   style.display !== 'none' &&
                   style.visibility !== 'hidden' &&
                   style.opacity !== '0';
        }

        // Extract data attributes from element
        extractDataAttributes(element) {
            const dataAttrs = {};
            Array.from(element.attributes).forEach(attr => {
                if (attr.name.startsWith('data-')) {
                    dataAttrs[attr.name] = attr.value;
                }
            });
            return dataAttrs;
        }

        // Execute security scan using Cleo's capabilities
        async executeSecurityScan() {
            if (!window.ChameleonAI || !window.ChameleonAI.getController) {
                return { success: false, message: 'Chameleon AI-Forge not available for security scan' };
            }

            const scanner = window.ChameleonAI.getController().vulnerabilityScanner;
            if (!scanner) {
                return { success: false, message: 'Vulnerability scanner not available' };
            }

            await scanner.scanXSS();
            await scanner.scanSQLInjection();
            await scanner.scanDirectoryExposure();

            return {
                success: true,
                message: 'Security scan completed using superior Cleo.js capabilities',
                findings: scanner.findings
            };
        }

        // Execute accessibility audit using Cleo's capabilities
        async executeAccessibilityAudit() {
            if (!window.ChameleonAI || !window.ChameleonAI.getController) {
                return { success: false, message: 'Chameleon AI-Forge not available for accessibility audit' };
            }

            // Use Chameleon's foresight engine to detect accessibility issues
            const foresight = window.ChameleonAI.getController().foresight;
            const findings = [];

            // Manually check for common accessibility issues
            document.querySelectorAll('img:not([alt]), img[alt=""]').forEach(img => {
                findings.push({
                    type: 'missing_alt_text',
                    element: img.tagName + (img.id ? '#' + img.id : ''),
                    severity: 'critical',
                    description: `Image missing alt text: ${img.src}`
                });
            });

            document.querySelectorAll('button:not([aria-label]):not([title]):empty').forEach(button => {
                findings.push({
                    type: 'missing_button_label',
                    element: button.tagName + (button.id ? '#' + button.id : ''),
                    severity: 'high',
                    description: 'Button without accessible label'
                });
            });

            return {
                success: true,
                message: 'Accessibility audit completed using Cleo.js superior analysis',
                findings: findings
            };
        }
    }

    // Initialize the integration when systems are ready
    waitForIntegrationSystems(() => {
        // Create the integration instance
        window.CleoAIIntegration = new CleoAIIntegration();

        // Enhance the main AI Builder UI if it's available
        if (window.AIBuilderIntegration) {
            // Add Cleo integration info to the system status
            const originalGetStatus = window.AIBuilderIntegration.getStatus;
            window.AIBuilderIntegration.getStatus = function() {
                const status = originalGetStatus.call(this);
                status.cleoIntegration = {
                    available: !!window.CleoAIIntegration,
                    activated: window.CleoAIIntegration ? window.CleoAIIntegration.activated : false,
                    version: 'Cleo.js (Chameleon AI-Forge) Genesis Command Center',
                    enhancedFeatures: [
                        'Security Scanning',
                        'API Interception',
                        'Advanced UI Generation',
                        'Accessibility Auditing',
                        'Proactive Automation',
                        'Session Recording',
                        'Component Isolation'
                    ]
                };
                return status;
            };
        }

        console.log('[Cleo Integration] ✅ Integration initialization complete');
    });

})();