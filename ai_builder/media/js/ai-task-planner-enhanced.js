/**
 * Enhanced AI Task Planner with Cleo.js Integration
 *
 * This module enhances the existing AI Task Planner with Cleo.js capabilities
 * to provide more intelligent task planning and execution for YOOtheme builder.
 *
 * @package     AI Builder
 * @version     4.1.0
 * @author      AI Builder Team with Cleo.js Integration
 */

(function() {
    'use strict';

    // Wait for both systems to be available before enhancing
    function waitForSystems(callback) {
        const checkInterval = setInterval(() => {
            if (window.AITaskPlanner && window.CleoAIIntegration) {
                clearInterval(checkInterval);
                callback();
            }
        }, 100);
    }

    // Enhance the AITaskPlanner when systems are ready
    waitForSystems(() => {
        console.log('[Cleo Task Planner Enhancement] Enhancing AITaskPlanner with Cleo.js capabilities');

        // Store original templates and add Cleo-specific templates
        const originalComplexPatterns = { ...window.AITaskPlanner.COMPLEX_PATTERNS };

        // Add Cleo.js enhanced patterns
        Object.assign(window.AITaskPlanner.COMPLEX_PATTERNS, {
            security_audit: {
                keywords: ['security', 'vulnerability', 'scan for issues', 'find security problems', 'security audit'],
                template: 'execute_security_audit',
                description: 'Run comprehensive security and vulnerability audit',
                complexity: 'high'
            },
            accessibility_review: {
                keywords: ['accessibility', 'a11y', 'wcag', 'screen reader', 'accessibility review'],
                template: 'execute_accessibility_review',
                description: 'Comprehensive accessibility compliance check',
                complexity: 'medium'
            },
            performance_analysis: {
                keywords: ['performance', 'speed', 'optimization', 'performance audit'],
                template: 'execute_performance_analysis',
                description: 'Analyze and optimize page performance',
                complexity: 'medium'
            },
            component_isolation: {
                keywords: ['isolate component', 'extract component', 'component isolation', 'reuse component'],
                template: 'execute_component_isolation',
                description: 'Select, isolate and prepare components for reuse',
                complexity: 'low'
            },
            ui_generation: {
                keywords: ['generate ui', 'create component', 'build ui element', 'make form', 'create card'],
                template: 'execute_ui_generation',
                description: 'Generate custom UI components using AI',
                complexity: 'medium'
            },
            api_monitoring: {
                keywords: ['api', 'network', 'requests', 'monitor api', 'api intercept'],
                template: 'execute_api_monitoring',
                description: 'Monitor and analyze API calls',
                complexity: 'high'
            },
            automated_workflow: {
                keywords: ['automate', 'record workflow', 'workflow automation', 'record actions', 'playback'],
                template: 'execute_automated_workflow',
                description: 'Record and automate repetitive workflows',
                complexity: 'medium'
            }
        });

        // Enhanced template: Execute Security Audit using Cleo's capabilities
        window.AITaskPlanner.execute_security_audit = async (command, intent) => {
            console.log('[Cleo Task Planner] Building Security Audit Task Template');

            return [
                {
                    id: 1,
                    action: 'run_security_scan',
                    description: 'Run XSS vulnerability scan',
                    handler: 'executeCleoOperation',
                    params: {
                        operation: { type: 'security_scan', method: 'xss' }
                    },
                    waitAfter: 2000
                },
                {
                    id: 2,
                    action: 'run_sql_injection_scan',
                    description: 'Run SQL injection scan',
                    handler: 'executeCleoOperation',
                    params: {
                        operation: { type: 'security_scan', method: 'sqli' }
                    },
                    waitAfter: 2000
                },
                {
                    id: 3,
                    action: 'check_directory_exposure',
                    description: 'Check for exposed directories',
                    handler: 'executeCleoOperation',
                    params: {
                        operation: { type: 'security_scan', method: 'directories' }
                    },
                    waitAfter: 2000
                }
            ];
        };

        // Enhanced template: Execute Accessibility Review
        window.AITaskPlanner.execute_accessibility_review = async (command, intent) => {
            console.log('[Cleo Task Planner] Building Accessibility Review Task Template');

            return [
                {
                    id: 1,
                    action: 'check_alt_text',
                    description: 'Check for missing alt text on images',
                    handler: 'executeCleoOperation',
                    params: {
                        operation: { type: 'accessibility_check', check: 'alt_text' }
                    },
                    waitAfter: 1000
                },
                {
                    id: 2,
                    action: 'check_headings',
                    description: 'Review heading structure',
                    handler: 'executeCleoOperation',
                    params: {
                        operation: { type: 'accessibility_check', check: 'headings' }
                    },
                    waitAfter: 1000
                },
                {
                    id: 3,
                    action: 'check_form_labels',
                    description: 'Verify form labels',
                    handler: 'executeCleoOperation',
                    params: {
                        operation: { type: 'accessibility_check', check: 'form_labels' }
                    },
                    waitAfter: 1000
                }
            ];
        };

        // Enhanced template: Execute Performance Analysis
        window.AITaskPlanner.execute_performance_analysis = async (command, intent) => {
            console.log('[Cleo Task Planner] Building Performance Analysis Task Template');

            return [
                {
                    id: 1,
                    action: 'analyze_load_time',
                    description: 'Analyze page load performance',
                    handler: 'executeCleoOperation',
                    params: {
                        operation: { type: 'performance_analysis', metric: 'load_time' }
                    },
                    waitAfter: 1500
                },
                {
                    id: 2,
                    action: 'check_resources',
                    description: 'Analyze resource usage',
                    handler: 'executeCleoOperation',
                    params: {
                        operation: { type: 'performance_analysis', metric: 'resources' }
                    },
                    waitAfter: 1500
                }
            ];
        };

        // Enhanced template: Execute Component Isolation
        window.AITaskPlanner.execute_component_isolation = async (command, intent) => {
            console.log('[Cleo Task Planner] Building Component Isolation Task Template');

            // Extract component selector from command
            const componentMatch = command.match(/(?:component|element|part) (.+?)\s*(?:for isolation|to extract|to isolate)/i);
            const selector = componentMatch ? componentMatch[1].trim() : 'selected';

            return [
                {
                    id: 1,
                    action: 'identify_component',
                    description: `Identify component: ${selector}`,
                    handler: 'executeCleoOperation',
                    params: {
                        operation: { type: 'select', selector: selector }
                    },
                    waitAfter: 500
                },
                {
                    id: 2,
                    action: 'isolate_component',
                    description: `Isolate component: ${selector}`,
                    handler: 'executeCleoOperation',
                    params: {
                        operation: { type: 'isolate_component', selector: selector }
                    },
                    waitAfter: 1000
                },
                {
                    id: 3,
                    action: 'export_component',
                    description: 'Export isolated component',
                    handler: 'executeCleoOperation',
                    params: {
                        operation: { type: 'export_component', format: 'html' }
                    },
                    waitAfter: 1000
                }
            ];
        };

        // Enhanced template: Execute UI Generation
        window.AITaskPlanner.execute_ui_generation = async (command, intent) => {
            console.log('[Cleo Task Planner] Building UI Generation Task Template');

            // Extract component description from command
            const promptMatch = command.match(/(?:generate|create|build) (.+)$/i);
            const componentPrompt = promptMatch ? promptMatch[1].trim() : 'custom component';

            return [
                {
                    id: 1,
                    action: 'generate_ui_component',
                    description: `Generate ${componentPrompt}`,
                    handler: 'executeCleoOperation',
                    params: {
                        operation: { type: 'generate_ui', prompt: componentPrompt }
                    },
                    waitAfter: 2000
                },
                {
                    id: 2,
                    action: 'style_component',
                    description: 'Apply appropriate styling',
                    handler: 'executeCleoOperation',
                    params: {
                        operation: { type: 'style', style: { margin: '10px' } } // Will be enhanced by Cleo
                    },
                    waitAfter: 1000
                }
            ];
        };

        // Enhanced template: Execute API Monitoring
        window.AITaskPlanner.execute_api_monitoring = async (command, intent) => {
            console.log('[Cleo Task Planner] Building API Monitoring Task Template');

            const urlMatch = command.match(/(?:api|monitor) (.+?)\s*(?:requests|calls)/i);
            const urlPattern = urlMatch ? urlMatch[1].trim() : '.*';

            return [
                {
                    id: 1,
                    action: 'setup_api_monitoring',
                    description: `Setup monitoring for: ${urlPattern}`,
                    handler: 'executeCleoOperation',
                    params: {
                        operation: { type: 'monitor_api', url_regex: urlPattern }
                    },
                    waitAfter: 1000
                },
                {
                    id: 2,
                    action: 'analyze_api_calls',
                    description: 'Analyze captured API calls',
                    handler: 'executeCleoOperation',
                    params: {
                        operation: { type: 'analyze_api', context: 'captured' }
                    },
                    waitAfter: 2000
                }
            ];
        };

        // Enhanced template: Execute Automated Workflow
        window.AITaskPlanner.execute_automated_workflow = async (command, intent) => {
            console.log('[Cleo Task Planner] Building Automated Workflow Task Template');

            return [
                {
                    id: 1,
                    action: 'start_recording',
                    description: 'Begin workflow recording',
                    handler: 'executeCleoOperation',
                    params: {
                        operation: { type: 'automate_workflow', action: 'start_recording' }
                    },
                    waitAfter: 500
                },
                {
                    id: 2,
                    action: 'wait_for_actions',
                    description: 'Wait for user actions',
                    handler: 'waitForUserActions',
                    params: { duration: 10000 }, // Wait 10 seconds for actions
                    waitAfter: 10000
                },
                {
                    id: 3,
                    action: 'stop_recording',
                    description: 'Stop workflow recording',
                    handler: 'executeCleoOperation',
                    params: {
                        operation: { type: 'automate_workflow', action: 'stop_recording' }
                    },
                    waitAfter: 500
                },
                {
                    id: 4,
                    action: 'generate_script',
                    description: 'Generate automation script',
                    handler: 'executeCleoOperation',
                    params: {
                        operation: { type: 'automate_workflow', action: 'get_script' }
                    },
                    waitAfter: 1000
                }
            ];
        };

        // Enhanced executePlan to handle Cleo operations
        const originalExecutePlan = window.AITaskPlanner.executePlan;
        window.AITaskPlanner.executePlan = async function(plan, automationEngine, progressCallback) {
            console.log('[Cleo Task Planner Enhancement] Executing plan with enhanced Cleo.js capabilities');

            // Check if this plan contains Cleo operations
            const hasCleoOperations = plan.steps.some(step => step.handler === 'executeCleoOperation');

            if (hasCleoOperations) {
                return await this.executeCleoPlan(plan, automationEngine, progressCallback);
            }

            // Otherwise, use original execution
            return await originalExecutePlan.call(this, plan, automationEngine, progressCallback);
        };

        // New method to execute plans with Cleo operations
        window.AITaskPlanner.executeCleoPlan = async function(plan, automationEngine, progressCallback) {
            console.group(`🚀 Executing Cleo-Enhanced Plan: ${plan.id}`);
            console.log('Total Steps:', plan.steps.length);
            console.log('Estimated Time:', `${plan.estimatedTime / 1000}s`);

            const results = {
                planId: plan.id,
                totalSteps: plan.steps.length,
                completedSteps: 0,
                failedSteps: 0,
                startTime: Date.now(),
                endTime: null,
                success: false,
                errors: [],
                cleoEnhanced: true
            };

            try {
                for (let i = 0; i < plan.steps.length; i++) {
                    const step = plan.steps[i];

                    console.log(`📌 Step ${step.id}/${plan.steps.length}: ${step.description}`);

                    if (progressCallback) {
                        progressCallback({
                            current: i + 1,
                            total: plan.steps.length,
                            step: step,
                            percentage: Math.round(((i + 1) / plan.steps.length) * 100)
                        });
                    }

                    try {
                        // Handle different step handlers
                        switch (step.handler) {
                            case 'executeCleoOperation':
                                if (window.CleoAIIntegration) {
                                    const result = await window.CleoAIIntegration.executeOperation(step.params.operation);
                                    console.log(`✅ Cleo operation completed:`, result);
                                } else {
                                    throw new Error('CleoAIIntegration not available');
                                }
                                break;

                            case 'addElement':
                                // Use original YOOtheme automation
                                if (automationEngine && typeof automationEngine.addElementAndSetText === 'function') {
                                    await automationEngine.addElementAndSetText(
                                        step.params.elementType,
                                        step.params.text || ''
                                    );
                                } else {
                                    throw new Error('YOOtheme automation not available');
                                }
                                break;

                            case 'executeTemplate':
                                // Recursive template execution
                                const subPlan = await this.planTask(step.params.command, {
                                    template: step.params.template,
                                    components: []
                                });
                                await this.executeCleoPlan(subPlan, automationEngine, progressCallback);
                                break;

                            case 'waitForUserActions':
                                await this.sleep(step.params.duration || 10000);
                                break;

                            default:
                                console.warn('Unknown step handler:', step.handler);
                                break;
                        }

                        results.completedSteps++;

                        // Wait if specified
                        if (step.waitAfter) {
                            await this.sleep(step.waitAfter);
                        }

                        console.log(`✅ Step ${step.id} completed`);

                    } catch (stepError) {
                        console.error(`❌ Step ${step.id} failed:`, stepError);
                        results.failedSteps++;
                        results.errors.push({
                            step: step.id,
                            description: step.description,
                            error: stepError.message
                        });

                        // Decide if we should continue or abort
                        if (step.critical) {
                            throw new Error(`Critical step ${step.id} failed: ${stepError.message}`);
                        }
                    }
                }

                results.success = results.failedSteps === 0;

            } catch (planError) {
                console.error('❌ Plan execution failed:', planError);
                results.success = false;
                results.errors.push({
                    step: 'plan',
                    error: planError.message
                });
            }

            results.endTime = Date.now();
            results.totalTime = results.endTime - results.startTime;

            console.log('📊 Execution Results:', results);
            console.groupEnd();

            return results;
        };

        // Add sleep utility if not already present
        if (!window.AITaskPlanner.sleep) {
            window.AITaskPlanner.sleep = function(ms) {
                return new Promise(resolve => setTimeout(resolve, ms));
            };
        }

        console.log('[Cleo Task Planner Enhancement] ✅ AITaskPlanner successfully enhanced with Cleo.js capabilities');
        console.log('[Cleo Task Planner Enhancement] New templates available:',
            Object.keys(window.AITaskPlanner.COMPLEX_PATTERNS).filter(key =>
                !Object.keys(originalComplexPatterns).includes(key)
            )
        );
    });

})();