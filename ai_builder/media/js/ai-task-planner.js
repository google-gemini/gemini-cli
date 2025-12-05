/**
 * AI Task Planner - Advanced Multi-Step Task Intelligence
 *
 * This module provides intelligent task planning, breakdown, and execution
 * for complex multi-step operations that require coordinated actions.
 *
 * @package     AI Builder
 * @version     4.0.0
 * @author      AI Builder Team
 */

(function() {
    'use strict';

    // ============================================================================
    // ADVANCED TASK PLANNER
    // ============================================================================

    const AITaskPlanner = {

        /**
         * Complex command patterns that need intelligent breakdown
         */
        COMPLEX_PATTERNS: {
            // Layout patterns
            'hero_section': {
                keywords: ['hero', 'hero section', 'landing section', 'header section'],
                template: 'create_hero_layout',
                description: 'Full hero section with heading, text, and CTA',
                complexity: 'high'
            },
            'feature_grid': {
                keywords: ['feature grid', 'features section', 'benefits grid'],
                template: 'create_feature_grid',
                description: '3-column feature cards with icons',
                complexity: 'medium'
            },
            'pricing_table': {
                keywords: ['pricing', 'pricing table', 'price plans', 'subscription plans'],
                template: 'create_pricing_table',
                description: 'Multi-tier pricing comparison',
                complexity: 'high'
            },
            'testimonial_section': {
                keywords: ['testimonials', 'reviews', 'customer feedback'],
                template: 'create_testimonial_section',
                description: 'Customer testimonials with ratings',
                complexity: 'medium'
            },
            'cta_section': {
                keywords: ['call to action', 'cta', 'signup section'],
                template: 'create_cta_section',
                description: 'Call-to-action with compelling copy',
                complexity: 'low'
            },
            'contact_form': {
                keywords: ['contact form', 'form', 'inquiry form'],
                template: 'create_contact_form',
                description: 'Contact form with fields and validation',
                complexity: 'medium'
            },
            'landing_page': {
                keywords: ['landing page', 'complete page', 'full page layout'],
                template: 'create_landing_page',
                description: 'Complete landing page with multiple sections',
                complexity: 'very_high'
            }
        },

        /**
         * Intent detection with context awareness
         */
        detectIntent(command) {
            console.group('🧠 AI Task Planner: Detecting Intent');
            console.log('Command:', command);

            const lower = command.toLowerCase();
            const intent = {
                type: 'unknown',
                complexity: 'simple',
                requiresPlanning: false,
                template: null,
                components: [],
                context: {},
                confidence: 0
            };

            // Check for complex patterns first
            for (const [patternKey, pattern] of Object.entries(this.COMPLEX_PATTERNS)) {
                for (const keyword of pattern.keywords) {
                    if (lower.includes(keyword)) {
                        intent.type = patternKey;
                        intent.complexity = pattern.complexity;
                        intent.requiresPlanning = true;
                        intent.template = pattern.template;
                        intent.description = pattern.description;
                        intent.confidence = 90;
                        console.log('✅ Matched complex pattern:', patternKey);
                        console.groupEnd();
                        return intent;
                    }
                }
            }

            // Extract components mentioned
            const componentKeywords = {
                'headline': ['headline', 'heading', 'title', 'h1', 'h2', 'h3'],
                'text': ['text', 'paragraph', 'description', 'copy'],
                'button': ['button', 'cta', 'call to action', 'btn'],
                'image': ['image', 'picture', 'photo', 'img'],
                'section': ['section', 'container', 'block'],
                'grid': ['grid', 'columns', 'layout'],
                'icon': ['icon', 'symbol'],
                'divider': ['divider', 'separator', 'line']
            };

            for (const [component, keywords] of Object.entries(componentKeywords)) {
                if (keywords.some(kw => lower.includes(kw))) {
                    intent.components.push(component);
                }
            }

            // Multi-component detection
            if (intent.components.length > 2) {
                intent.requiresPlanning = true;
                intent.complexity = 'medium';
                intent.confidence = 70;
                console.log('✅ Multi-component command detected:', intent.components);
            } else if (intent.components.length > 0) {
                intent.complexity = 'simple';
                intent.confidence = 50;
                console.log('✅ Simple component command:', intent.components);
            }

            // Extract styling/positioning context
            intent.context = this.extractContext(command);

            console.log('Final Intent:', intent);
            console.groupEnd();
            return intent;
        },

        /**
         * Extract contextual information from command
         */
        extractContext(command) {
            const context = {
                style: null,
                position: null,
                size: null,
                color: null,
                animation: null,
                alignment: null
            };

            const lower = command.toLowerCase();

            // Style detection
            if (lower.match(/primary|main|bold|strong/)) context.style = 'primary';
            if (lower.match(/secondary|subtle|muted/)) context.style = 'secondary';
            if (lower.match(/dark|black/)) context.style = 'dark';
            if (lower.match(/light|white/)) context.style = 'light';

            // Position detection
            if (lower.match(/top|header|above/)) context.position = 'top';
            if (lower.match(/bottom|footer|below/)) context.position = 'bottom';
            if (lower.match(/center|middle|centered/)) context.position = 'center';
            if (lower.match(/left/)) context.position = 'left';
            if (lower.match(/right/)) context.position = 'right';

            // Size detection
            if (lower.match(/large|big|huge|xlarge/)) context.size = 'large';
            if (lower.match(/small|tiny|compact/)) context.size = 'small';
            if (lower.match(/medium|normal/)) context.size = 'medium';

            // Color extraction (simple)
            const colorMatch = lower.match(/\b(blue|red|green|yellow|purple|orange|pink|gray|grey)\b/);
            if (colorMatch) context.color = colorMatch[1];

            // Animation detection
            if (lower.match(/fade|fadeIn|animate/)) context.animation = 'fade';
            if (lower.match(/slide|slideIn/)) context.animation = 'slide';
            if (lower.match(/scale|scaleUp/)) context.animation = 'scale';

            // Alignment
            if (lower.match(/center|centered/)) context.alignment = 'center';
            if (lower.match(/left-aligned|align left/)) context.alignment = 'left';
            if (lower.match(/right-aligned|align right/)) context.alignment = 'right';

            return context;
        },

        /**
         * Plan complex task execution
         */
        async planTask(command, intent) {
            console.group('📋 AI Task Planner: Creating Execution Plan');
            console.log('Intent:', intent);

            const plan = {
                id: this.generateTaskId(),
                command: command,
                intent: intent,
                steps: [],
                dependencies: [],
                estimatedTime: 0,
                riskLevel: 'low'
            };

            // If we have a template, use it
            if (intent.template && this[intent.template]) {
                plan.steps = await this[intent.template](command, intent);
            }
            // Otherwise, build plan from components
            else if (intent.components.length > 0) {
                plan.steps = this.buildComponentPlan(intent);
            }
            // Fallback to simple parsing
            else {
                plan.steps = [{
                    id: 1,
                    action: 'parse_and_execute',
                    description: 'Execute using basic parser',
                    handler: 'basicParser',
                    params: { command }
                }];
            }

            // Calculate dependencies
            plan.dependencies = this.analyzeDependencies(plan.steps);

            // Estimate time
            plan.estimatedTime = plan.steps.length * 2000; // 2s per step average

            // Risk assessment
            plan.riskLevel = this.assessRisk(plan);

            console.log('✅ Execution Plan Created:', plan);
            console.groupEnd();
            return plan;
        },

        /**
         * Template: Create Hero Section
         */
        async create_hero_layout(command, intent) {
            console.log('🎨 Building Hero Section Template');

            // Extract specific text from command
            const headlineMatch = command.match(/(?:headline|title|heading)(?:\s+(?:that|:))?\s*[""']?([^"""]+)[""']?/i);
            const textMatch = command.match(/(?:text|description|copy)(?:\s+(?:that|:))?\s*[""']?([^"""]+)[""']?/i);
            const buttonMatch = command.match(/(?:button|cta)(?:\s+(?:that says|:))?\s*[""']?([^"""]+)[""']?/i);

            const headlineText = headlineMatch ? headlineMatch[1].trim() : 'Transform Your Vision Into Reality';
            const descriptionText = textMatch ? textMatch[1].trim() : 'Elevate your brand with cutting-edge design and technology.';
            const buttonText = buttonMatch ? buttonMatch[1].trim() : 'Get Started Today';

            return [
                {
                    id: 1,
                    action: 'add_section',
                    description: 'Create hero section container',
                    handler: 'addElement',
                    params: {
                        elementType: 'section',
                        text: '',
                        style: intent.context.style || 'primary'
                    },
                    waitAfter: 1500
                },
                {
                    id: 2,
                    action: 'add_headline',
                    description: `Add hero headline: "${headlineText}"`,
                    handler: 'addElement',
                    params: {
                        elementType: 'headline',
                        text: headlineText
                    },
                    dependsOn: [1],
                    waitAfter: 1000
                },
                {
                    id: 3,
                    action: 'add_text',
                    description: `Add description: "${descriptionText}"`,
                    handler: 'addElement',
                    params: {
                        elementType: 'text',
                        text: descriptionText
                    },
                    dependsOn: [2],
                    waitAfter: 1000
                },
                {
                    id: 4,
                    action: 'add_button',
                    description: `Add CTA button: "${buttonText}"`,
                    handler: 'addElement',
                    params: {
                        elementType: 'button',
                        text: buttonText
                    },
                    dependsOn: [3],
                    waitAfter: 1000
                }
            ];
        },

        /**
         * Template: Create Feature Grid
         */
        async create_feature_grid(command, intent) {
            console.log('🎯 Building Feature Grid Template');

            // Extract number of features (default 3)
            const numberMatch = command.match(/(\d+)\s+(?:features|cards|items)/i);
            const featureCount = numberMatch ? parseInt(numberMatch[1]) : 3;

            const steps = [
                {
                    id: 1,
                    action: 'add_section',
                    description: 'Create features section',
                    handler: 'addElement',
                    params: {
                        elementType: 'section',
                        text: '',
                        style: 'default'
                    },
                    waitAfter: 1500
                },
                {
                    id: 2,
                    action: 'add_headline',
                    description: 'Add section headline',
                    handler: 'addElement',
                    params: {
                        elementType: 'headline',
                        text: 'Our Key Features'
                    },
                    dependsOn: [1],
                    waitAfter: 1000
                }
            ];

            // Add feature cards
            for (let i = 0; i < Math.min(featureCount, 6); i++) {
                steps.push({
                    id: steps.length + 1,
                    action: `add_feature_${i + 1}`,
                    description: `Add feature card ${i + 1}`,
                    handler: 'addElement',
                    params: {
                        elementType: 'text',
                        text: `Feature ${i + 1}: Description goes here`
                    },
                    dependsOn: [2],
                    waitAfter: 800
                });
            }

            return steps;
        },

        /**
         * Template: Create Pricing Table
         */
        async create_pricing_table(command, intent) {
            console.log('💰 Building Pricing Table Template');

            // Extract tier count (default 3)
            const tierMatch = command.match(/(\d+)\s+(?:tiers|plans|options)/i);
            const tierCount = tierMatch ? parseInt(tierMatch[1]) : 3;

            const tiers = [
                { name: 'Starter', price: '$29' },
                { name: 'Professional', price: '$79' },
                { name: 'Enterprise', price: 'Custom' }
            ];

            const steps = [
                {
                    id: 1,
                    action: 'add_section',
                    description: 'Create pricing section',
                    handler: 'addElement',
                    params: {
                        elementType: 'section',
                        text: ''
                    },
                    waitAfter: 1500
                },
                {
                    id: 2,
                    action: 'add_headline',
                    description: 'Add pricing headline',
                    handler: 'addElement',
                    params: {
                        elementType: 'headline',
                        text: 'Choose Your Perfect Plan'
                    },
                    dependsOn: [1],
                    waitAfter: 1000
                }
            ];

            // Add pricing tiers
            for (let i = 0; i < Math.min(tierCount, tiers.length); i++) {
                const tier = tiers[i];
                steps.push({
                    id: steps.length + 1,
                    action: `add_pricing_tier_${i + 1}`,
                    description: `Add ${tier.name} tier`,
                    handler: 'addElement',
                    params: {
                        elementType: 'text',
                        text: `${tier.name} - ${tier.price}/month`
                    },
                    dependsOn: [2],
                    waitAfter: 1000
                });
            }

            return steps;
        },

        /**
         * Template: Create Complete Landing Page
         */
        async create_landing_page(command, intent) {
            console.log('🚀 Building Complete Landing Page Template');

            return [
                {
                    id: 1,
                    action: 'create_hero',
                    description: 'Build hero section',
                    handler: 'executeTemplate',
                    params: {
                        template: 'create_hero_layout',
                        command: 'create hero section'
                    },
                    waitAfter: 6000
                },
                {
                    id: 2,
                    action: 'create_features',
                    description: 'Build features section',
                    handler: 'executeTemplate',
                    params: {
                        template: 'create_feature_grid',
                        command: 'create 3 features'
                    },
                    dependsOn: [1],
                    waitAfter: 5000
                },
                {
                    id: 3,
                    action: 'create_testimonials',
                    description: 'Build testimonials section',
                    handler: 'executeTemplate',
                    params: {
                        template: 'create_testimonial_section',
                        command: 'create testimonials'
                    },
                    dependsOn: [2],
                    waitAfter: 4000
                },
                {
                    id: 4,
                    action: 'create_pricing',
                    description: 'Build pricing section',
                    handler: 'executeTemplate',
                    params: {
                        template: 'create_pricing_table',
                        command: 'create pricing table'
                    },
                    dependsOn: [3],
                    waitAfter: 5000
                },
                {
                    id: 5,
                    action: 'create_cta',
                    description: 'Build final CTA',
                    handler: 'executeTemplate',
                    params: {
                        template: 'create_cta_section',
                        command: 'create call to action'
                    },
                    dependsOn: [4],
                    waitAfter: 3000
                }
            ];
        },

        /**
         * Template: Create Testimonial Section
         */
        async create_testimonial_section(command, intent) {
            console.log('💬 Building Testimonial Section Template');

            return [
                {
                    id: 1,
                    action: 'add_section',
                    description: 'Create testimonials section',
                    handler: 'addElement',
                    params: {
                        elementType: 'section',
                        text: ''
                    },
                    waitAfter: 1500
                },
                {
                    id: 2,
                    action: 'add_headline',
                    description: 'Add testimonials headline',
                    handler: 'addElement',
                    params: {
                        elementType: 'headline',
                        text: 'What Our Customers Say'
                    },
                    dependsOn: [1],
                    waitAfter: 1000
                },
                {
                    id: 3,
                    action: 'add_testimonial_1',
                    description: 'Add first testimonial',
                    handler: 'addElement',
                    params: {
                        elementType: 'text',
                        text: '"This product changed my life!" - Customer A'
                    },
                    dependsOn: [2],
                    waitAfter: 1000
                },
                {
                    id: 4,
                    action: 'add_testimonial_2',
                    description: 'Add second testimonial',
                    handler: 'addElement',
                    params: {
                        elementType: 'text',
                        text: '"Absolutely amazing experience!" - Customer B'
                    },
                    dependsOn: [2],
                    waitAfter: 1000
                }
            ];
        },

        /**
         * Template: Create CTA Section
         */
        async create_cta_section(command, intent) {
            console.log('📣 Building CTA Section Template');

            const buttonText = command.match(/button(?:\s+that says)?\s*[""']?([^"""]+)[""']?/i);
            const ctaText = buttonText ? buttonText[1].trim() : 'Get Started Now';

            return [
                {
                    id: 1,
                    action: 'add_section',
                    description: 'Create CTA section',
                    handler: 'addElement',
                    params: {
                        elementType: 'section',
                        text: '',
                        style: 'primary'
                    },
                    waitAfter: 1500
                },
                {
                    id: 2,
                    action: 'add_cta_headline',
                    description: 'Add CTA headline',
                    handler: 'addElement',
                    params: {
                        elementType: 'headline',
                        text: 'Ready to Get Started?'
                    },
                    dependsOn: [1],
                    waitAfter: 1000
                },
                {
                    id: 3,
                    action: 'add_cta_text',
                    description: 'Add CTA description',
                    handler: 'addElement',
                    params: {
                        elementType: 'text',
                        text: 'Join thousands of satisfied customers today.'
                    },
                    dependsOn: [2],
                    waitAfter: 1000
                },
                {
                    id: 4,
                    action: 'add_cta_button',
                    description: `Add CTA button: "${ctaText}"`,
                    handler: 'addElement',
                    params: {
                        elementType: 'button',
                        text: ctaText
                    },
                    dependsOn: [3],
                    waitAfter: 1000
                }
            ];
        },

        /**
         * Build plan from individual components
         */
        buildComponentPlan(intent) {
            const steps = [];
            let stepId = 1;

            // If there's a section, add it first
            if (intent.components.includes('section')) {
                steps.push({
                    id: stepId++,
                    action: 'add_section',
                    description: 'Add section container',
                    handler: 'addElement',
                    params: {
                        elementType: 'section',
                        text: ''
                    },
                    waitAfter: 1500
                });
            }

            // Add other components
            const addOrder = ['headline', 'text', 'image', 'button', 'icon', 'divider'];
            for (const component of addOrder) {
                if (intent.components.includes(component)) {
                    steps.push({
                        id: stepId++,
                        action: `add_${component}`,
                        description: `Add ${component}`,
                        handler: 'addElement',
                        params: {
                            elementType: component,
                            text: component === 'headline' ? 'New Headline' :
                                  component === 'text' ? 'Sample text content' :
                                  component === 'button' ? 'Click Here' : ''
                        },
                        dependsOn: steps.length > 0 ? [steps[steps.length - 1].id] : [],
                        waitAfter: 1000
                    });
                }
            }

            return steps;
        },

        /**
         * Analyze dependencies between steps
         */
        analyzeDependencies(steps) {
            const deps = [];

            steps.forEach(step => {
                if (step.dependsOn && step.dependsOn.length > 0) {
                    step.dependsOn.forEach(depId => {
                        deps.push({
                            step: step.id,
                            dependsOn: depId,
                            type: 'sequential'
                        });
                    });
                }
            });

            return deps;
        },

        /**
         * Assess risk level of plan
         */
        assessRisk(plan) {
            if (plan.steps.length > 10) return 'high';
            if (plan.steps.length > 5) return 'medium';
            if (plan.intent.complexity === 'very_high') return 'high';
            if (plan.intent.complexity === 'high') return 'medium';
            return 'low';
        },

        /**
         * Generate unique task ID
         */
        generateTaskId() {
            return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        },

        /**
         * Execute a planned task
         */
        async executePlan(plan, automationEngine, progressCallback) {
            console.group(`🚀 Executing Plan: ${plan.id}`);
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
                errors: []
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
                        // Execute step based on handler
                        if (step.handler === 'addElement' && automationEngine) {
                            await automationEngine.addElementAndSetText(
                                step.params.elementType,
                                step.params.text || ''
                            );
                        } else if (step.handler === 'executeTemplate') {
                            // Recursive template execution
                            const subPlan = await this.planTask(step.params.command, {
                                template: step.params.template,
                                components: []
                            });
                            await this.executePlan(subPlan, automationEngine, progressCallback);
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
        },

        /**
         * Sleep utility
         */
        sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
    };

    // Make available globally
    window.AITaskPlanner = AITaskPlanner;

    console.log('✅ AI Task Planner loaded');
    console.log('📖 Usage:');
    console.log('  const intent = AITaskPlanner.detectIntent("create a hero section")');
    console.log('  const plan = await AITaskPlanner.planTask(command, intent)');
    console.log('  const results = await AITaskPlanner.executePlan(plan, automationEngine, progressFn)');

})();
