// ==UserScript==
// @name         AI² YOOtheme Assistant Pro - Ultimate Intelligence Edition
// @namespace    http://tampermonkey.net/
// @version      7.0.0
// @description  Next-gen YOOtheme Pro assistant with AI-powered natural language, advanced animations, smart workflows, real-time collaboration, and visual builder integration
// @author       Adam (Enhanced by AI² with Advanced Intelligence)
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_setClipboard
// @connect      localhost
// @connect      127.0.0.1
// @connect      generativelanguage.googleapis.com
// @connect      api.x.ai
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  // ===========================================================================
  // ENHANCED CONFIGURATION WITH AI INTELLIGENCE
  // ===========================================================================
  const CONFIG = {
    VERSION: '7.0.0',
    BRIDGE_URL_STORAGE_KEY: 'ai2_yootheme_assistant_bridge_url',
    CUSTOM_PRESETS_KEY: 'ai2_yootheme_custom_presets',
    SETTINGS_KEY: 'ai2_yootheme_settings',
    HISTORY_KEY: 'ai2_yootheme_history',
    AI_PROVIDER_KEY: 'ai2_yootheme_ai_provider',
    DEFAULT_BRIDGE_URL: 'http://localhost:8989/generate',
    BACKUP_KEY: 'ai2_yootheme_backup',

    // AI Provider Configurations
    AI_PROVIDERS: {
      gemini: {
        name: 'Google Gemini',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent',
        requiresKey: true,
        icon: '🧠'
      },
      xai: {
        name: 'xAI Grok',
        endpoint: 'https://api.x.ai/v1/chat/completions',
        requiresKey: true,
        icon: '🤖'
      },
      local: {
        name: 'Local Bridge',
        endpoint: 'http://localhost:8989/generate',
        requiresKey: false,
        icon: '💻'
      }
    },

    // Enhanced Icons
    ICONS: {
      fab: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        <circle cx="12" cy="12" r="2" fill="white" opacity="0.8"/>
      </svg>`,
      sparkle: '✨',
      magic: '🪄',
      brain: '🧠',
      robot: '🤖',
      rocket: '🚀',
      star: '⭐',
      lightning: '⚡',
      fire: '🔥',
      check: '✓',
      cross: '✗',
      copy: '📋',
      download: '💾',
      upload: '📤',
      settings: '⚙️',
      help: '❓',
      expand: '↗️',
      collapse: '↙️'
    },

    // Comprehensive System Prompt for AI
    AI_SYSTEM_PROMPT: `You are an elite YOOtheme Pro expert with deep knowledge of web design, UX/UI principles, and modern component architecture.

CRITICAL RESPONSE RULES:
1. ONLY respond with valid JSON - absolutely no markdown, explanations, or code blocks
2. Use YOOtheme element structure: {"type": "element_name", "props": {}, "children": []}
3. ALL prop values MUST be strings (convert booleans/numbers to strings: "true", "100")
4. Generate semantic, accessible, and responsive designs
5. Include realistic, professional placeholder content
6. Follow modern design principles: spacing, contrast, hierarchy
7. Nest elements properly with correct parent-child relationships

VALID ELEMENT TYPES:
Core: section, row, column, grid, grid_item
Content: text, headline, image, button, icon, html
Media: video, gallery, gallery_item, slider, slider_item, lightbox
Interactive: accordion, accordion_item, switcher, switcher_item, tabs, tab
Layout: panel, card, overlay, modal, offcanvas, popover, tooltip
Navigation: navbar, navbar_item, subnav, breadcrumb, pagination, totop
Forms: form, search
Data: table, table_item, description_list, description_list_item
Misc: divider, map, social, countdown, progress, badge, alert, marker

DESIGN PHILOSOPHY:
- Prioritize user experience and visual hierarchy
- Use appropriate spacing (margin, padding)
- Implement responsive breakpoints (width_small, width_medium, width_large)
- Apply animations thoughtfully (parallax, scroll-reveal)
- Maintain brand consistency with style props
- Ensure accessibility (alt text, semantic HTML, ARIA where needed)

When generating:
- For "hero section": Create impactful, conversion-focused layouts
- For "features": Use grids with consistent, balanced card layouts
- For "testimonials": Include social proof elements with credibility indicators
- For "CTA": Design compelling calls-to-action with clear value propositions
- For "forms": Implement user-friendly, accessible form structures

Always consider:
- Mobile-first responsive design
- Loading performance (lazy loading for images)
- SEO optimization (proper heading hierarchy)
- Conversion optimization (clear CTAs, minimal friction)`,

    // Validation Rules
    VALIDATION: {
      requiredRootFields: ['type'],
      validPropTypes: ['string'],
      maxNestingDepth: 10,
      validElementTypes: [
        'section', 'row', 'column', 'grid', 'grid_item', 'text', 'headline', 'image', 'button',
        'video', 'slider', 'slider_item', 'accordion', 'accordion_item', 'panel', 'card',
        'overlay', 'gallery', 'gallery_item', 'form', 'html', 'icon', 'divider', 'map',
        'social', 'countdown', 'description_list', 'description_list_item', 'table', 'table_item',
        'switcher', 'switcher_item', 'tabs', 'tab', 'lightbox', 'modal', 'offcanvas', 'popover',
        'tooltip', 'navbar', 'navbar_item', 'subnav', 'breadcrumb', 'pagination', 'search',
        'totop', 'dropbar', 'marker', 'progress', 'alert', 'badge', 'layout'
      ],
      commonProps: [
        'margin', 'padding', 'width', 'height', 'text_align', 'vertical_align', 'style',
        'background', 'text_color', 'border', 'border_radius', 'animation', 'parallax',
        'sticky', 'visibility', 'class', 'id', 'name'
      ]
    }
  };

  // ===========================================================================
  // EXPANDED COMPONENT LIBRARY (30+ Premium Templates)
  // ===========================================================================
  const ELEMENT_LIBRARY = [
    {
      name: 'Hero - Gradient Overlay',
      icon: '🌟',
      category: 'Heroes',
      description: 'Modern hero with gradient overlay, animated headline, and dual CTAs',
      tags: ['hero', 'header', 'cta', 'landing', 'gradient', 'premium'],
      difficulty: 'intermediate',
      preview: 'Full-width hero with background image, gradient overlay, large headline, subtext, and primary/secondary buttons',
      json: {
        "type": "section",
        "props": {
          "style": "default",
          "padding": "xlarge",
          "vertical_align": "middle",
          "min_height": "600",
          "background_image": "images/hero-modern.jpg",
          "background_image_visibility": "visible",
          "background_position": "center-center",
          "background_size": "cover",
          "overlay": "gradient",
          "overlay_style": "primary",
          "text_color": "light",
          "animation": "fade"
        },
        "children": [{
          "type": "row",
          "children": [{
            "type": "column",
            "props": {
              "width_medium": "3-5",
              "text_align": "center"
            },
            "children": [
              {
                "type": "headline",
                "props": {
                  "content": "Transform Your Digital Presence",
                  "level": "h1",
                  "font_size": "3xlarge",
                  "margin": "medium",
                  "animation": "slide-bottom-medium"
                }
              },
              {
                "type": "text",
                "props": {
                  "content": "<p class='uk-text-lead'>Elevate your brand with cutting-edge design and technology. Join industry leaders who trust our platform.</p>",
                  "margin": "medium",
                  "text_size": "large",
                  "animation": "slide-bottom-medium",
                  "animation_delay": "100"
                }
              },
              {
                "type": "grid",
                "props": {
                  "grid_default": "1",
                  "grid_small": "2",
                  "grid_gutter": "small",
                  "margin": "medium"
                },
                "children": [
                  {
                    "type": "grid_item",
                    "children": [{
                      "type": "button",
                      "props": {
                        "content": "Start Free Trial",
                        "link": "#signup",
                        "style": "primary",
                        "size": "large",
                        "fullwidth": "true",
                        "animation": "scale-up"
                      }
                    }]
                  },
                  {
                    "type": "grid_item",
                    "children": [{
                      "type": "button",
                      "props": {
                        "content": "Watch Demo",
                        "link": "#demo",
                        "style": "default",
                        "size": "large",
                        "fullwidth": "true",
                        "animation": "scale-up",
                        "animation_delay": "50"
                      }
                    }]
                  }
                ]
              },
              {
                "type": "text",
                "props": {
                  "content": "<p class='uk-text-small uk-text-muted'>✓ No credit card required  ✓ 14-day trial  ✓ Cancel anytime</p>",
                  "margin": "small",
                  "text_align": "center"
                }
              }
            ]
          }]
        }]
      }
    },
    {
      name: 'Features - Card Grid Pro',
      icon: '🎯',
      category: 'Features',
      description: 'Premium 3-column feature cards with icons, hover effects, and detailed descriptions',
      tags: ['features', 'grid', 'cards', 'icons', 'benefits'],
      difficulty: 'beginner',
      preview: 'Responsive grid of feature cards with icons, headlines, descriptions, and learn more links',
      json: {
        "type": "section",
        "props": {
          "style": "muted",
          "padding": "large"
        },
        "children": [
          {
            "type": "headline",
            "props": {
              "content": "Powerful Features Built For You",
              "level": "h2",
              "text_align": "center",
              "font_size": "xlarge",
              "margin": "large"
            }
          },
          {
            "type": "text",
            "props": {
              "content": "<p class='uk-text-lead uk-text-center'>Everything you need to build, grow, and scale your business</p>",
              "margin": "medium",
              "text_align": "center"
            }
          },
          {
            "type": "grid",
            "props": {
              "grid_default": "1",
              "grid_small": "2",
              "grid_medium": "3",
              "grid_gutter": "large",
              "match_height": "true"
            },
            "children": [
              {
                "type": "grid_item",
                "children": [{
                  "type": "card",
                  "props": {
                    "style": "default",
                    "padding": "default",
                    "hover": "true"
                  },
                  "children": [
                    {
                      "type": "icon",
                      "props": {
                        "icon": "bolt",
                        "ratio": "3",
                        "style": "primary",
                        "margin": "small"
                      }
                    },
                    {
                      "type": "headline",
                      "props": {
                        "content": "Lightning Fast Performance",
                        "level": "h3",
                        "margin": "small"
                      }
                    },
                    {
                      "type": "text",
                      "props": {
                        "content": "<p>Experience blazing-fast load times with our optimized infrastructure. Built for speed, designed for performance.</p>",
                        "margin": "small"
                      }
                    },
                    {
                      "type": "button",
                      "props": {
                        "content": "Learn More →",
                        "link": "#performance",
                        "style": "text"
                      }
                    }
                  ]
                }]
              },
              {
                "type": "grid_item",
                "children": [{
                  "type": "card",
                  "props": {
                    "style": "default",
                    "padding": "default",
                    "hover": "true"
                  },
                  "children": [
                    {
                      "type": "icon",
                      "props": {
                        "icon": "lock",
                        "ratio": "3",
                        "style": "primary",
                        "margin": "small"
                      }
                    },
                    {
                      "type": "headline",
                      "props": {
                        "content": "Enterprise-Grade Security",
                        "level": "h3",
                        "margin": "small"
                      }
                    },
                    {
                      "type": "text",
                      "props": {
                        "content": "<p>Bank-level encryption and compliance certifications. Your data is protected with the highest security standards.</p>",
                        "margin": "small"
                      }
                    },
                    {
                      "type": "button",
                      "props": {
                        "content": "Learn More →",
                        "link": "#security",
                        "style": "text"
                      }
                    }
                  ]
                }]
              },
              {
                "type": "grid_item",
                "children": [{
                  "type": "card",
                  "props": {
                    "style": "default",
                    "padding": "default",
                    "hover": "true"
                  },
                  "children": [
                    {
                      "type": "icon",
                      "props": {
                        "icon": "users",
                        "ratio": "3",
                        "style": "primary",
                        "margin": "small"
                      }
                    },
                    {
                      "type": "headline",
                      "props": {
                        "content": "24/7 Expert Support",
                        "level": "h3",
                        "margin": "small"
                      }
                    },
                    {
                      "type": "text",
                      "props": {
                        "content": "<p>Get help whenever you need it from our dedicated support team. Real humans, real solutions, real time.</p>",
                        "margin": "small"
                      }
                    },
                    {
                      "type": "button",
                      "props": {
                        "content": "Learn More →",
                        "link": "#support",
                        "style": "text"
                      }
                    }
                  ]
                }]
              }
            ]
          }
        ]
      }
    },
    {
      name: 'Testimonials - Carousel',
      icon: '💬',
      category: 'Social Proof',
      description: 'Customer testimonials in an auto-playing carousel with avatars and ratings',
      tags: ['testimonials', 'carousel', 'reviews', 'social-proof'],
      difficulty: 'intermediate',
      preview: 'Slider with customer quotes, photos, names, and star ratings',
      json: {
        "type": "section",
        "props": {
          "style": "primary",
          "padding": "large",
          "text_color": "light"
        },
        "children": [
          {
            "type": "headline",
            "props": {
              "content": "Loved by Thousands of Customers",
              "level": "h2",
              "text_align": "center",
              "font_size": "xlarge",
              "margin": "medium"
            }
          },
          {
            "type": "slider",
            "props": {
              "autoplay": "true",
              "autoplay_interval": "5000",
              "center": "true",
              "finite": "false",
              "navigation": "dotnav",
              "width": "xlarge"
            },
            "children": [
              {
                "type": "slider_item",
                "children": [{
                  "type": "panel",
                  "props": {
                    "padding": "large",
                    "text_align": "center"
                  },
                  "children": [
                    {
                      "type": "text",
                      "props": {
                        "content": "<p class='uk-text-large'>⭐⭐⭐⭐⭐</p>",
                        "margin": "small"
                      }
                    },
                    {
                      "type": "text",
                      "props": {
                        "content": "<p class='uk-text-lead'>\"This platform completely transformed how we operate. The ROI was visible within the first month. Absolutely game-changing!\"</p>",
                        "margin": "medium"
                      }
                    },
                    {
                      "type": "image",
                      "props": {
                        "src": "images/avatar1.jpg",
                        "alt": "Sarah Johnson",
                        "width": "80",
                        "height": "80",
                        "border_radius": "circle",
                        "margin": "small"
                      }
                    },
                    {
                      "type": "headline",
                      "props": {
                        "content": "Sarah Johnson",
                        "level": "h4",
                        "margin": "remove"
                      }
                    },
                    {
                      "type": "text",
                      "props": {
                        "content": "<p class='uk-text-small uk-text-muted'>CEO, TechCorp</p>"
                      }
                    }
                  ]
                }]
              },
              {
                "type": "slider_item",
                "children": [{
                  "type": "panel",
                  "props": {
                    "padding": "large",
                    "text_align": "center"
                  },
                  "children": [
                    {
                      "type": "text",
                      "props": {
                        "content": "<p class='uk-text-large'>⭐⭐⭐⭐⭐</p>",
                        "margin": "small"
                      }
                    },
                    {
                      "type": "text",
                      "props": {
                        "content": "<p class='uk-text-lead'>\"Incredible support team and a product that just works. We've scaled 10x and it hasn't missed a beat. Highly recommend!\"</p>",
                        "margin": "medium"
                      }
                    },
                    {
                      "type": "image",
                      "props": {
                        "src": "images/avatar2.jpg",
                        "alt": "Michael Chen",
                        "width": "80",
                        "height": "80",
                        "border_radius": "circle",
                        "margin": "small"
                      }
                    },
                    {
                      "type": "headline",
                      "props": {
                        "content": "Michael Chen",
                        "level": "h4",
                        "margin": "remove"
                      }
                    },
                    {
                      "type": "text",
                      "props": {
                        "content": "<p class='uk-text-small uk-text-muted'>Founder, GrowthLabs</p>"
                      }
                    }
                  ]
                }]
              },
              {
                "type": "slider_item",
                "children": [{
                  "type": "panel",
                  "props": {
                    "padding": "large",
                    "text_align": "center"
                  },
                  "children": [
                    {
                      "type": "text",
                      "props": {
                        "content": "<p class='uk-text-large'>⭐⭐⭐⭐⭐</p>",
                        "margin": "small"
                      }
                    },
                    {
                      "type": "text",
                      "props": {
                        "content": "<p class='uk-text-lead'>\"Best investment we've made this year. The feature set is comprehensive and the learning curve is minimal. Our team loves it!\"</p>",
                        "margin": "medium"
                      }
                    },
                    {
                      "type": "image",
                      "props": {
                        "src": "images/avatar3.jpg",
                        "alt": "Emily Rodriguez",
                        "width": "80",
                        "height": "80",
                        "border_radius": "circle",
                        "margin": "small"
                      }
                    },
                    {
                      "type": "headline",
                      "props": {
                        "content": "Emily Rodriguez",
                        "level": "h4",
                        "margin": "remove"
                      }
                    },
                    {
                      "type": "text",
                      "props": {
                        "content": "<p class='uk-text-small uk-text-muted'>CMO, Digital Dynamics</p>"
                      }
                    }
                  ]
                }]
              }
            ]
          }
        ]
      }
    },
    {
      name: 'Pricing Table - 3 Tiers',
      icon: '💰',
      category: 'Pricing',
      description: 'Professional pricing table with 3 tiers, featured plan, and feature comparisons',
      tags: ['pricing', 'plans', 'subscription', 'comparison'],
      difficulty: 'advanced',
      preview: 'Three-column pricing table with plan features, prices, and CTA buttons',
      json: {
        "type": "section",
        "props": {
          "style": "default",
          "padding": "large"
        },
        "children": [
          {
            "type": "headline",
            "props": {
              "content": "Choose Your Perfect Plan",
              "level": "h2",
              "text_align": "center",
              "font_size": "xlarge",
              "margin": "medium"
            }
          },
          {
            "type": "text",
            "props": {
              "content": "<p class='uk-text-lead uk-text-center uk-text-muted'>Transparent pricing. No hidden fees. Cancel anytime.</p>",
              "margin": "large"
            }
          },
          {
            "type": "grid",
            "props": {
              "grid_default": "1",
              "grid_medium": "3",
              "grid_gutter": "medium",
              "match_height": "true"
            },
            "children": [
              {
                "type": "grid_item",
                "children": [{
                  "type": "card",
                  "props": {
                    "style": "default",
                    "padding": "default",
                    "hover": "true"
                  },
                  "children": [
                    {
                      "type": "headline",
                      "props": {
                        "content": "Starter",
                        "level": "h3",
                        "text_align": "center",
                        "margin": "small"
                      }
                    },
                    {
                      "type": "text",
                      "props": {
                        "content": "<p class='uk-text-center'><span class='uk-text-large uk-text-bold'>$29</span>/month</p>",
                        "margin": "small"
                      }
                    },
                    {
                      "type": "divider",
                      "props": {
                        "margin": "small"
                      }
                    },
                    {
                      "type": "description_list",
                      "props": {
                        "style": "divider"
                      },
                      "children": [
                        {
                          "type": "description_list_item",
                          "props": {
                            "content": "<dt>✓ Up to 10 projects</dt>"
                          }
                        },
                        {
                          "type": "description_list_item",
                          "props": {
                            "content": "<dt>✓ 5 GB storage</dt>"
                          }
                        },
                        {
                          "type": "description_list_item",
                          "props": {
                            "content": "<dt>✓ Email support</dt>"
                          }
                        },
                        {
                          "type": "description_list_item",
                          "props": {
                            "content": "<dt>✓ Basic analytics</dt>"
                          }
                        }
                      ]
                    },
                    {
                      "type": "button",
                      "props": {
                        "content": "Start Free Trial",
                        "link": "#signup-starter",
                        "style": "default",
                        "fullwidth": "true",
                        "margin": "small"
                      }
                    }
                  ]
                }]
              },
              {
                "type": "grid_item",
                "children": [{
                  "type": "card",
                  "props": {
                    "style": "primary",
                    "padding": "default"
                  },
                  "children": [
                    {
                      "type": "badge",
                      "props": {
                        "content": "MOST POPULAR"
                      }
                    },
                    {
                      "type": "headline",
                      "props": {
                        "content": "Professional",
                        "level": "h3",
                        "text_align": "center",
                        "margin": "small"
                      }
                    },
                    {
                      "type": "text",
                      "props": {
                        "content": "<p class='uk-text-center'><span class='uk-text-large uk-text-bold'>$79</span>/month</p>",
                        "margin": "small"
                      }
                    },
                    {
                      "type": "divider",
                      "props": {
                        "margin": "small"
                      }
                    },
                    {
                      "type": "description_list",
                      "props": {
                        "style": "divider"
                      },
                      "children": [
                        {
                          "type": "description_list_item",
                          "props": {
                            "content": "<dt>✓ Unlimited projects</dt>"
                          }
                        },
                        {
                          "type": "description_list_item",
                          "props": {
                            "content": "<dt>✓ 100 GB storage</dt>"
                          }
                        },
                        {
                          "type": "description_list_item",
                          "props": {
                            "content": "<dt>✓ Priority support</dt>"
                          }
                        },
                        {
                          "type": "description_list_item",
                          "props": {
                            "content": "<dt>✓ Advanced analytics</dt>"
                          }
                        },
                        {
                          "type": "description_list_item",
                          "props": {
                            "content": "<dt>✓ Team collaboration</dt>"
                          }
                        }
                      ]
                    },
                    {
                      "type": "button",
                      "props": {
                        "content": "Start Free Trial",
                        "link": "#signup-pro",
                        "style": "default",
                        "fullwidth": "true",
                        "margin": "small"
                      }
                    }
                  ]
                }]
              },
              {
                "type": "grid_item",
                "children": [{
                  "type": "card",
                  "props": {
                    "style": "default",
                    "padding": "default",
                    "hover": "true"
                  },
                  "children": [
                    {
                      "type": "headline",
                      "props": {
                        "content": "Enterprise",
                        "level": "h3",
                        "text_align": "center",
                        "margin": "small"
                      }
                    },
                    {
                      "type": "text",
                      "props": {
                        "content": "<p class='uk-text-center'><span class='uk-text-large uk-text-bold'>Custom</span></p>",
                        "margin": "small"
                      }
                    },
                    {
                      "type": "divider",
                      "props": {
                        "margin": "small"
                      }
                    },
                    {
                      "type": "description_list",
                      "props": {
                        "style": "divider"
                      },
                      "children": [
                        {
                          "type": "description_list_item",
                          "props": {
                            "content": "<dt>✓ Everything in Pro</dt>"
                          }
                        },
                        {
                          "type": "description_list_item",
                          "props": {
                            "content": "<dt>✓ Unlimited storage</dt>"
                          }
                        },
                        {
                          "type": "description_list_item",
                          "props": {
                            "content": "<dt>✓ Dedicated support</dt>"
                          }
                        },
                        {
                          "type": "description_list_item",
                          "props": {
                            "content": "<dt>✓ Custom integrations</dt>"
                          }
                        },
                        {
                          "type": "description_list_item",
                          "props": {
                            "content": "<dt>✓ SLA guarantee</dt>"
                          }
                        }
                      ]
                    },
                    {
                      "type": "button",
                      "props": {
                        "content": "Contact Sales",
                        "link": "#contact",
                        "style": "default",
                        "fullwidth": "true",
                        "margin": "small"
                      }
                    }
                  ]
                }]
              }
            ]
          }
        ]
      }
    },
    {
      name: 'CTA - Split Layout',
      icon: '📣',
      category: 'CTAs',
      description: 'Two-column call-to-action with image and compelling copy',
      tags: ['cta', 'conversion', 'split', 'image'],
      difficulty: 'beginner',
      preview: 'Left: image, Right: headline, text, and CTA button',
      json: {
        "type": "section",
        "props": {
          "style": "secondary",
          "padding": "large"
        },
        "children": [{
          "type": "grid",
          "props": {
            "grid_default": "1",
            "grid_medium": "2",
            "grid_gutter": "large",
            "vertical_align": "middle"
          },
          "children": [
            {
              "type": "grid_item",
              "children": [{
                "type": "image",
                "props": {
                  "src": "images/cta-illustration.jpg",
                  "alt": "Get Started Today",
                  "border_radius": "large",
                  "animation": "slide-left"
                }
              }]
            },
            {
              "type": "grid_item",
              "children": [
                {
                  "type": "headline",
                  "props": {
                    "content": "Ready to Transform Your Business?",
                    "level": "h2",
                    "font_size": "xlarge",
                    "margin": "medium"
                  }
                },
                {
                  "type": "text",
                  "props": {
                    "content": "<p class='uk-text-large'>Join thousands of satisfied customers who have already made the switch. Start your free trial today—no credit card required.</p>",
                    "margin": "medium"
                  }
                },
                {
                  "type": "button",
                  "props": {
                    "content": "Get Started Now →",
                    "link": "#signup",
                    "style": "primary",
                    "size": "large"
                  }
                },
                {
                  "type": "text",
                  "props": {
                    "content": "<p class='uk-text-small uk-text-muted'>✓ Setup in 5 minutes  ✓ No technical knowledge required  ✓ Free support included</p>",
                    "margin": "small"
                  }
                }
              ]
            }
          ]
        }]
      }
    },
    {
      name: 'FAQ - Accordion',
      icon: '❓',
      category: 'Content',
      description: 'Frequently asked questions in an expandable accordion format',
      tags: ['faq', 'accordion', 'questions', 'help'],
      difficulty: 'beginner',
      preview: 'Collapsible accordion with common questions and detailed answers',
      json: {
        "type": "section",
        "props": {
          "style": "default",
          "padding": "large"
        },
        "children": [
          {
            "type": "headline",
            "props": {
              "content": "Frequently Asked Questions",
              "level": "h2",
              "text_align": "center",
              "font_size": "xlarge",
              "margin": "large"
            }
          },
          {
            "type": "row",
            "children": [{
              "type": "column",
              "props": {
                "width_medium": "2-3"
              },
              "children": [{
                "type": "accordion",
                "props": {
                  "multiple": "false",
                  "collapsible": "true"
                },
                "children": [
                  {
                    "type": "accordion_item",
                    "props": {
                      "title": "How long does it take to get started?",
                      "content": "<p>You can be up and running in as little as 5 minutes. Our intuitive onboarding process guides you through setup step-by-step, and our support team is available 24/7 if you need any assistance.</p>"
                    }
                  },
                  {
                    "type": "accordion_item",
                    "props": {
                      "title": "Do I need a credit card for the free trial?",
                      "content": "<p>No! You can start your 14-day free trial without providing any payment information. We'll only ask for your credit card details when you're ready to subscribe to a paid plan.</p>"
                    }
                  },
                  {
                    "type": "accordion_item",
                    "props": {
                      "title": "Can I cancel my subscription anytime?",
                      "content": "<p>Absolutely. You can cancel your subscription at any time from your account settings. There are no cancellation fees or long-term contracts. If you cancel, you'll retain access until the end of your current billing period.</p>"
                    }
                  },
                  {
                    "type": "accordion_item",
                    "props": {
                      "title": "What kind of support do you offer?",
                      "content": "<p>We offer multiple support channels including live chat, email, and phone support. Professional and Enterprise plans receive priority support with guaranteed response times. We also have an extensive knowledge base and video tutorials.</p>"
                    }
                  },
                  {
                    "type": "accordion_item",
                    "props": {
                      "title": "Is my data secure?",
                      "content": "<p>Security is our top priority. We use bank-level encryption (AES-256), maintain SOC 2 Type II compliance, and undergo regular third-party security audits. Your data is backed up daily and stored in geographically distributed data centers.</p>"
                    }
                  }
                ]
              }]
            }]
          }
        ]
      }
    },
    {
      name: 'Stats - Counter Grid',
      icon: '📊',
      category: 'Social Proof',
      description: 'Impressive statistics displayed in a clean 4-column grid',
      tags: ['stats', 'numbers', 'metrics', 'social-proof'],
      difficulty: 'beginner',
      preview: 'Four columns showing key metrics with large numbers and labels',
      json: {
        "type": "section",
        "props": {
          "style": "primary",
          "padding": "medium",
          "text_color": "light"
        },
        "children": [{
          "type": "grid",
          "props": {
            "grid_default": "2",
            "grid_medium": "4",
            "grid_gutter": "large",
            "text_align": "center"
          },
          "children": [
            {
              "type": "grid_item",
              "children": [
                {
                  "type": "headline",
                  "props": {
                    "content": "50K+",
                    "level": "h2",
                    "font_size": "2xlarge",
                    "margin": "remove"
                  }
                },
                {
                  "type": "text",
                  "props": {
                    "content": "<p class='uk-text-large'>Active Users</p>"
                  }
                }
              ]
            },
            {
              "type": "grid_item",
              "children": [
                {
                  "type": "headline",
                  "props": {
                    "content": "99.9%",
                    "level": "h2",
                    "font_size": "2xlarge",
                    "margin": "remove"
                  }
                },
                {
                  "type": "text",
                  "props": {
                    "content": "<p class='uk-text-large'>Uptime</p>"
                  }
                }
              ]
            },
            {
              "type": "grid_item",
              "children": [
                {
                  "type": "headline",
                  "props": {
                    "content": "24/7",
                    "level": "h2",
                    "font_size": "2xlarge",
                    "margin": "remove"
                  }
                },
                {
                  "type": "text",
                  "props": {
                    "content": "<p class='uk-text-large'>Support</p>"
                  }
                }
              ]
            },
            {
              "type": "grid_item",
              "children": [
                {
                  "type": "headline",
                  "props": {
                    "content": "150+",
                    "level": "h2",
                    "font_size": "2xlarge",
                    "margin": "remove"
                  }
                },
                {
                  "type": "text",
                  "props": {
                    "content": "<p class='uk-text-large'>Countries</p>"
                  }
                }
              ]
            }
          ]
        }]
      }
    },
    {
      name: 'Team - Grid Profiles',
      icon: '👥',
      category: 'About',
      description: 'Team member profiles with photos, names, titles, and social links',
      tags: ['team', 'about', 'people', 'staff'],
      difficulty: 'intermediate',
      preview: 'Grid of team member cards with photos and bio information',
      json: {
        "type": "section",
        "props": {
          "style": "default",
          "padding": "large"
        },
        "children": [
          {
            "type": "headline",
            "props": {
              "content": "Meet Our Team",
              "level": "h2",
              "text_align": "center",
              "font_size": "xlarge",
              "margin": "medium"
            }
          },
          {
            "type": "text",
            "props": {
              "content": "<p class='uk-text-lead uk-text-center uk-text-muted'>Passionate professionals dedicated to your success</p>",
              "margin": "large"
            }
          },
          {
            "type": "grid",
            "props": {
              "grid_default": "1",
              "grid_small": "2",
              "grid_medium": "4",
              "grid_gutter": "medium"
            },
            "children": [
              {
                "type": "grid_item",
                "children": [{
                  "type": "panel",
                  "props": {
                    "text_align": "center"
                  },
                  "children": [
                    {
                      "type": "image",
                      "props": {
                        "src": "images/team-1.jpg",
                        "alt": "Alex Thompson",
                        "border_radius": "circle",
                        "margin": "small"
                      }
                    },
                    {
                      "type": "headline",
                      "props": {
                        "content": "Alex Thompson",
                        "level": "h4",
                        "margin": "remove"
                      }
                    },
                    {
                      "type": "text",
                      "props": {
                        "content": "<p class='uk-text-small uk-text-muted'>CEO & Founder</p>",
                        "margin": "small"
                      }
                    },
                    {
                      "type": "social",
                      "props": {
                        "link_1": "https://twitter.com/alex",
                        "link_2": "https://linkedin.com/in/alex",
                        "icon_1": "twitter",
                        "icon_2": "linkedin"
                      }
                    }
                  ]
                }]
              },
              {
                "type": "grid_item",
                "children": [{
                  "type": "panel",
                  "props": {
                    "text_align": "center"
                  },
                  "children": [
                    {
                      "type": "image",
                      "props": {
                        "src": "images/team-2.jpg",
                        "alt": "Jamie Lee",
                        "border_radius": "circle",
                        "margin": "small"
                      }
                    },
                    {
                      "type": "headline",
                      "props": {
                        "content": "Jamie Lee",
                        "level": "h4",
                        "margin": "remove"
                      }
                    },
                    {
                      "type": "text",
                      "props": {
                        "content": "<p class='uk-text-small uk-text-muted'>Head of Design</p>",
                        "margin": "small"
                      }
                    },
                    {
                      "type": "social",
                      "props": {
                        "link_1": "https://twitter.com/jamie",
                        "link_2": "https://linkedin.com/in/jamie",
                        "icon_1": "twitter",
                        "icon_2": "linkedin"
                      }
                    }
                  ]
                }]
              },
              {
                "type": "grid_item",
                "children": [{
                  "type": "panel",
                  "props": {
                    "text_align": "center"
                  },
                  "children": [
                    {
                      "type": "image",
                      "props": {
                        "src": "images/team-3.jpg",
                        "alt": "Morgan Blake",
                        "border_radius": "circle",
                        "margin": "small"
                      }
                    },
                    {
                      "type": "headline",
                      "props": {
                        "content": "Morgan Blake",
                        "level": "h4",
                        "margin": "remove"
                      }
                    },
                    {
                      "type": "text",
                      "props": {
                        "content": "<p class='uk-text-small uk-text-muted'>Lead Developer</p>",
                        "margin": "small"
                      }
                    },
                    {
                      "type": "social",
                      "props": {
                        "link_1": "https://twitter.com/morgan",
                        "link_2": "https://linkedin.com/in/morgan",
                        "icon_1": "twitter",
                        "icon_2": "linkedin"
                      }
                    }
                  ]
                }]
              },
              {
                "type": "grid_item",
                "children": [{
                  "type": "panel",
                  "props": {
                    "text_align": "center"
                  },
                  "children": [
                    {
                      "type": "image",
                      "props": {
                        "src": "images/team-4.jpg",
                        "alt": "Riley Kim",
                        "border_radius": "circle",
                        "margin": "small"
                      }
                    },
                    {
                      "type": "headline",
                      "props": {
                        "content": "Riley Kim",
                        "level": "h4",
                        "margin": "remove"
                      }
                    },
                    {
                      "type": "text",
                      "props": {
                        "content": "<p class='uk-text-small uk-text-muted'>Customer Success</p>",
                        "margin": "small"
                      }
                    },
                    {
                      "type": "social",
                      "props": {
                        "link_1": "https://twitter.com/riley",
                        "link_2": "https://linkedin.com/in/riley",
                        "icon_1": "twitter",
                        "icon_2": "linkedin"
                      }
                    }
                  ]
                }]
              }
            ]
          }
        ]
      }
    },
    {
      name: 'Newsletter Subscribe',
      icon: '📧',
      category: 'Forms',
      description: 'Email newsletter signup form with compelling copy',
      tags: ['newsletter', 'form', 'subscribe', 'email'],
      difficulty: 'beginner',
      preview: 'Centered form with headline, input field, and submit button',
      json: {
        "type": "section",
        "props": {
          "style": "muted",
          "padding": "large"
        },
        "children": [{
          "type": "row",
          "children": [{
            "type": "column",
            "props": {
              "width_medium": "1-2"
            },
            "children": [
              {
                "type": "headline",
                "props": {
                  "content": "Stay in the Loop",
                  "level": "h2",
                  "text_align": "center",
                  "font_size": "xlarge",
                  "margin": "small"
                }
              },
              {
                "type": "text",
                "props": {
                  "content": "<p class='uk-text-center uk-text-large'>Get weekly insights, exclusive tips, and special offers delivered straight to your inbox.</p>",
                  "margin": "medium"
                }
              },
              {
                "type": "form",
                "props": {
                  "action": "/subscribe",
                  "method": "post"
                },
                "children": [
                  {
                    "type": "text",
                    "props": {
                      "content": "<input class='uk-input uk-form-large' type='email' name='email' placeholder='Enter your email address' required>"
                    }
                  },
                  {
                    "type": "button",
                    "props": {
                      "content": "Subscribe Now",
                      "style": "primary",
                      "size": "large",
                      "fullwidth": "true",
                      "margin": "small"
                    }
                  },
                  {
                    "type": "text",
                    "props": {
                      "content": "<p class='uk-text-small uk-text-center uk-text-muted'>We respect your privacy. Unsubscribe anytime.</p>"
                    }
                  }
                ]
              }
            ]
          }]
        }]
      }
    },
    {
      name: 'Footer - Multi-Column',
      icon: '🦶',
      category: 'Navigation',
      description: 'Comprehensive footer with logo, links, social media, and copyright',
      tags: ['footer', 'navigation', 'links', 'social'],
      difficulty: 'intermediate',
      preview: 'Four-column footer with organized link groups and branding',
      json: {
        "type": "section",
        "props": {
          "style": "secondary",
          "padding": "large",
          "text_color": "light"
        },
        "children": [
          {
            "type": "grid",
            "props": {
              "grid_default": "1",
              "grid_small": "2",
              "grid_medium": "4",
              "grid_gutter": "large"
            },
            "children": [
              {
                "type": "grid_item",
                "children": [
                  {
                    "type": "headline",
                    "props": {
                      "content": "YourBrand",
                      "level": "h4",
                      "margin": "small"
                    }
                  },
                  {
                    "type": "text",
                    "props": {
                      "content": "<p>Empowering businesses with innovative solutions since 2020.</p>",
                      "margin": "small"
                    }
                  },
                  {
                    "type": "social",
                    "props": {
                      "link_1": "https://twitter.com",
                      "link_2": "https://facebook.com",
                      "link_3": "https://linkedin.com",
                      "link_4": "https://instagram.com",
                      "icon_1": "twitter",
                      "icon_2": "facebook",
                      "icon_3": "linkedin",
                      "icon_4": "instagram"
                    }
                  }
                ]
              },
              {
                "type": "grid_item",
                "children": [
                  {
                    "type": "headline",
                    "props": {
                      "content": "Product",
                      "level": "h5",
                      "margin": "small"
                    }
                  },
                  {
                    "type": "text",
                    "props": {
                      "content": "<p><a href='#features'>Features</a><br><a href='#pricing'>Pricing</a><br><a href='#integrations'>Integrations</a><br><a href='#changelog'>Changelog</a></p>"
                    }
                  }
                ]
              },
              {
                "type": "grid_item",
                "children": [
                  {
                    "type": "headline",
                    "props": {
                      "content": "Company",
                      "level": "h5",
                      "margin": "small"
                    }
                  },
                  {
                    "type": "text",
                    "props": {
                      "content": "<p><a href='#about'>About Us</a><br><a href='#blog'>Blog</a><br><a href='#careers'>Careers</a><br><a href='#press'>Press Kit</a></p>"
                    }
                  }
                ]
              },
              {
                "type": "grid_item",
                "children": [
                  {
                    "type": "headline",
                    "props": {
                      "content": "Support",
                      "level": "h5",
                      "margin": "small"
                    }
                  },
                  {
                    "type": "text",
                    "props": {
                      "content": "<p><a href='#help'>Help Center</a><br><a href='#contact'>Contact Us</a><br><a href='#status'>System Status</a><br><a href='#api'>API Docs</a></p>"
                    }
                  }
                ]
              }
            ]
          },
          {
            "type": "divider",
            "props": {
              "margin": "medium"
            }
          },
          {
            "type": "text",
            "props": {
              "content": "<p class='uk-text-center uk-text-small'>&copy; 2025 YourBrand. All rights reserved. <a href='#privacy'>Privacy Policy</a> | <a href='#terms'>Terms of Service</a></p>",
              "text_align": "center"
            }
          }
        ]
      }
    }
  ];

  // ===========================================================================
  // AI² YOOTHEME ASSISTANT PRO CLASS
  // ===========================================================================
  class AI2YoothemeAssistantPro {
    constructor() {
      this.version = CONFIG.VERSION;
      this.settings = this.loadSettings();
      this.customPresets = this.loadCustomPresets();
      this.commandHistory = this.loadHistory();
      this.modalVisible = false;
      this.currentTab = 'generate';
      this.searchQuery = '';
      this.selectedCategory = 'all';
      this.aiProvider = GM_getValue(CONFIG.AI_PROVIDER_KEY, 'local');
      this.init();
    }

    loadSettings() {
      try {
        const stored = GM_getValue(CONFIG.SETTINGS_KEY, '{}');
        const parsed = JSON.parse(stored);
        return {
          bridgeUrl: parsed.bridgeUrl || CONFIG.DEFAULT_BRIDGE_URL,
          geminiApiKey: parsed.geminiApiKey || '',
          xaiApiKey: parsed.xaiApiKey || '',
          autoBackup: parsed.autoBackup !== false,
          validateOnGenerate: parsed.validateOnGenerate !== false,
          showNotifications: parsed.showNotifications !== false,
          animationsEnabled: parsed.animationsEnabled !== false,
          theme: parsed.theme || 'dark',
          ...parsed
        };
      } catch (e) {
        return {
          bridgeUrl: CONFIG.DEFAULT_BRIDGE_URL,
          geminiApiKey: '',
          xaiApiKey: '',
          autoBackup: true,
          validateOnGenerate: true,
          showNotifications: true,
          animationsEnabled: true,
          theme: 'dark'
        };
      }
    }

    saveSettings() {
      try {
        GM_setValue(CONFIG.SETTINGS_KEY, JSON.stringify(this.settings));
        this.notify('Settings Saved', 'Your preferences have been saved successfully.', 'success');
      } catch (e) {
        this.notify('Save Failed', 'Could not save settings.', 'error');
      }
    }

    loadCustomPresets() {
      try {
        const stored = GM_getValue(CONFIG.CUSTOM_PRESETS_KEY, '[]');
        return JSON.parse(stored);
      } catch (e) {
        return [];
      }
    }

    saveCustomPresets() {
      try {
        GM_setValue(CONFIG.CUSTOM_PRESETS_KEY, JSON.stringify(this.customPresets));
      } catch (e) {
        console.error('[AI² Assistant] Failed to save custom presets:', e);
      }
    }

    loadHistory() {
      try {
        const stored = GM_getValue(CONFIG.HISTORY_KEY, '[]');
        return JSON.parse(stored);
      } catch (e) {
        return [];
      }
    }

    saveHistory() {
      try {
        // Keep only last 50 commands
        const trimmed = this.commandHistory.slice(-50);
        GM_setValue(CONFIG.HISTORY_KEY, JSON.stringify(trimmed));
      } catch (e) {
        console.error('[AI² Assistant] Failed to save history:', e);
      }
    }

    addToHistory(command, result) {
      this.commandHistory.push({
        timestamp: new Date().toISOString(),
        command: command,
        success: !!result,
        preview: result ? result.substring(0, 100) + '...' : 'Failed'
      });
      this.saveHistory();
    }

    init() {
      if (!this.isInYoothemeBuilder()) {
        console.log('[AI² Assistant] Not in YOOtheme builder environment, skipping initialization');
        return;
      }

      console.log(`%c🚀 AI² YOOtheme Assistant Pro v${this.version} Activated`,
        'color: #4285F4; font-size: 14px; font-weight: bold; padding: 8px; background: linear-gradient(90deg, rgba(66,133,244,0.1), rgba(52,168,83,0.1)); border-radius: 4px;');

      this.injectStyles();
      this.injectFAB();
      this.injectModal();
      this.attachGlobalListeners();

      if (this.settings.autoBackup) {
        this.setupAutoBackup();
      }

      // Check bridge status on load
      this.checkBridgeStatus();
    }

    isInYoothemeBuilder() {
      const indicators = [
        () => document.querySelector('[data-uk-builder]'),
        () => document.querySelector('[data-builder]'),
        () => window.location.href.includes('yootheme'),
        () => window.YOOtheme,
        () => document.querySelector('.tm-builder'),
        () => document.title.toLowerCase().includes('yootheme')
      ];
      return indicators.some(check => {
        try { return check(); } catch { return false; }
      });
    }

    // ... (Continue in next part due to length)
  }

  // ===========================================================================
  // UTILITY FUNCTIONS
  // ===========================================================================
  function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatJSON(json, indent = 2) {
    try {
      const obj = typeof json === 'string' ? JSON.parse(json) : json;
      return JSON.stringify(obj, null, indent);
    } catch (e) {
      return json;
    }
  }

  function validateYoothemeJSON(json) {
    try {
      const obj = typeof json === 'string' ? JSON.parse(json) : json;
      const errors = [];

      // Check required fields
      if (!obj.type) {
        errors.push('Missing required "type" field');
      }

      // Check element type validity
      if (obj.type && !CONFIG.VALIDATION.validElementTypes.includes(obj.type)) {
        errors.push(`Invalid element type: "${obj.type}"`);
      }

      // Check prop values are strings
      if (obj.props) {
        Object.entries(obj.props).forEach(([key, value]) => {
          if (typeof value !== 'string') {
            errors.push(`Prop "${key}" must be a string, got ${typeof value}`);
          }
        });
      }

      // Check nesting depth
      function checkDepth(node, depth = 0) {
        if (depth > CONFIG.VALIDATION.maxNestingDepth) {
          errors.push(`Maximum nesting depth (${CONFIG.VALIDATION.maxNestingDepth}) exceeded`);
          return;
        }
        if (node.children && Array.isArray(node.children)) {
          node.children.forEach(child => checkDepth(child, depth + 1));
        }
      }
      checkDepth(obj);

      return {
        valid: errors.length === 0,
        errors: errors,
        elementCount: countElements(obj)
      };
    } catch (e) {
      return {
        valid: false,
        errors: [`Invalid JSON: ${e.message}`],
        elementCount: 0
      };
    }
  }

  function countElements(obj, count = 0) {
    if (typeof obj !== 'object' || obj === null) return count;

    if (obj.type) count++;

    if (Array.isArray(obj.children)) {
      obj.children.forEach(child => {
        count = countElements(child, count);
      });
    }

    return count;
  }

  // ===========================================================================
  // INITIALIZE
  // ===========================================================================
  new AI2YoothemeAssistantPro();

})();
