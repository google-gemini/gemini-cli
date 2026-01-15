/**
 * Advanced Styling Engine - Intelligent Layout & Style Management
 *
 * This module provides context-aware styling, positioning, and layout
 * capabilities with intelligent defaults based on element relationships.
 *
 * @package     AI Builder
 * @version     4.0.0
 * @author      AI Builder Team
 */

(function() {
    'use strict';

    // ============================================================================
    // ADVANCED STYLING ENGINE
    // ============================================================================

    const AdvancedStylingEngine = {

        /**
         * Style presets for different element types and contexts
         */
        STYLE_PRESETS: {
            hero: {
                section: {
                    padding: 'xlarge',
                    style: 'primary',
                    text_color: 'light',
                    vertical_align: 'middle',
                    min_height: '600'
                },
                headline: {
                    font_size: '3xlarge',
                    text_align: 'center',
                    margin: 'medium',
                    animation: 'slide-bottom-medium'
                },
                text: {
                    text_size: 'large',
                    text_align: 'center',
                    margin: 'medium'
                },
                button: {
                    style: 'primary',
                    size: 'large',
                    margin: 'medium'
                }
            },
            features: {
                section: {
                    padding: 'large',
                    style: 'default'
                },
                headline: {
                    font_size: 'xlarge',
                    text_align: 'center',
                    margin: 'large'
                },
                grid: {
                    grid_default: '1',
                    grid_small: '2',
                    grid_medium: '3',
                    grid_gutter: 'large',
                    match_height: 'true'
                },
                card: {
                    style: 'card-default',
                    padding: 'default',
                    hover: 'true'
                }
            },
            pricing: {
                section: {
                    padding: 'large',
                    style: 'muted'
                },
                grid: {
                    grid_default: '1',
                    grid_medium: '3',
                    grid_gutter: 'medium',
                    match_height: 'true'
                },
                card: {
                    style: 'card-primary',
                    padding: 'default',
                    text_align: 'center'
                },
                button: {
                    style: 'primary',
                    fullwidth: 'true',
                    size: 'large'
                }
            },
            testimonials: {
                section: {
                    padding: 'large',
                    style: 'primary',
                    text_color: 'light'
                },
                slider: {
                    autoplay: 'true',
                    center: 'true',
                    finite: 'false'
                }
            },
            cta: {
                section: {
                    padding: 'large',
                    style: 'secondary',
                    text_align: 'center'
                },
                headline: {
                    font_size: 'xlarge',
                    margin: 'medium'
                },
                button: {
                    style: 'primary',
                    size: 'large',
                    margin: 'medium'
                }
            }
        },

        /**
         * Color schemes for different moods/brands
         */
        COLOR_SCHEMES: {
            professional: {
                primary: '#2C3E50',
                secondary: '#34495E',
                accent: '#3498DB',
                text_light: '#ECF0F1',
                text_dark: '#2C3E50'
            },
            vibrant: {
                primary: '#E74C3C',
                secondary: '#8E44AD',
                accent: '#F39C12',
                text_light: '#FFFFFF',
                text_dark: '#2C3E50'
            },
            modern: {
                primary: '#1ABC9C',
                secondary: '#16A085',
                accent: '#E67E22',
                text_light: '#FFFFFF',
                text_dark: '#2C3E50'
            },
            elegant: {
                primary: '#34495E',
                secondary: '#7F8C8D',
                accent: '#D4AF37',
                text_light: '#ECF0F1',
                text_dark: '#2C3E50'
            }
        },

        /**
         * Responsive breakpoints and sizing
         */
        BREAKPOINTS: {
            small: '640px',
            medium: '960px',
            large: '1200px',
            xlarge: '1600px'
        },

        /**
         * Spacing scale (consistent with YOOtheme)
         */
        SPACING: {
            none: '0',
            small: '20px',
            default: '40px',
            medium: '60px',
            large: '80px',
            xlarge: '120px'
        },

        /**
         * Apply intelligent styling based on element type and context
         */
        applyIntelligentStyling(element, context = {}) {
            console.group('🎨 Applying Intelligent Styling');
            console.log('Element:', element);
            console.log('Context:', context);

            const styled = { ...element };

            // Determine style preset based on context
            let presetKey = context.layout || this.detectLayoutType(context);
            let preset = this.STYLE_PRESETS[presetKey];

            if (preset && preset[element.type]) {
                console.log(`✅ Applying preset: ${presetKey} → ${element.type}`);
                styled.props = {
                    ...styled.props,
                    ...preset[element.type]
                };
            }

            // Apply contextual overrides
            if (context.style) {
                styled.props.style = context.style;
            }
            if (context.size) {
                styled.props = this.applySizing(styled.props, context.size);
            }
            if (context.alignment) {
                styled.props.text_align = context.alignment;
            }
            if (context.animation) {
                styled.props.animation = context.animation;
            }
            if (context.color) {
                styled.props = this.applyColorScheme(styled.props, context.color);
            }

            // Apply responsive settings
            styled.props = this.applyResponsiveDefaults(styled.props, element.type);

            console.log('✅ Styled Element:', styled);
            console.groupEnd();
            return styled;
        },

        /**
         * Detect layout type from context clues
         */
        detectLayoutType(context) {
            if (context.parent === 'hero' || context.isHero) return 'hero';
            if (context.parent === 'features' || context.hasGrid) return 'features';
            if (context.parent === 'pricing' || context.isPricing) return 'pricing';
            if (context.parent === 'testimonials') return 'testimonials';
            if (context.parent === 'cta' || context.isCTA) return 'cta';
            return 'default';
        },

        /**
         * Apply sizing to props
         */
        applySizing(props, size) {
            const sizeMap = {
                large: {
                    padding: 'xlarge',
                    font_size: 'xlarge',
                    button_size: 'large'
                },
                medium: {
                    padding: 'large',
                    font_size: 'large',
                    button_size: 'default'
                },
                small: {
                    padding: 'default',
                    font_size: 'default',
                    button_size: 'small'
                }
            };

            const sizeProps = sizeMap[size] || sizeMap.medium;

            if (props.padding === undefined) props.padding = sizeProps.padding;
            if (props.font_size === undefined) props.font_size = sizeProps.font_size;
            if (props.size === undefined && props.button_size) {
                props.size = sizeProps.button_size;
            }

            return props;
        },

        /**
         * Apply color scheme
         */
        applyColorScheme(props, schemeName) {
            const scheme = this.COLOR_SCHEMES[schemeName];
            if (!scheme) return props;

            // Apply colors based on element role
            if (props.style === 'primary') {
                props.background = scheme.primary;
                props.text_color = scheme.text_light;
            } else if (props.style === 'secondary') {
                props.background = scheme.secondary;
                props.text_color = scheme.text_light;
            }

            return props;
        },

        /**
         * Apply responsive defaults
         */
        applyResponsiveDefaults(props, elementType) {
            // Grid responsive defaults
            if (elementType === 'grid' && !props.grid_default) {
                props.grid_default = '1';
                props.grid_small = '2';
                props.grid_medium = '3';
                props.grid_large = '4';
                props.grid_gutter = 'large';
            }

            // Column width defaults
            if (elementType === 'column' && !props.width_medium) {
                props.width_medium = '1-2'; // Half width on medium+
            }

            // Image loading
            if (elementType === 'image' && !props.loading) {
                props.loading = 'lazy'; // Lazy load by default
            }

            return props;
        },

        /**
         * Generate complete styled layout
         */
        generateStyledLayout(layoutType, components, options = {}) {
            console.group(`🏗️ Generating Styled Layout: ${layoutType}`);

            const layout = {
                type: 'section',
                props: {},
                children: []
            };

            // Apply section styling based on layout type
            const preset = this.STYLE_PRESETS[layoutType];
            if (preset && preset.section) {
                layout.props = { ...preset.section };
            }

            // Apply user options
            if (options.style) layout.props.style = options.style;
            if (options.padding) layout.props.padding = options.padding;
            if (options.background) layout.props.background_image = options.background;

            // Add components
            components.forEach(component => {
                const styledComponent = this.applyIntelligentStyling(component, {
                    layout: layoutType,
                    parent: layoutType,
                    ...options
                });
                layout.children.push(styledComponent);
            });

            console.log('✅ Generated Layout:', layout);
            console.groupEnd();
            return layout;
        },

        /**
         * Calculate optimal spacing between elements
         */
        calculateSpacing(previousElement, currentElement, context = {}) {
            // Tight spacing for related items
            if (this.areRelated(previousElement, currentElement)) {
                return 'small';
            }

            // Medium spacing for grouped content
            if (previousElement?.type === currentElement?.type) {
                return 'default';
            }

            // Large spacing for section breaks
            if (previousElement?.type === 'section' || currentElement?.type === 'section') {
                return 'large';
            }

            return 'default';
        },

        /**
         * Check if elements are semantically related
         */
        areRelated(elem1, elem2) {
            const relatedPairs = [
                ['headline', 'text'],
                ['text', 'button'],
                ['icon', 'headline'],
                ['image', 'text']
            ];

            if (!elem1 || !elem2) return false;

            return relatedPairs.some(pair =>
                (elem1.type === pair[0] && elem2.type === pair[1]) ||
                (elem1.type === pair[1] && elem2.type === pair[0])
            );
        },

        /**
         * Generate animation sequences
         */
        generateAnimationSequence(elements, type = 'stagger') {
            const animations = {
                fade: ['fade', 'scale-up', 'slide-bottom'],
                slide: ['slide-left', 'slide-right', 'slide-bottom', 'slide-top'],
                scale: ['scale-up', 'scale-down'],
                stagger: ['slide-bottom-small', 'slide-bottom-medium', 'fade']
            };

            const sequence = animations[type] || animations.stagger;

            return elements.map((element, index) => ({
                ...element,
                props: {
                    ...element.props,
                    animation: sequence[index % sequence.length],
                    animation_delay: (index * 100).toString()
                }
            }));
        },

        /**
         * Apply accessibility enhancements
         */
        applyAccessibility(element) {
            const enhanced = { ...element };

            // Add ARIA labels for buttons
            if (element.type === 'button' && element.props.content) {
                enhanced.props.aria_label = element.props.content;
            }

            // Add alt text reminders for images
            if (element.type === 'image' && !element.props.alt) {
                enhanced.props.alt = 'Please add descriptive alt text';
            }

            // Add proper heading hierarchy
            if (element.type === 'headline' && !element.props.level) {
                enhanced.props.level = 'h2'; // Default to h2
            }

            // Add focus indicators for interactive elements
            if (['button', 'form', 'search'].includes(element.type)) {
                enhanced.props.tabindex = '0';
            }

            return enhanced;
        },

        /**
         * Optimize for performance
         */
        optimizeForPerformance(element) {
            const optimized = { ...element };

            // Lazy load images
            if (element.type === 'image') {
                optimized.props.loading = 'lazy';
            }

            // Defer videos
            if (element.type === 'video') {
                optimized.props.preload = 'metadata';
            }

            // Optimize sliders
            if (element.type === 'slider') {
                optimized.props.lazy_load = 'true';
            }

            return optimized;
        },

        /**
         * Generate mobile-first responsive config
         */
        generateResponsiveConfig(element, breakpoints = {}) {
            const config = { ...element };

            // Default mobile behavior
            if (element.type === 'grid') {
                config.props.grid_default = breakpoints.mobile || '1';
                config.props.grid_small = breakpoints.small || '2';
                config.props.grid_medium = breakpoints.medium || '3';
                config.props.grid_large = breakpoints.large || '4';
            }

            // Column stacking
            if (element.type === 'column') {
                config.props.width_small = breakpoints.small || '1-1';
                config.props.width_medium = breakpoints.medium || '1-2';
                config.props.width_large = breakpoints.large || '1-3';
            }

            // Text sizing
            if (element.type === 'headline' || element.type === 'text') {
                config.props.text_size_small = 'default';
                config.props.text_size_medium = 'large';
                config.props.text_size_large = 'xlarge';
            }

            return config;
        },

        /**
         * Apply brand consistency
         */
        applyBrandConsistency(elements, brandConfig = {}) {
            const {
                primaryColor = '#4285F4',
                secondaryColor = '#34A853',
                fontFamily = 'system-ui',
                buttonStyle = 'primary'
            } = brandConfig;

            return elements.map(element => {
                const branded = { ...element };

                // Apply brand colors
                if (element.props?.style === 'primary') {
                    branded.props.background = primaryColor;
                }
                if (element.props?.style === 'secondary') {
                    branded.props.background = secondaryColor;
                }

                // Apply brand fonts
                if (['headline', 'text'].includes(element.type)) {
                    branded.props.font_family = fontFamily;
                }

                // Apply brand button style
                if (element.type === 'button') {
                    branded.props.style = buttonStyle;
                }

                return branded;
            });
        }
    };

    // Make available globally
    window.AdvancedStylingEngine = AdvancedStylingEngine;

    console.log('✅ Advanced Styling Engine loaded');
    console.log('📖 Usage:');
    console.log('  const styled = AdvancedStylingEngine.applyIntelligentStyling(element, context)');
    console.log('  const layout = AdvancedStylingEngine.generateStyledLayout("hero", components)');

})();
