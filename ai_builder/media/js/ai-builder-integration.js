/**
 * AI Builder Integration Layer
 *
 * This module integrates the Advanced Task Planner, Styling Engine,
 * and DOM Intelligence into a cohesive intelligent system.
 *
 * @package     AI Builder
 * @version     4.0.0
 * @author      AI Builder Team
 */

(function() {
    'use strict';

    console.log('[AI Builder Integration] Loading...');

    // Wait for all dependencies to load
    function waitForDependencies(callback, timeout = 10000) {
        const startTime = Date.now();

        const checkInterval = setInterval(() => {
            const hasTaskPlanner = !!window.AITaskPlanner;
            const hasStylingEngine = !!window.AdvancedStylingEngine;
            const hasDOMIntelligence = !!window.DOMIntelligence;
            const hasAutomation = !!window.YooThemeAutomation;

            if (hasTaskPlanner && hasStylingEngine && hasDOMIntelligence && hasAutomation) {
                clearInterval(checkInterval);
                console.log('[AI Builder Integration] ✅ All dependencies loaded');
                callback();
            } else if (Date.now() - startTime > timeout) {
                clearInterval(checkInterval);
                console.warn('[AI Builder Integration] ⚠️ Timeout waiting for dependencies');
                console.log('Status:', {
                    hasTaskPlanner,
                    hasStylingEngine,
                    hasDOMIntelligence,
                    hasAutomation
                });
            }
        }, 100);
    }

    // Main Integration Class
    class AIBuilderIntegration {
        constructor() {
            this.taskPlanner = window.AITaskPlanner;
            this.stylingEngine = window.AdvancedStylingEngine;
            this.domIntelligence = window.DOMIntelligence;
            this.automation = window.YooThemeAutomation;
            this.currentTask = null;
            this.taskHistory = [];
        }

        /**
         * Main entry point: process user command with full intelligence
         */
        async processCommand(command, progressCallback) {
            console.group('🤖 AI Builder Integration: Processing Command');
            console.log('Command:', command);

            try {
                // Step 1: Detect intent using Task Planner
                const intent = this.taskPlanner.detectIntent(command);
                console.log('Intent:', intent);

                // Step 2: Decide on execution strategy
                if (intent.requiresPlanning) {
                    // Complex multi-step task
                    return await this.executeComplexTask(command, intent, progressCallback);
                } else if (intent.components.length > 0) {
                    // Simple component addition
                    return await this.executeSimpleTask(command, intent, progressCallback);
                } else {
                    // Fallback to DOM Intelligence for edit/change operations
                    return await this.domIntelligence.processCommand(command);
                }

            } catch (error) {
                console.error('❌ Command processing failed:', error);
                console.groupEnd();
                return {
                    success: false,
                    message: `Error: ${error.message}`,
                    error: error
                };
            }
        }

        /**
         * Execute complex multi-step task
         */
        async executeComplexTask(command, intent, progressCallback) {
            console.log('🚀 Executing Complex Task');

            // Step 1: Create execution plan
            const plan = await this.taskPlanner.planTask(command, intent);
            this.currentTask = plan;

            console.log('📋 Execution Plan:', plan);

            // Notify user
            if (progressCallback) {
                progressCallback({
                    phase: 'planning',
                    message: `Planning ${plan.steps.length} steps...`,
                    plan: plan
                });
            }

            // Step 2: Execute plan with automation engine
            const results = await this.taskPlanner.executePlan(
                plan,
                this.automation,
                (progress) => {
                    if (progressCallback) {
                        progressCallback({
                            phase: 'executing',
                            message: `Step ${progress.current}/${progress.total}: ${progress.step.description}`,
                            progress: progress
                        });
                    }
                }
            );

            // Step 3: Save to history
            this.taskHistory.push({
                command,
                intent,
                plan,
                results,
                timestamp: new Date().toISOString()
            });

            console.groupEnd();

            return {
                success: results.success,
                message: results.success
                    ? `✅ Completed ${results.completedSteps}/${results.totalSteps} steps in ${(results.totalTime / 1000).toFixed(1)}s`
                    : `⚠️ Completed ${results.completedSteps}/${results.totalSteps} steps with ${results.failedSteps} failures`,
                results: results
            };
        }

        /**
         * Execute simple task (single or few components)
         */
        async executeSimpleTask(command, intent, progressCallback) {
            console.log('⚡ Executing Simple Task');

            // Build simple plan
            const plan = {
                id: `simple_${Date.now()}`,
                steps: this.taskPlanner.buildComponentPlan(intent)
            };

            if (progressCallback) {
                progressCallback({
                    phase: 'executing',
                    message: `Adding ${intent.components.join(', ')}...`
                });
            }

            // Execute
            const results = await this.taskPlanner.executePlan(
                plan,
                this.automation,
                (progress) => {
                    if (progressCallback) {
                        progressCallback({
                            phase: 'executing',
                            message: `Step ${progress.current}/${progress.total}`,
                            progress: progress
                        });
                    }
                }
            );

            console.groupEnd();

            return {
                success: results.success,
                message: results.success
                    ? `✅ Added ${intent.components.join(', ')}`
                    : `⚠️ Partial success: ${results.completedSteps}/${results.totalSteps} steps completed`,
                results: results
            };
        }

        /**
         * Get intelligent suggestions based on current page state
         */
        async getSuggestions() {
            console.log('💡 Generating Intelligent Suggestions');

            // Scan current page
            const pageContext = this.domIntelligence.scanPage();

            const suggestions = [];

            // Analyze what's missing
            const elementCount = pageContext.elements.length;
            const hasHero = pageContext.elements.some(el => el.semanticContext.role === 'hero');
            const hasFeatures = pageContext.elements.some(el => el.type.includes('grid'));
            const hasCTA = pageContext.elements.some(el => el.type === 'button');

            if (elementCount === 0) {
                suggestions.push({
                    command: 'create a complete landing page',
                    reason: 'Page is empty - perfect for a full layout',
                    complexity: 'high',
                    icon: '🚀'
                });
            } else {
                if (!hasHero) {
                    suggestions.push({
                        command: 'add a hero section',
                        reason: 'No hero section detected',
                        complexity: 'medium',
                        icon: '🦸'
                    });
                }
                if (!hasFeatures) {
                    suggestions.push({
                        command: 'add a features section with 3 cards',
                        reason: 'No feature grid found',
                        complexity: 'medium',
                        icon: '🎯'
                    });
                }
                if (!hasCTA) {
                    suggestions.push({
                        command: 'add a call to action section',
                        reason: 'No clear call-to-action',
                        complexity: 'low',
                        icon: '📣'
                    });
                }
            }

            // Always suggest advanced options
            suggestions.push({
                command: 'add pricing table with 3 tiers',
                reason: 'Great for SaaS/subscription sites',
                complexity: 'high',
                icon: '💰'
            });

            suggestions.push({
                command: 'add testimonials section',
                reason: 'Build trust with social proof',
                complexity: 'medium',
                icon: '💬'
            });

            return suggestions;
        }

        /**
         * Preview what a command will do (without executing)
         */
        async previewCommand(command) {
            console.log('👁️ Previewing Command:', command);

            const intent = this.taskPlanner.detectIntent(command);

            if (intent.requiresPlanning) {
                const plan = await this.taskPlanner.planTask(command, intent);

                return {
                    type: 'complex',
                    description: intent.description || 'Multi-step operation',
                    steps: plan.steps.map(s => s.description),
                    estimatedTime: `${(plan.estimatedTime / 1000).toFixed(1)}s`,
                    riskLevel: plan.riskLevel,
                    elementsToCreate: plan.steps.length
                };
            } else if (intent.components.length > 0) {
                return {
                    type: 'simple',
                    description: `Add ${intent.components.join(', ')}`,
                    steps: intent.components.map(c => `Add ${c}`),
                    estimatedTime: `${intent.components.length * 2}s`,
                    riskLevel: 'low',
                    elementsToCreate: intent.components.length
                };
            } else {
                return {
                    type: 'edit',
                    description: 'Edit existing element',
                    steps: ['Find element', 'Apply changes'],
                    estimatedTime: '3s',
                    riskLevel: 'low',
                    elementsToCreate: 0
                };
            }
        }

        /**
         * Cancel current task
         */
        cancelCurrentTask() {
            if (this.currentTask) {
                console.log('🛑 Cancelling task:', this.currentTask.id);
                this.currentTask = null;
                return true;
            }
            return false;
        }

        /**
         * Get task history
         */
        getHistory(limit = 10) {
            return this.taskHistory.slice(-limit).reverse();
        }

        /**
         * Clear history
         */
        clearHistory() {
            this.taskHistory = [];
        }

        /**
         * Export history
         */
        exportHistory() {
            return JSON.stringify(this.taskHistory, null, 2);
        }

        /**
         * Get system status and capabilities
         */
        getStatus() {
            return {
                ready: !!(this.taskPlanner && this.stylingEngine && this.domIntelligence && this.automation),
                components: {
                    taskPlanner: !!this.taskPlanner,
                    stylingEngine: !!this.stylingEngine,
                    domIntelligence: !!this.domIntelligence,
                    automation: !!this.automation
                },
                currentTask: this.currentTask ? {
                    id: this.currentTask.id,
                    steps: this.currentTask.steps.length
                } : null,
                historyCount: this.taskHistory.length,
                capabilities: {
                    complexLayouts: true,
                    multiStepTasks: true,
                    intelligentStyling: true,
                    naturalLanguage: true,
                    errorRecovery: true,
                    contextAwareness: true
                }
            };
        }
    }

    // Initialize when dependencies are ready
    waitForDependencies(() => {
        window.AIBuilderIntegration = new AIBuilderIntegration();
        console.log('✅ AI Builder Integration Ready');
        console.log('Status:', window.AIBuilderIntegration.getStatus());

        // Dispatch custom event to notify UI
        window.dispatchEvent(new CustomEvent('ai-builder-ready', {
            detail: window.AIBuilderIntegration.getStatus()
        }));
    });

})();
