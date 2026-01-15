// ==UserScript==
// @name         Chameleon AI-Forge: Genesis Command Center
// @namespace    https://chameleon-ai-forge.com/genesis
// @version      2026.6.0
// @description  The ultimate AI web co-pilot. Features a futuristic glassmorphism UI, a true intent-driven AI driver with conversational memory, proactive workflow automation, a session recorder, API interception, vulnerability scanning, and generative page remixing tools.
// @author       Chameleon AI-Forge Team
// @match        *://*/*

// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_openInTab
// @grant        unsafeWindow
// @connect      127.0.0.1
// @connect      localhost
// @connect      chameleon-ai-forge.com
// @connect      api.chameleon-ai.pro
// @connect      * // Required for GM_xmlhttpRequest to arbitrary domains (e.g., Hacker News, Amazon, Best Buy)
// @run-at       document-idle
// @updateURL    https://chameleon-ai-forge.com/genesis/userscript.js
// @downloadURL  https://chameleon-ai-forge.com/genesis/userscript.js
// ==/UserScript==

(function () {
    'use strict';

    // --- POLYFILLS ---
    var GM_addStyle = (typeof GM_addStyle !== 'undefined' && GM_addStyle) || function (css) {
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
        return style;
    };
    var GM_setValue = (typeof GM_setValue !== 'undefined' && GM_setValue) || function (key, value) {
        try {
            localStorage.setItem(`chameleon_${key}`, JSON.stringify(value));
        } catch (e) {
            console.error("[Chameleon] GM_setValue polyfill failed:", e);
        }
    };
    var GM_getValue = (typeof GM_getValue !== 'undefined' && GM_getValue) || function (key, defaultValue) {
        try {
            const value = localStorage.getItem(`chameleon_${key}`);
            return value === null || typeof value === 'undefined' ? defaultValue : JSON.parse(value);
        } catch (e) {
            console.error("[Chameleon] GM_getValue polyfill failed:", e);
            return defaultValue;
        }
    };
    var GM_deleteValue = (typeof GM_deleteValue !== 'undefined' && GM_deleteValue) || function (key) {
        try {
            localStorage.removeItem(`chameleon_${key}`);
        } catch (e) {
            console.error("[Chameleon] GM_deleteValue polyfill failed:", e);
        }
    };
    var GM_listValues = (typeof GM_listValues !== 'undefined' && GM_listValues) || function () {
        try {
            return Object.keys(localStorage).filter(k => k.startsWith('chameleon_')).map(k => k.substring(10));
        } catch (e) {
            console.error("[Chameleon] GM_listValues polyfill failed:", e);
            return [];
        }
    };
    var GM_setClipboard = (typeof GM_setClipboard !== 'undefined' && GM_setClipboard) || function (text) {
        navigator.clipboard.writeText(text).catch(e => console.error("[Chameleon] GM_setClipboard polyfill failed:", e));
    };
    var GM_xmlhttpRequest = (typeof GM_xmlhttpRequest !== 'undefined' && GM_xmlhttpRequest) || function ({ method, url, headers, data, onload, onerror }) {
        fetch(url, {
            method: method || 'GET',
            headers: headers,
            body: data
        }).then(res => {
            return res.text().then(responseText => {
                const response = {
                    status: res.status,
                    statusText: res.statusText,
                    responseText: responseText,
                    finalUrl: res.url,
                    responseHeaders: res.headers,
                };
                if (res.ok) {
                    if (onload) onload(response);
                } else {
                    if (onerror) onerror(response);
                }
            });
        }).catch(err => {
            if (onerror) onerror(err);
        });
    };
    var GM_notification = (typeof GM_notification !== 'undefined' && GM_notification) || function (details) {
        console.info(`[Chameleon Notification] ${details.title}: ${details.text}`);
    };
    var GM_registerMenuCommand = (typeof GM_registerMenuCommand !== 'undefined' && GM_registerMenuCommand) || function (caption, commandFunc) {
        console.info(`[Chameleon] Menu command stub: "${caption}"`);
    };
    var GM_openInTab = (typeof GM_openInTab !== 'undefined' && GM_openInTab) || function (url) {
        window.open(url, '_blank');
    };

    // --- CONFIGURATION ---
    const CONFIG = {
        VERSION: '2026.6.0',
        ID_PREFIX: 'chameleon-genesis__',
        API_BASE: 'http://127.0.0.1:5000/api', // For local development (simulated in this script)
        DEBUG: true, // Set to false to disable console logs
    };

    const ROOT_WINDOW = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    const safeParseJSON = (value) => {
        if (typeof value !== 'string') {
            return value;
        }
        const trimmed = value.trim();
        if (!trimmed) {
            return '';
        }
        try {
            return JSON.parse(trimmed);
        } catch (error) {
            return value;
        }
    };

    const serializeForResponse = (value) => {
        if (value == null) {
            return 'null';
        }
        if (typeof value === 'string') {
            return value;
        }
        try {
            return JSON.stringify(value);
        } catch (error) {
            return String(value);
        }
    };

    const SIMPLE_COLOR_KEYWORDS = new Set([
        'black', 'white', 'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'brown',
        'gray', 'grey', 'teal', 'cyan', 'magenta', 'lime', 'maroon', 'navy', 'olive', 'silver', 'gold',
        'beige', 'coral', 'indigo', 'violet', 'turquoise', 'salmon', 'lavender', 'aqua', 'fuchsia', 'crimson',
        'chocolate', 'tan', 'plum', 'sienna', 'khaki', 'skyblue', 'lightblue', 'lightgreen', 'lightgray', 'lightgrey',
        'darkblue', 'darkgreen', 'darkred', 'darkgray', 'darkgrey', 'hotpink', 'royalblue', 'dodgerblue', 'slategray',
        'slategrey', 'seagreen', 'springgreen', 'steelblue', 'peachpuff', 'whitesmoke', 'mintcream', 'cadetblue',
        'orangered', 'goldenrod', 'firebrick', 'midnightblue', 'powderblue', 'transparent'
    ]);

    const COLOR_ALIAS_MAP = new Map([
        ['light gray', 'lightgray'],
        ['light grey', 'lightgrey'],
        ['dark gray', 'darkgray'],
        ['dark grey', 'darkgrey'],
        ['sky blue', 'skyblue'],
        ['royal blue', 'royalblue'],
        ['hot pink', 'hotpink'],
        ['sea green', 'seagreen'],
        ['spring green', 'springgreen'],
        ['steel blue', 'steelblue'],
        ['deep pink', 'deeppink'],
        ['forest green', 'forestgreen'],
        ['midnight blue', 'midnightblue'],
        ['powder blue', 'powderblue'],
        ['navy blue', 'navy'],
        ['olive green', 'olive']
    ]);

    const ANIMATION_SYNONYMS = {
        pulse: ['pulse', 'pulsate', 'throb'],
        glow: ['glow', 'neon', 'radiate'],
        shake: ['shake', 'wiggle', 'vibrate']
    };

    const KEYWORD_SELECTOR_MAP = [
        { regex: /\bbuttons?\b|\bctas?\b|\bcall to action[s]?\b/, selector: 'button, [role="button"], .btn, .cta' },
        { regex: /\blinks?\b|\banchors?\b|\bhrefs?\b/, selector: 'a' },
        { regex: /\bimages?\b|\bpictures?\b|\bphotos?\b|\bthumbnails?\b|\bimgs?\b/, selector: 'img' },
        { regex: /\binputs?\b|\bfields?\b|\bform fields?\b|\btext fields?\b|\btextboxes?\b/, selector: 'input, textarea, select' },
        { regex: /\bforms?\b/, selector: 'form' },
        { regex: /\bheadings?\b|\btitles?\b|\bheaders?\b/, selector: 'h1, h2, h3, h4, h5, h6' },
        { regex: /\bparagraphs?\b|\btext blocks?\b/, selector: 'p' },
        { regex: /\bsections?\b/, selector: 'section' },
        { regex: /\bcontent area\b/, selector: 'main, article' },
        { regex: /\bcards?\b|\btiles?\b|\bpanels?\b/, selector: '.card, .panel, .tile' },
        { regex: /\blists?\b|\bitems list\b/, selector: 'ul, ol' },
        { regex: /\btables?\b/, selector: 'table' },
        { regex: /\bnav\b|\bnavigation\b|\bmenu\b/, selector: 'nav' },
        { regex: /\bsidebar\b/, selector: 'aside' },
        { regex: /\bfooter\b/, selector: 'footer' },
        { regex: /\bheader\b|\btop bar\b/, selector: 'header' },
        { regex: /\bhero\b/, selector: '.hero, #hero, section.hero' },
        { regex: /\bmain content\b/, selector: 'main' },
        { regex: /\bpage\b|\bbody\b/, selector: 'body' }
    ];

    class CommandUtils {
        static allMatches(source, regex) {
            if (!source || !regex) {
                return [];
            }
            if (typeof source.matchAll === 'function') {
                return Array.from(source.matchAll(regex));
            }
            const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
            const globalRegex = new RegExp(regex.source, flags);
            const matches = [];
            let match;
            while ((match = globalRegex.exec(source)) !== null) {
                matches.push(match);
            }
            return matches;
        }

        static detectSelectorsFromCommand(originalCommand, lowerCommand, hasContext) {
            if (!originalCommand) return [];
            if (hasContext && /\bthis element\b/.test(lowerCommand)) {
                return [];
            }

            const selectors = new Set();

            KEYWORD_SELECTOR_MAP.forEach(entry => {
                if (entry.regex.test(lowerCommand)) {
                    entry.selector.split(',').forEach(sel => selectors.add(sel.trim()));
                }
            });

            const classMatches = this.allMatches(originalCommand, /class ['\"]?([a-z0-9_-]+)/gi);
            for (const match of classMatches) {
                selectors.add(`.${match[1]}`);
            }

            const idMatches = this.allMatches(originalCommand, /id ['\"]?([a-z0-9_-]+)/gi);
            for (const match of idMatches) {
                selectors.add(`#${match[1]}`);
            }

            const directSelectorMatches = this.allMatches(originalCommand, /([.#][a-z_][a-z0-9_-]*)/gi);
            for (const match of directSelectorMatches) {
                const candidate = match[1];
                if (/^#[0-9a-f]{3,8}$/i.test(candidate)) {
                    continue; // Skip hex colors mistaken for IDs
                }
                selectors.add(candidate);
            }

            const tagMatches = this.allMatches(originalCommand, /\b(h[1-6]|main|aside|section|article)\b/gi);
            for (const match of tagMatches) {
                selectors.add(match[1].toLowerCase());
            }

            if (selectors.has('section')) {
                const hasHeroSpecific = Array.from(selectors).some(sel => sel.includes('hero') && /[.#]/.test(sel));
                if (hasHeroSpecific) {
                    selectors.delete('section');
                }
            }

            return Array.from(selectors).filter(Boolean);
        }

        static extractColorValue(segment) {
            if (!segment) return null;
            const lowerSegment = segment.toLowerCase();

            const hexMatch = lowerSegment.match(/#[0-9a-f]{3,8}\b/);
            if (hexMatch) {
                return hexMatch[0];
            }

            const rgbMatch = segment.match(/rgba?\([^)]+\)/i);
            if (rgbMatch) {
                return rgbMatch[0];
            }

            const hslMatch = segment.match(/hsla?\([^)]+\)/i);
            if (hslMatch) {
                return hslMatch[0];
            }

            for (const [alias, cssValue] of COLOR_ALIAS_MAP.entries()) {
                const aliasRegex = new RegExp(`\\b${alias.replace(/\s+/g, '\\s+')}\\b`, 'i');
                if (aliasRegex.test(lowerSegment)) {
                    return cssValue;
                }
            }

            for (const color of SIMPLE_COLOR_KEYWORDS) {
                const colorRegex = new RegExp(`\\b${color}\\b`, 'i');
                if (colorRegex.test(lowerSegment)) {
                    return color;
                }
            }

            return null;
        }

        static ensureUnit(value, defaultUnit = 'px') {
            if (value == null) return value;
            const trimmed = value.toString().trim();
            if (trimmed === '') return trimmed;
            if (/[a-z%]+$/i.test(trimmed)) {
                return trimmed;
            }
            return defaultUnit ? `${trimmed}${defaultUnit}` : trimmed;
        }

        static ensureBoxValueUnits(value, defaultUnit = 'px') {
            if (!value) return value;
            const tokens = value.trim().split(/\s+/);
            const converted = tokens.map(token => /[a-z%]+$/i.test(token) ? token : `${token}${defaultUnit}`);
            return converted.join(' ');
        }

        static extractStyleInstructions(command) {
            if (!command) return [];
            const instructions = [];
            const segments = command.split(/(?:,|;|\band\b|\.(?=\s))/i).map(s => s.trim()).filter(Boolean);

            segments.forEach(segment => {
                const lowerSegment = segment.toLowerCase();
                const style = {};

                if (/\bno border\b/.test(lowerSegment) || /\bremove border\b/.test(lowerSegment) || /\bborderless\b/.test(lowerSegment)) {
                    style.border = 'none';
                }

                const colorValue = this.extractColorValue(segment);
                if (colorValue) {
                    if (lowerSegment.includes('background')) {
                        style.backgroundColor = colorValue;
                    } else if (lowerSegment.includes('border')) {
                        const widthMatch = segment.match(/border(?:[^0-9]+)?([0-9.]+(?:px|em|rem)?)/i);
                        const width = widthMatch && widthMatch[1] ? this.ensureUnit(widthMatch[1], 'px') : '2px';
                        const borderStyleMatch = segment.match(/\b(solid|dashed|dotted|double)\b/i);
                        const borderStyle = borderStyleMatch ? borderStyleMatch[1].toLowerCase() : 'solid';
                        style.border = `${width} ${borderStyle} ${colorValue}`;
                    } else {
                        style.color = colorValue;
                    }
                }

                if (/\bglow\b/.test(lowerSegment) && colorValue) {
                    style.boxShadow = `0 0 12px ${colorValue}`;
                }

                const fontSizeMatch = segment.match(/font size(?:[^0-9]+)?([0-9.]+(?:px|pt|em|rem|%)?)/i);
                if (fontSizeMatch) {
                    style.fontSize = this.ensureUnit(fontSizeMatch[1], 'px');
                }

                const lineHeightMatch = segment.match(/line height(?:[^0-9]+)?([0-9.]+(?:px|pt|em|rem|%)?)/i);
                if (lineHeightMatch) {
                    style.lineHeight = this.ensureUnit(lineHeightMatch[1], '');
                }

                const widthMatch = segment.match(/\bwidth(?:[^0-9]+)?([0-9.]+(?:px|vw|%|em|rem)?)\b/i);
                if (widthMatch) {
                    style.width = this.ensureUnit(widthMatch[1], 'px');
                }

                const heightMatch = segment.match(/\bheight(?:[^0-9]+)?([0-9.]+(?:px|vh|%|em|rem)?)\b/i);
                if (heightMatch) {
                    style.height = this.ensureUnit(heightMatch[1], 'px');
                }

                const paddingMatch = segment.match(/\bpadding(?:[^0-9]+)?([0-9.\s]+(?:px|em|rem|%)?)/i);
                if (paddingMatch) {
                    style.padding = this.ensureBoxValueUnits(paddingMatch[1], 'px');
                }

                const marginMatch = segment.match(/\bmargin(?:[^0-9]+)?([0-9.\s]+(?:px|em|rem|%)?)/i);
                if (marginMatch) {
                    style.margin = this.ensureBoxValueUnits(marginMatch[1], 'px');
                }

                if (/\bbold\b/.test(lowerSegment)) {
                    style.fontWeight = '700';
                } else if (/\bsemi[-\s]?bold\b/.test(lowerSegment)) {
                    style.fontWeight = '600';
                } else if (/\blight(er)?\b/.test(lowerSegment) && lowerSegment.includes('font')) {
                    style.fontWeight = '300';
                }

                if (/\bitalic\b/.test(lowerSegment)) {
                    style.fontStyle = 'italic';
                }

                if (/\bunderline\b/.test(lowerSegment)) {
                    style.textDecoration = 'underline';
                } else if (/\bno underline\b/.test(lowerSegment)) {
                    style.textDecoration = 'none';
                }

                if (/\buppercase\b/.test(lowerSegment)) {
                    style.textTransform = 'uppercase';
                } else if (/\blowercase\b/.test(lowerSegment)) {
                    style.textTransform = 'lowercase';
                } else if (/\bcapitalize\b/.test(lowerSegment)) {
                    style.textTransform = 'capitalize';
                }

                if (lowerSegment.includes('align')) {
                    if (/center/.test(lowerSegment)) {
                        style.textAlign = 'center';
                    } else if (/left/.test(lowerSegment)) {
                        style.textAlign = 'left';
                    } else if (/right/.test(lowerSegment)) {
                        style.textAlign = 'right';
                    } else if (/justify/.test(lowerSegment)) {
                        style.textAlign = 'justify';
                    }
                }

                const opacityMatch = segment.match(/opacity(?:[^0-9]+)?([0-9.]+)/i);
                if (opacityMatch) {
                    style.opacity = opacityMatch[1];
                }

                if (Object.keys(style).length > 0) {
                    instructions.push(style);
                }
            });

            return instructions;
        }

        static extractAnimationInstructions(command) {
            if (!command) return [];
            const animations = new Set();
            const lowerCommand = command.toLowerCase();
            Object.entries(ANIMATION_SYNONYMS).forEach(([animation, keywords]) => {
                keywords.forEach(keyword => {
                    const keywordRegex = new RegExp(`\\b${keyword}\\b`, 'i');
                    if (keywordRegex.test(lowerCommand)) {
                        animations.add(animation);
                    }
                });
            });
            return Array.from(animations);
        }
    }

    // --- ICONS ---
    // SVG icons embedded directly for a self-contained script
    const ICONS = {
        logo: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14.47 15.06L12.12 12l2.35-3.06A8 8 0 006.35 4.94L4.94 6.35a8 8 0 009.12 9.12zm-5.35-2.05L7.88 12l-2.35 3.06A8 8 0 0017.65 19.06l1.41-1.41a8 8 0 00-9.12-9.12zM12 22a10 10 0 110-20 10 10 0 010 20z"/></svg>`,
        style: `<svg viewBox="0 0 20 20" fill="currentColor" class="chameleon-icon"><path d="M5 2.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM2.5 9a2.5 2.5 0 115 0 2.5 2.5 0 01-5 0zm12.5-4a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM10 9a2.5 2.5 0 115 0 2.5 2.5 0 01-5 0zM5 15.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM2.5 21a2.5 2.5 0 115 0 2.5 2.5 0 01-5 0zm12.5-4a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM10 21a2.5 2.5 0 115 0 2.5 2.5 0 01-5 0z"/></svg>`,
        analyze: `<svg viewBox="0 0 20 20" fill="currentColor" class="chameleon-icon"><path fill-rule="evenodd" d="M9 2a1 1 0 00-1 1v1a1 1 0 002 0V3a1 1 0 00-1-1zM4.22 3.78a1 1 0 00-1.42 1.42l.71.71a1 1 0 001.42-1.42l-.71-.71zM15.78 3.78a1 1 0 00-1.42-1.42l-.71.71a1 1 0 101.42 1.42l.71-.71zM2 9a1 1 0 00-1 1v1a1 1 0 002 0v-1a1 1 0 00-1-1zm16 0a1 1 0 00-1 1v1a1 1 0 002 0v-1a1 1 0 00-1-1zm-4.22 6.22a1 1 0 001.42-1.42l-.71-.71a1 1 0 00-1.42 1.42l.71.71zM6.22 13.78a1 1 0 001.42 1.42l.71-.71a1 1 0 00-1.42-1.42l-.71.71zM9 16a1 1 0 00-1 1v1a1 1 0 002 0v-1a1 1 0 00-1-1zm1-5a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/></svg>`,
        tools: `<svg viewBox="0 0 20 20" fill="currentColor" class="chameleon-icon"><path d="M10 3.5a.5.5 0 01.5.5v2a.5.5 0 01-1 0v-2a.5.5 0 01.5-.5zM10 14a.5.5 0 01.5.5v2a.5.5 0 01-1 0v-2a.5.5 0 01.5-.5zM5.12 5.12a.5.5 0 01.708 0l1.414 1.414a.5.5 0 01-.708.708L5.12 5.828a.5.5 0 010-.708zm8.486 8.486a.5.5 0 01.708 0l1.414 1.414a.5.5 0 01-.708.708l-1.414-1.414a.5.5 0 010-.708zM5.12 14.88a.5.5 0 010-.708l1.414-1.414a.5.5 0 01.708.708L5.828 14.88a.5.5 0 01-.708 0zm8.486-8.486a.5.5 0 010-.708l1.414-1.414a.5.5 0 01.708.708l-1.414 1.414a.5.5 0 01-.708 0zM3.5 10a.5.5 0 01.5-.5h2a.5.5 0 010 1h-2a.5.5 0 01-.5-.5zm12.5 0a.5.5 0 01.5-.5h2a.5.5 0 010 1h-2a.5.5 0 01-.5-.5z"/></svg>`,
        yootheme: `<svg viewBox="0 0 20 20" fill="currentColor" class="chameleon-icon"><path d="M4 3a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V4a1 1 0 00-1-1H4zm1 2h10v10H5V5zm2 2a1 1 0 011-1h6v3H7V7zm0 4h4v2H7v-2z"/></svg>`,
        genesis: `<svg viewBox="0 0 20 20" fill="currentColor" class="chameleon-icon"><path fill-rule="evenodd" d="M5 2a1 1 0 00-1 1v1.586l-1.707 1.707A1 1 0 003 8v8a1 1 0 001 1h12a1 1 0 001-1V8a1 1 0 00-.293-.707L15 5.586V3a1 1 0 00-1-1H5zm1 2h8v1.586l-1.293 1.293A1 1 0 0012 8H8a1 1 0 00-.707.293L6 6.586V4z" clip-rule="evenodd"/></svg>`,
        settings: `<svg viewBox="0 0 20 20" fill="currentColor" class="chameleon-icon"><path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0L8.12 5.12a1.5 1.5 0 01-1.34 1.34L4.88 7.2a1.5 1.5 0 00-1.03 2.6l1.34 1.34a1.5 1.5 0 010 2.68l-1.34 1.34a1.5 1.5 0 001.03 2.6l2.9-1.04a1.5 1.5 0 011.34 1.34l.39 2.9a1.5 1.5 0 002.98 0l.39-2.9a1.5 1.5 0 011.34-1.34l2.9 1.04a1.5 1.5 0 001.03-2.6l-1.34-1.34a1.5 1.5 0 010-2.68l1.34-1.34a1.5 1.5 0 00-1.03-2.6l-2.9 1.04a1.5 1.5 0 01-1.34-1.34L11.49 3.17zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/></svg>`,
        inspect: `<svg viewBox="0 0 20 20" fill="currentColor" class="chameleon-icon"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>`,
        palette: `<svg viewBox="0 0 20 20" fill="currentColor" class="chameleon-icon"><path fill-rule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 2.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>`,
        execute: `<svg viewBox="0 0 20 20" fill="currentColor" class="chameleon-icon"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>`,
        minimize: `<svg viewBox="0 0 20 20" fill="currentColor" class="chameleon-icon"><path fill-rule="evenodd" d="M5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z" clip-rule="evenodd" /></svg>`,
        record: `<svg viewBox="0 0 20 20" fill="currentColor" class="chameleon-icon"><circle cx="10" cy="10" r="6" /></svg>`,
        play: `<svg viewBox="0 0 20 20" fill="currentColor" class="chameleon-icon"><path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" /></svg>`,
        stop: `<svg viewBox="0 0 20 20" fill="currentColor" class="chameleon-icon"><rect x="6" y="6" width="8" height="8" rx="1" /></svg>`,
        spinner: `<svg class="chameleon-spinner" viewBox="0 0 50 50"><circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle></svg>`,
        performance: `<svg viewBox="0 0 20 20" fill="currentColor" class="chameleon-icon"><path d="M10.75 2.75a.75.75 0 00-1.5 0v8.25a.75.75 0 001.5 0V2.75z" /><path d="M14.25 10.75a.75.75 0 01.75-.75h1.25a.75.75 0 010 1.5h-1.25a.75.75 0 01-.75-.75zM10 14.25a.75.75 0 00-1.5 0v1.25a.75.75 0 001.5 0v-1.25z" /><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM3.5 10a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" clip-rule="evenodd" /></svg>`,
        security: `<svg viewBox="0 0 20 20" fill="currentColor" class="chameleon-icon"><path fill-rule="evenodd" d="M10 1.944A11.954 11.954 0 012.166 5.05l.002.001a12.017 12.017 0 01-1.066 5.86c-.345 1.639.206 3.42 1.066 4.77l.001.002a11.986 11.986 0 0115.664 0l.001-.002c.86-1.35.42-3.131.066-4.77a12.017 12.017 0 01-1.066-5.86l-.002-.001A11.954 11.954 0 0110 1.944zM8.707 13.293a1 1 0 01-1.414 0L5.586 11.586a1 1 0 111.414-1.414L8 11.172l4.293-4.293a1 1 0 111.414 1.414l-5 5z" clip-rule="evenodd" /></svg>`,
        copy: `<svg viewBox="0 0 20 20" fill="currentColor" class="chameleon-icon"><path d="M7 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V4a2 2 0 00-2-2H7z" /><path d="M4 6a2 2 0 012-2h2v2H6a1 1 0 00-1 1v10a1 1 0 001 1h6a1 1 0 001-1v-2h2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" /></svg>`,
        user: `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" /></svg>`,
        bulb: `<svg viewBox="0 0 20 20" fill="currentColor" class="chameleon-icon"><path fill-rule="evenodd" d="M11.668 1.458A1.5 1.5 0 0010 1.5c-2.485 0-4.5 2.015-4.5 4.5 0 1.137.411 2.222 1.152 3.057l-2.07 2.07a.75.75 0 001.06 1.06l2.07-2.07A4.482 4.482 0 0010 10.5c2.485 0 4.5-2.015 4.5-4.5a1.5 1.5 0 00-1.5-1.5c-.828 0-1.5.672-1.5 1.5 0 .414-.336.75-.75.75s-.75-.336-.75-.75c0-.828-.672-1.5-1.5-1.5a1.5 1.5 0 00-1.5 1.5c0 .414-.336.75-.75.75s-.75-.336-.75-.75c0-.828-.672-1.5-1.5-1.5zM10 12.25a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5a.75.75 0 01.75-.75z" clip-rule="evenodd" /></svg>`,
        network: `<svg viewBox="0 0 20 20" fill="currentColor" class="chameleon-icon"><path fill-rule="evenodd" d="M12.5 5.25A2.75 2.75 0 009.75 2.5h-5.5A2.75 2.75 0 001.5 5.25v5.5A2.75 2.75 0 004.25 13h5.5A2.75 2.75 0 0012.5 10.25v-5.5zM14.5 5.25a.75.75 0 00-.75-.75h-.75a.75.75 0 000 1.5h.75a.75.75 0 00.75-.75zM14.5 9.75a.75.75 0 00-.75-.75h-.75a.75.75 0 000 1.5h.75a.75.75 0 00.75-.75zM14.5 14.25a.75.75 0 00-.75-.75h-.75a.75.75 0 000 1.5h.75a.75.75 0 00.75-.75zM14.5 18.75a.75.75 0 00-.75-.75h-.75a.75.75 0 000 1.5h.75a.75.75 0 00.75-.75zM19.25 5.25a.75.75 0 00-.75-.75h-.75a.75.75 0 000 1.5h.75a.75.75 0 00.75-.75zM19.25 9.75a.75.75 0 00-.75-.75h-.75a.75.75 0 000 1.5h.75a.75.75 0 00.75-.75zM19.25 14.25a.75.75 0 00-.75-.75h-.75a.75.75 0 000 1.5h.75a.75.75 0 00.75-.75z" clip-rule="evenodd" /></svg>`,
        terminal: `<svg viewBox="0 0 20 20" fill="currentColor" class="chameleon-icon"><path fill-rule="evenodd" d="M2.5 4A1.5 1.5 0 001 5.5v9A1.5 1.5 0 002.5 16h15A1.5 1.5 0 0019 14.5v-9A1.5 1.5 0 0017.5 4h-15zM2.5 5.5h15v9H2.5v-9zM6 7.5a.5.5 0 01.5-.5h4a.5.5 0 010 1h-4a.5.5 0 01-.5-.5zM6 10.5a.5.5 0 01.5-.5h2a.5.5 0 010 1h-2a.5.5 0 01-.5-.5z" clip-rule="evenodd" /></svg>`,
    };

    // --- NEURAL THEMES ---
    // Predefined color themes for dynamic page restyling
    const NEURAL_THEMES = {
        neural_dark: { name: 'Neural Dark', bg: '#0d1117', text: '#e6edf3', primary: '#58a6ff', accent: '#1f6feb', card: '#161b22', border: '#30363d' },
        quantum_light: { name: 'Quantum Light', bg: '#ffffff', text: '#24292f', primary: '#0969da', accent: '#8250df', card: '#f6f8fa', border: '#d0d7de' },
        cyberpunk: { name: 'Cyberpunk', bg: '#0f0a1a', text: '#f5e1fd', primary: '#ff2a6d', accent: '#05d9e8', card: '#1a1436', border: '#2b1e5c' },
        bioshock: { name: 'Bioshock', bg: '#0c1b33', text: '#e8f4f8', primary: '#c5a880', accent: '#9c7c5c', card: '#152642', border: '#2a4d69' },
        material_x: { name: 'Material X', bg: '#1e1e1e', text: '#e0e0e0', primary: '#bb86fc', accent: '#03dac6', card: '#2d2d2d', border: '#444444' },
        solarized_dark: { name: "Solarized Dark", bg: '#002b36', text: '#839496', primary: '#268bd2', accent: '#cb4b16', card: '#073642', border: '#586e75' },
        dracula: { name: "Dracula", bg: '#282a36', text: '#f8f8f2', primary: '#bd93f9', accent: '#ff79c6', card: '#44475a', border: '#6272a4' },
        nord: { name: "Nord", bg: '#2e3440', text: '#d8dee9', primary: '#88c0d0', accent: '#ebcb8b', card: '#3b4252', border: '#4c566a' },
        gruvbox: { name: "Gruvbox", bg: '#282828', text: '#ebdbb2', primary: '#fabd2f', accent: '#fe8019', card: '#3c3836', border: '#504945' },
    };

    // --- UTILITIES ---
    class DOMUtils {
        /**
         * Generates a highly specific and robust CSS selector for a given element.
         * Prioritizes ID, then unique attributes, then class names, and finally falls back to nth-of-type.
         * @param {Element} el The element to generate a selector for.
         * @returns {string} A CSS selector string.
         */
        static getSelector(el) {
            if (!el || !(el instanceof Element)) return '';

            // 1. Prioritize ID if it's unique
            if (el.id) {
                const id = CSS.escape(el.id);
                if (document.querySelectorAll(`#${id}`).length === 1) {
                    return `#${id}`;
                }
            }

            // 2. Path-based selector as a robust fallback
            const path = [];
            let current = el;
            while (current.nodeType === Node.ELEMENT_NODE) {
                let selector = current.nodeName.toLowerCase();
                if (current.id) {
                    selector += `#${CSS.escape(current.id)}`;
                    path.unshift(selector);
                    break; // ID is unique enough to stop
                }

                // Add significant classes (ignore numeric or chameleon-specific classes)
                const significantClasses = Array.from(current.classList).filter(c => !/^\d+$/.test(c) && !c.startsWith('chameleon-'));
                if (significantClasses.length > 0) {
                    selector += '.' + significantClasses.map(c => CSS.escape(c)).join('.');
                }

                // Fallback to nth-of-type if needed for disambiguation
                let sib = current, nth = 1;
                while (sib = sib.previousElementSibling) {
                    if (sib.nodeName.toLowerCase() === current.nodeName.toLowerCase()) nth++;
                }
                // Only add nth-of-type if it's not the first child OR if there are multiple children of the same type
                if (nth !== 1 || (current.parentElement && Array.from(current.parentElement.children).filter(child => child.nodeName === current.nodeName).length > 1)) {
                    selector += `:nth-of-type(${nth})`;
                }

                path.unshift(selector);
                if (current.parentElement && current.parentElement.nodeName === 'BODY') break; // Stop at body
                current = current.parentNode;
            }
            return path.join(' > ');
        }

        /**
         * Creates a removable overlay for dynamically injected elements.
         * @param {Element} targetElement The element to attach the overlay to.
         * @param {function} removeCallback Function to call when the overlay is clicked.
         */
        static createRemovableOverlay(targetElement, removeCallback) {
            const overlay = document.createElement('div');
            overlay.className = `${CONFIG.ID_PREFIX}removable-overlay`;
            overlay.textContent = 'Click to Remove';
            overlay.style.cssText = `
                position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(255, 0, 0, 0.3); color: white;
                display: flex; align-items: center; justify-content: center;
                font-size: 12px; font-weight: bold; cursor: pointer;
                opacity: 0; transition: opacity 0.3s ease;
                z-index: 10000; /* Above normal content, below Chameleon UI */
                pointer-events: auto; /* Allow clicks */
                box-sizing: border-box;
                border: 2px dashed red;
            `;

            targetElement.style.position = targetElement.style.position === 'static' ? 'relative' : targetElement.style.position;
            targetElement.appendChild(overlay);

            // Show overlay on hover
            targetElement.addEventListener('mouseenter', () => {
                overlay.style.opacity = '1';
            });
            targetElement.addEventListener('mouseleave', () => {
                overlay.style.opacity = '0';
            });

            overlay.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent click from affecting underlying elements
                e.preventDefault();
                removeCallback();
                overlay.remove();
            });
        }
    }

    // --- MAIN CONTROLLER ---
    class ChameleonAIForge {
        constructor() {
            this.state = {
                isInitialized: false,
                isPanelOpen: GM_getValue('panelOpen', false),
                activeTab: 'genesis',
                isInspecting: false,
                selectedElement: null,
                sessionId: `CHA-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                featuresPaused: false, // For tab visibility/performance
                registeredTools: [], // For Plugin API
            };

            // Core Systems
            this.ui = new UIManager(this);
            this.settings = new SettingsManager(this);

            // Functional Modules
            this.styler = new NeuralStyleEngine(this);
            this.analyzer = new PageAnalyzer(this);
            this.toolkit = new ToolKit(this);
            this.genesis = new GenesisDriver(this);
            this.foresight = new ForesightEngine(this);
            this.apiMonitor = new APIMonitor(this); // New: API Interception
            this.vulnerabilityScanner = new VulnerabilityScanner(this); // New: Vulnerability Scanner
            this.yooThemeAgent = new YooThemeBuilderAgent(this); // YOOtheme Builder automation

            // Agent Core (The Brain)
            this.agent = new AgentCore(this);

            // Interactive Tools
            this.palette = new CommandPalette(this);
            this.contextMenu = new ContextMenu(this);
            this.highlighter = new ElementHighlighter(this);

            // Expose public API for plugins
            this.exposePluginAPI();
        }

        async init() {
            // Prevent running in iframes to avoid conflicts and unnecessary resource usage
            if (this.isFrame() || this.state.isInitialized) {
                this.log('Chameleon AI-Forge: Detected as iframe or already initialized. Skipping.');
                return;
            }

            this.log(`Initializing Genesis Command Center v${CONFIG.VERSION}...`);

            // Early initialization for styling to ensure UI elements are styled correctly from the start
            addGlobalStyles();
            this.styler.init(); // Apply saved theme immediately
            this.apiMonitor.init(); // Initialize API Monitor early to intercept requests

            // Defer UI injection until DOM is ready to prevent layout shifts
            await this.waitForDOMReady();

            this.ui.inject();
            // Render module content after UI is injected into the DOM
            Object.values(this).forEach(module => {
                if (module && typeof module.render === 'function') {
                    module.render();
                }
            });

            // Initialize core functional modules and agent
            this.foresight.init();
            this.agent.init(); // Initialize agent after other modules are ready to receive insights
            this.palette.init();
            this.contextMenu.init();
            this.highlighter.init();
            this.setupGlobalListeners();

            // Show welcome modal on first run
            if (GM_getValue('firstRun', true)) {
                this.ui.showWelcomeModal();
                GM_setValue('firstRun', false);
            }

            this.state.isInitialized = true;
            this.yooThemeAgent.register();
            this.log('Genesis Command Center Initialized.');

            // Register Greasemonkey menu commands for easy access
            GM_registerMenuCommand('Toggle Chameleon Command Center', () => this.ui.togglePanel());
            GM_registerMenuCommand('Open Command Palette (Ctrl+Shift+P)', () => this.palette.toggle());
        }

        // Utility to wait for the DOM to be fully loaded
        waitForDOMReady() {
            return new Promise(resolve => {
                if (document.readyState === 'interactive' || document.readyState === 'complete') {
                    resolve();
                } else {
                    window.addEventListener('DOMContentLoaded', resolve, { once: true });
                }
            });
        }

        // Checks if the script is running inside an iframe
        isFrame() {
            // Check if the script is running in a sandboxed iframe, which is a common practice for userscript managers.
            return window.self !== window.top || document.documentElement.hasAttribute('sandbox');
        }

        // Sets up global keyboard and visibility listeners
        setupGlobalListeners() {
            document.addEventListener('keydown', (e) => {
                // Ctrl+Shift+P for Command Palette
                if (e.ctrlKey && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
                    e.preventDefault();
                    this.palette.toggle();
                    this.agent.trackUserActivity('keyboard_shortcut', { shortcut: 'Ctrl+Shift+P' });
                }
                // Escape key to close modals/modes
                if (e.key === 'Escape') {
                    if (this.palette.isOpen) this.palette.hide();
                    if (this.state.isInspecting) this.toggleInspectMode(false);
                    if (this.contextMenu.isOpen) this.contextMenu.hide();
                    if (this.toolkit.appIsolation.isSelectionMode) this.toolkit.appIsolation.exitSelectionMode();
                    this.ui.hideAllRemovableOverlays(); // Hide any active removable overlays
                    this.agent.trackUserActivity('keyboard_shortcut', { shortcut: 'Escape' });
                }
            });

            // Pause features when tab is hidden to save resources
            document.addEventListener('visibilitychange', () => {
                this.state.featuresPaused = document.hidden;
                this.log(`Features ${this.state.featuresPaused ? 'paused' : 'resumed'}.`);
                this.agent.trackUserActivity('visibility_change', { hidden: document.hidden });
            });
        }

        // Toggles the element inspection mode
        toggleInspectMode(forceState) {
            this.state.isInspecting = typeof forceState === 'boolean' ? forceState : !this.state.isInspecting;
            this.ui.updateInspectModeButton();
            if (this.state.isInspecting) {
                this.highlighter.start();
                this.ui.showNotification('Inspect Mode Enabled: Hover over an element to see details, click to select.', 5000);
                this.agent.trackUserActivity('inspect_mode_enabled');
            } else {
                this.highlighter.stop();
                this.ui.showNotification('Inspect Mode Disabled.', 2000);
                this.agent.trackUserActivity('inspect_mode_disabled');
            }
        }

        // Sets the currently selected element and triggers analysis
        setSelectedElement(element) {
            this.state.selectedElement = element;
            this.log('Element selected:', element);
            this.toggleInspectMode(false); // Exit inspect mode after selection
            this.ui.showPanel(); // Ensure panel is open
            this.ui.switchTab('analyze'); // Switch to analyze tab
            this.analyzer.analyzeElement(element); // Analyze the element
            this.agent.trackUserActivity('element_selected', { selector: DOMUtils.getSelector(element) });
        }

        // Public API for plugins
        exposePluginAPI() {
            if (typeof ROOT_WINDOW.ChameleonAI === 'undefined') {
                ROOT_WINDOW.ChameleonAI = {
                    registerTool: (tool) => this.registerTool(tool),
                    getController: () => this, // Provide access to controller for advanced plugins
                    DOMUtils: DOMUtils, // Expose utilities
                };
                this.log('ChameleonAI plugin API exposed.');
            }
        }

        /**
         * Allows external scripts to register new tools/plugins.
         * @param {object} tool - Tool definition object.
         * @param {string} tool.id - Unique ID for the tool (e.g., 'my-custom-tool').
         * @param {string} tool.name - Display name for the tool (e.g., 'My Custom Tool').
         * @param {string} tool.icon - SVG icon string for the tab/command.
         * @param {function(HTMLElement, ChameleonAIForge)} tool.renderFn - Function to render the tool's content into its tab. Receives the tab's DOM element and the controller.
         * @param {Array<object>} [tool.commands] - Array of commands to add to the Command Palette. Each { name, icon, action }.
         * @param {Array<object>} [tool.contextMenuItems] - Array of context menu items. Each { name, icon, action }.
         */
        registerTool(tool) {
            if (!tool.id || !tool.name || !tool.icon || typeof tool.renderFn !== 'function') {
                this.error('Invalid tool registration: Missing id, name, icon, or renderFn.', tool);
                return;
            }
            if (this.state.registeredTools.some(t => t.id === tool.id)) {
                this.error(`Tool with ID "${tool.id}" already registered.`);
                return;
            }

            this.state.registeredTools.push(tool);
            this.ui.addPluginTab(tool.id, tool.name, tool.icon);
            if (tool.commands) {
                tool.commands.forEach(cmd => this.palette.registerCommand(cmd));
            }
            if (tool.contextMenuItems) {
                tool.contextMenuItems.forEach(item => this.contextMenu.registerItem(item));
            }
            // Render the plugin's content if the UI is already injected
            if (this.state.isInitialized) {
                const tabContentEl = document.getElementById(`${CONFIG.ID_PREFIX}tab-${tool.id}`);
                if (tabContentEl) {
                    tool.renderFn(tabContentEl, this);
                }
            }
            this.log(`Plugin "${tool.name}" registered successfully.`);
            this.ui.showNotification(`Plugin "${tool.name}" loaded!`, 3000, { type: 'success' });
        }

        // Custom logging for debugging
        log(...args) {
            if (CONFIG.DEBUG) console.log('%c[CGF]', 'color: var(--chameleon-accent); font-weight: bold;', ...args);
        }
        error(...args) {
            console.error('%c[CGF]', 'color: var(--danger); font-weight: bold;', ...args);
        }
    }

    // --- UI MANAGER ---
    // Handles all user interface creation, rendering, and interaction
    class UIManager {
        constructor(controller) {
            this.controller = controller;
            this.elements = {};
            this.dragState = {};
            this.resizeState = {};
            this.notificationCounter = 0; // Unique ID for notifications
            this.removableOverlays = []; // Track active removable overlays
        }

        // Injects the main UI components into the DOM
        inject() {
            this.createWidget();
            this.createPanel();
            this.bindWidgetEvents();
            this.bindPanelEvents();
            this.updatePanelState(); // Apply saved state (open/closed, position, size)
            this.updateWidgetState();
        }

        // Creates the floating widget button
        createWidget() {
            const widget = document.createElement('div');
            widget.id = `${CONFIG.ID_PREFIX}widget`;
            widget.innerHTML = `${ICONS.logo}<div class="${CONFIG.ID_PREFIX}widget-badge"></div>`;
            document.body.appendChild(widget);
            this.elements.widget = widget;
            this.elements.widgetBadge = widget.querySelector(`.${CONFIG.ID_PREFIX}widget-badge`);
        }

        // Creates the main command center panel
        createPanel() {
            const panel = document.createElement('div');
            panel.id = `${CONFIG.ID_PREFIX}panel`;
            panel.className = 'chameleon-panel';
            panel.style.display = 'none'; // Hidden by default, updated by updatePanelState
            panel.innerHTML = `
                <div class="${CONFIG.ID_PREFIX}panel-bg"></div>
                <div class="${CONFIG.ID_PREFIX}header">
                    <div class="${CONFIG.ID_PREFIX}header-left">
                        <span class="${CONFIG.ID_PREFIX}logo">${ICONS.logo}</span>
                        <span class="${CONFIG.ID_PREFIX}title">Genesis Command Center</span>
                    </div>
                    <div class="${CONFIG.ID_PREFIX}header-right">
                        <button data-action="toggleInspect" class="chameleon-btn-icon" title="Toggle Inspect Mode (I)">${ICONS.inspect}</button>
                        <button data-action="togglePalette" class="chameleon-btn-icon" title="Command Palette (Ctrl+Shift+P)">${ICONS.palette}</button>
                        <button data-action="togglePanel" class="chameleon-btn-icon" title="Minimize to Widget">${ICONS.minimize}</button>
                    </div>
                </div>
                <div class="${CONFIG.ID_PREFIX}body">
                    <div class="${CONFIG.ID_PREFIX}sidebar">
                        <button data-tab="genesis" class="chameleon-tab" title="Genesis AI Driver">${ICONS.genesis}</button>
                        <button data-tab="analyze" class="chameleon-tab" title="Page Analyzer">${ICONS.analyze}</button>
                        <button data-tab="network" class="chameleon-tab" title="API Monitor">${ICONS.network}</button>
                        <button data-tab="security" class="chameleon-tab" title="Security Scanner">${ICONS.security}</button>
                        <button data-tab="tools" class="chameleon-tab" title="Toolkit">${ICONS.tools}</button>
                        <button data-tab="style" class="chameleon-tab" title="Style Engine">${ICONS.style}</button>
                        <button data-tab="settings" class="chameleon-tab" title="Settings">${ICONS.settings}</button>
                        <div id="${CONFIG.ID_PREFIX}plugin-tabs-container" class="chameleon-plugin-tabs-container"></div>
                    </div>
                    <div class="${CONFIG.ID_PREFIX}content-wrapper">
                         <div class="${CONFIG.ID_PREFIX}content">
                            <div id="${CONFIG.ID_PREFIX}tab-genesis" class="chameleon-tab-content"></div>
                            <div id="${CONFIG.ID_PREFIX}tab-analyze" class="chameleon-tab-content"></div>
                            <div id="${CONFIG.ID_PREFIX}tab-network" class="chameleon-tab-content"></div>
                            <div id="${CONFIG.ID_PREFIX}tab-security" class="chameleon-tab-content"></div>
                            <div id="${CONFIG.ID_PREFIX}tab-tools" class="chameleon-tab-content"></div>
                            <div id="${CONFIG.ID_PREFIX}tab-style" class="chameleon-tab-content"></div>
                            <div id="${CONFIG.ID_PREFIX}tab-settings" class="chameleon-tab-content"></div>
                        </div>
                    </div>
                </div>
                <div class="${CONFIG.ID_PREFIX}footer">
                    <div id="${CONFIG.ID_PREFIX}status" class="chameleon-status">Ready. v${CONFIG.VERSION}</div>
                    <div class="${CONFIG.ID_PREFIX}resize-handle"></div>
                </div>
            `;
            document.body.appendChild(panel);
            this.elements.panel = panel;
            this.elements.header = panel.querySelector(`.${CONFIG.ID_PREFIX}header`);
            this.elements.body = panel.querySelector(`.${CONFIG.ID_PREFIX}body`);
            this.elements.status = panel.querySelector(`#${CONFIG.ID_PREFIX}status`);
            this.elements.resizeHandle = panel.querySelector(`.${CONFIG.ID_PREFIX}resize-handle`);
            this.elements.contentArea = panel.querySelector(`.${CONFIG.ID_PREFIX}content`);
            this.elements.pluginTabsContainer = panel.querySelector(`#${CONFIG.ID_PREFIX}plugin-tabs-container`);

            // Add plugin tabs if any were registered before UI injection
            this.controller.state.registeredTools.forEach(tool => this.addPluginTab(tool.id, tool.name, tool.icon));

            this.switchTab(this.controller.state.activeTab); // Set initial active tab
        }

        // Adds a new tab for a registered plugin
        addPluginTab(id, name, icon) {
            const button = document.createElement('button');
            button.dataset.tab = id;
            button.className = 'chameleon-tab';
            button.title = name;
            button.innerHTML = icon;
            this.elements.pluginTabsContainer.appendChild(button);

            const contentDiv = document.createElement('div');
            contentDiv.id = `${CONFIG.ID_PREFIX}tab-${id}`;
            contentDiv.className = 'chameleon-tab-content';
            this.elements.contentArea.appendChild(contentDiv);

            // Render plugin content if already initialized
            if (this.controller.state.isInitialized) {
                const tool = this.controller.state.registeredTools.find(t => t.id === id);
                if (tool) tool.renderFn(contentDiv, this.controller);
            }
        }

        // Binds events for the widget (click, drag)
        bindWidgetEvents() {
            this.elements.widget.addEventListener('click', () => {
                this.controller.agent.trackUserActivity('widget_click', { action: 'toggle_panel' });
                this.togglePanel();
            });
            this.makeDraggable(this.elements.widget, this.elements.widget);
        }

        // Binds events for the panel (header buttons, tab switching, drag, resize)
        bindPanelEvents() {
            this.elements.header.addEventListener('click', (e) => {
                const button = e.target.closest('button');
                if (!button) return;
                const action = button.dataset.action;
                this.controller.agent.trackUserActivity('panel_header_button_click', { action: action });
                switch (action) {
                    case 'togglePanel': this.togglePanel(); break;
                    case 'toggleInspect': this.controller.toggleInspectMode(); break;
                    case 'togglePalette': this.controller.palette.toggle(); break;
                }
            });

            this.elements.body.querySelector(`.${CONFIG.ID_PREFIX}sidebar`).addEventListener('click', (e) => {
                const button = e.target.closest('button');
                if (button && button.dataset.tab) {
                    this.controller.agent.trackUserActivity('tab_switch', { tab: button.dataset.tab });
                    this.switchTab(button.dataset.tab);
                }
            });

            this.makeDraggable(this.elements.panel, this.elements.header);
            this.makeResizable(this.elements.panel, this.elements.resizeHandle);
        }

        // Makes an element draggable using a handle
        makeDraggable(target, handle) {
            handle.addEventListener('mousedown', (e) => {
                // Prevent dragging if clicking on a button or resize handle within the header
                if (e.target.closest('button') || e.target.classList.contains(`${CONFIG.ID_PREFIX}resize-handle`)) return;
                e.preventDefault(); // Prevent text selection etc.
                this.dragState = {
                    isDragging: true,
                    target: target,
                    startX: e.clientX,
                    startY: e.clientY,
                    initialX: target.offsetLeft,
                    initialY: target.offsetTop,
                };
                document.addEventListener('mousemove', this.onDrag);
                document.addEventListener('mouseup', this.onDragEnd, { once: true });
            });
        }

        // Handles mouse movement during drag
        onDrag = (e) => {
            if (!this.dragState.isDragging) return;
            e.preventDefault();
            const dx = e.clientX - this.dragState.startX;
            const dy = e.clientY - this.dragState.startY;
            this.dragState.target.style.left = `${this.dragState.initialX + dx}px`;
            this.dragState.target.style.top = `${this.dragState.initialY + dy}px`;
        }

        // Handles mouse release after drag, saves position
        onDragEnd = () => {
            if (!this.dragState.isDragging) return;
            const key = this.dragState.target.id === `${CONFIG.ID_PREFIX}widget` ? 'widgetPos' : 'panelPos';
            GM_setValue(key, { top: this.dragState.target.style.top, left: this.dragState.target.style.left });
            this.dragState.isDragging = false;
            document.removeEventListener('mousemove', this.onDrag);
            this.controller.agent.trackUserActivity('ui_dragged', { element: key });
        }

        // Makes an element resizable using a handle
        makeResizable(target, handle) {
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.resizeState = {
                    isResizing: true,
                    target: target,
                    startX: e.clientX,
                    startY: e.clientY,
                    initialW: target.offsetWidth,
                    initialH: target.offsetHeight,
                };
                document.addEventListener('mousemove', this.onResize);
                document.addEventListener('mouseup', this.onResizeEnd, { once: true });
            });
        }

        // Handles mouse movement during resize
        onResize = (e) => {
            if (!this.resizeState.isResizing) return;
            e.preventDefault();
            const dx = e.clientX - this.resizeState.startX;
            const dy = e.clientY - this.resizeState.startY;
            const newWidth = Math.max(400, this.resizeState.initialW + dx);
            const newHeight = Math.max(300, this.resizeState.initialH + dy);
            this.resizeState.target.style.width = `${newWidth}px`;
            this.resizeState.target.style.height = `${newHeight}px`;
        }

        // Handles mouse release after resize, saves dimensions
        onResizeEnd = () => {
            if (!this.resizeState.isResizing) return;
            GM_setValue('panelSize', { width: this.resizeState.target.style.width, height: this.resizeState.target.style.height });
            this.resizeState.isResizing = false;
            document.removeEventListener('mousemove', this.onResize);
            this.controller.agent.trackUserActivity('ui_resized', { width: this.resizeState.target.style.width, height: this.resizeState.target.style.height });
        }

        // Toggles the visibility of the main panel
        togglePanel() {
            this.controller.state.isPanelOpen = !this.controller.state.isPanelOpen;
            this.updatePanelState();
            GM_setValue('panelOpen', this.controller.state.isPanelOpen);
        }

        // Forces the panel to show
        showPanel() {
            if (this.controller.state.isPanelOpen) return;
            this.togglePanel();
        }

        // Updates the widget's visibility and position based on panel state
        updateWidgetState() {
            const pos = GM_getValue('widgetPos', { top: `${window.innerHeight - 80}px`, left: '30px' });
            this.elements.widget.style.top = pos.top;
            this.elements.widget.style.left = pos.left;
            this.elements.widget.classList.toggle('hidden', this.controller.state.isPanelOpen);
        }

        // Sets the text and visibility of the widget's badge
        setWidgetBadge(count) {
            if (count > 0) {
                this.elements.widgetBadge.textContent = count;
                this.elements.widgetBadge.classList.add('visible');
            } else {
                this.elements.widgetBadge.classList.remove('visible');
            }
        }

        // Updates the panel's visibility, position, and size based on saved state
        updatePanelState() {
            const { isPanelOpen } = this.controller.state;
            const panel = this.elements.panel;

            const pos = GM_getValue('panelPos', { top: `${(window.innerHeight - 600) / 2}px`, left: `${(window.innerWidth - 800) / 2}px` });
            const size = GM_getValue('panelSize', { width: '800px', height: '600px' });
            panel.style.top = pos.top;
            panel.style.left = pos.left;
            panel.style.width = size.width;
            panel.style.height = size.height;

            if (isPanelOpen) {
                panel.style.display = 'flex';
                // Trigger reflow to ensure animation plays
                void panel.offsetWidth;
                panel.classList.remove('minimized');
            } else {
                panel.classList.add('minimized');
                // Hide after animation
                setTimeout(() => {
                    if (!this.controller.state.isPanelOpen) { // Double check state in case it was toggled back quickly
                        panel.style.display = 'none';
                    }
                }, 300); // Matches animation duration
            }
            this.updateWidgetState();
        }

        // Switches the active tab in the panel
        switchTab(tabId) {
            this.controller.state.activeTab = tabId;
            this.elements.body.querySelectorAll('.chameleon-tab').forEach(t => t.classList.remove('active'));
            this.elements.body.querySelectorAll('.chameleon-tab-content').forEach(c => c.classList.remove('active'));
            this.elements.body.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
            this.elements.body.querySelector(`#${CONFIG.ID_PREFIX}tab-${tabId}`).classList.add('active');
        }

        // Updates the visual state of the inspect mode button
        updateInspectModeButton() {
            this.elements.header.querySelector('[data-action="toggleInspect"]').classList.toggle('active', this.controller.state.isInspecting);
        }

        // Updates the status bar message
        updateStatus(text, type = 'info', duration = 0) {
            this.elements.status.textContent = text;
            this.elements.status.className = `chameleon-status status-${type}`;
            if (duration > 0) {
                clearTimeout(this.statusTimeout);
                this.statusTimeout = setTimeout(() => this.updateStatus(`Ready. v${CONFIG.VERSION}`), duration);
            }
        }

        // Displays a toast notification
        showNotification(message, duration = 3000, options = {}) {
            const notification = document.createElement('div');
            notification.className = `${CONFIG.ID_PREFIX}notification status-${options.type || 'info'}`;
            notification.id = `${CONFIG.ID_PREFIX}notification-${this.notificationCounter++}`;

            let container = document.getElementById(`${CONFIG.ID_PREFIX}notification-container`);
            if (!container) {
                container = document.createElement('div');
                container.id = `${CONFIG.ID_PREFIX}notification-container`;
                document.body.appendChild(container);
            }

            notification.innerHTML = `<span>${message}</span>`;
            if (options.actionText && options.actionCallback) {
                const actionBtn = document.createElement('button');
                actionBtn.textContent = options.actionText;
                actionBtn.onclick = () => {
                    options.actionCallback();
                    notification.classList.remove('show');
                    setTimeout(() => notification.remove(), 300); // Remove after fade out
                };
                notification.appendChild(actionBtn);
            }

            container.appendChild(notification);
            // Trigger reflow to ensure CSS transition plays
            void notification.offsetWidth;
            notification.classList.add('show');

            setTimeout(() => {
                notification.classList.remove('show');
                setTimeout(() => notification.remove(), 300); // Remove after fade out
            }, duration);
        }

        // Registers a removable overlay with the UI manager
        addRemovableOverlay(overlayElement, targetElement) {
            this.removableOverlays.push({ overlay: overlayElement, target: targetElement });
        }

        // Hides all active removable overlays
        hideAllRemovableOverlays() {
            this.removableOverlays.forEach(item => {
                if (item.overlay && item.overlay.parentNode) {
                    item.overlay.style.opacity = '0';
                    setTimeout(() => item.overlay.remove(), 300); // Remove after fade out
                }
            });
            this.removableOverlays = []; // Clear the list
        }

        // Displays the welcome modal on first run
        showWelcomeModal() {
            const modal = document.createElement('div');
            modal.id = `${CONFIG.ID_PREFIX}welcome-modal`;
            modal.className = 'chameleon-modal-overlay';
            modal.innerHTML = `
                <div class="chameleon-modal-content">
                    <div class="chameleon-modal-header">
                        <span class="${CONFIG.ID_PREFIX}logo">${ICONS.logo}</span>
                        <h3>Welcome to the Genesis Command Center</h3>
                    </div>
                    <div class="chameleon-modal-body">
                        <p>Your AI web co-pilot is now active. Here are the basics:</p>
                        <ul>
                            <li><strong>This Widget:</strong> Click me anytime to open the main Command Center.</li>
                            <li><strong>Command Palette:</strong> Press <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> for quick access to all tools.</li>
                            <li><strong>Element Inspector:</strong> Click the <span class="chameleon-kbd-icon">${ICONS.inspect}</span> icon to analyze page elements.</li>
                            <li><strong>Context Menu:</strong> Hold <kbd>Alt</kbd> and right-click on any element for quick actions.</li>
                            <li><strong>Genesis AI:</strong> Use the Genesis tab to give complex instructions in plain English.</li>
                        </ul>
                        <p>Explore the tabs to discover powerful styling, analysis, and automation tools.</p>
                    </div>
                    <div class="chameleon-modal-footer">
                        <button id="${CONFIG.ID_PREFIX}welcome-close" class="chameleon-button">Let's Go!</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            document.getElementById(`${CONFIG.ID_PREFIX}welcome-close`).addEventListener('click', () => {
                modal.classList.add('hidden');
                setTimeout(() => modal.remove(), 300); // Remove after fade out
                this.controller.agent.trackUserActivity('welcome_modal_closed');
            });
        }
    }

    // --- MODULES ---

    // Manages dynamic page styling and themes, now with generative UI
    class NeuralStyleEngine {
        constructor(controller) {
            this.controller = controller;
            this.currentTheme = GM_getValue('chameleon_theme', 'neural_dark');
        }

        // Initializes the style engine by applying the last saved theme
        init() {
            this.applyTheme(this.currentTheme, true); // Apply theme on init
        }

        // Renders the style engine UI in its tab
        render() {
            const container = document.getElementById(`${CONFIG.ID_PREFIX}tab-style`);
            if (!container) return;
            container.innerHTML = `
                <h3>Neural Style Engine</h3>
                <p>Dynamically restyle the entire page with a single click. Select a theme or apply custom CSS.</p>
                <div class="chameleon-card">
                    <div class="chameleon-form-group">
                        <label for="chameleon-theme-select">Neural Theme</label>
                        <select id="chameleon-theme-select" class="chameleon-select">
                            ${Object.entries(NEURAL_THEMES).map(([key, theme]) =>
                `<option value="${key}" ${key === this.currentTheme ? 'selected' : ''}>${theme.name}</option>`
            ).join('')}
                        </select>
                    </div>
                </div>
                <div class="chameleon-card">
                    <h4>${ICONS.terminal} Generative UI</h4>
                    <p>Describe a component, and the AI will attempt to generate and inject it into the page.</p>
                    <div class="chameleon-form-group">
                        <label for="chameleon-generate-ui-prompt">Component Description</label>
                        <textarea id="chameleon-generate-ui-prompt" class="chameleon-textarea" placeholder="e.g., 'a simple login form with email and password fields', 'a product card with image, title, price, and add to cart button'"></textarea>
                    </div>
                    <button id="chameleon-generate-ui-btn" class="chameleon-button">${ICONS.execute} Generate & Inject</button>
                </div>
                <div class="chameleon-card">
                    <div class="chameleon-form-group">
                        <label for="chameleon-custom-css">Custom CSS Injection</label>
                        <textarea id="chameleon-custom-css" class="chameleon-textarea" placeholder="e.g., body { font-family: 'Comic Sans MS' !important; }"></textarea>
                    </div>
                    <button id="chameleon-apply-css-btn" class="chameleon-button">${ICONS.execute} Apply Custom CSS</button>
                    <button id="chameleon-reset-style-btn" class="chameleon-button secondary">${ICONS.style} Reset All Styles</button>
                </div>
            `;

            container.querySelector('#chameleon-theme-select').addEventListener('change', (e) => {
                this.applyTheme(e.target.value);
                this.controller.agent.trackUserActivity('theme_selected', { theme: e.target.value });
            });
            container.querySelector('#chameleon-apply-css-btn').addEventListener('click', () => {
                const css = container.querySelector('#chameleon-custom-css').value;
                this.applyCustomCSS(css);
                this.controller.agent.trackUserActivity('custom_css_applied');
            });
            container.querySelector('#chameleon-reset-style-btn').addEventListener('click', () => {
                this.resetStyles();
                this.controller.agent.trackUserActivity('styles_reset');
            });
            container.querySelector('#chameleon-generate-ui-btn').addEventListener('click', () => {
                const prompt = container.querySelector('#chameleon-generate-ui-prompt').value;
                this.generateUI(prompt);
            });
        }

        // Applies a selected theme to the page by updating CSS variables and body class
        applyTheme(themeKey, isInitial = false) {
            const theme = NEURAL_THEMES[themeKey];
            if (!theme) {
                this.controller.error(`Theme "${themeKey}" not found.`);
                return;
            }

            this.currentTheme = themeKey;
            GM_setValue('chameleon_theme', themeKey);

            // Apply theme colors to CSS variables
            let rootStyleEl = document.getElementById(`${CONFIG.ID_PREFIX}root-styles`);
            if (!rootStyleEl) {
                rootStyleEl = document.createElement('style');
                rootStyleEl.id = `${CONFIG.ID_PREFIX}root-styles`;
                document.head.appendChild(rootStyleEl);
            }
            rootStyleEl.textContent = `
                :root {
                    --chameleon-bg: ${theme.bg};
                    --chameleon-text: ${theme.text};
                    --chameleon-primary: ${theme.primary};
                    --chameleon-accent: ${theme.accent};
                    --chameleon-card: ${theme.card};
                    --chameleon-border: ${theme.border};
                    --chameleon-accent-glow: ${this.hexToRgba(theme.accent, 0.5)};
                    --bg-panel: ${this.hexToRgba(theme.card, 0.8)};
                    --bg-glass: ${this.hexToRgba(theme.card, 0.7)};
                    --border-color: ${this.hexToRgba(theme.border, 0.5)};
                    --header-bg: ${this.hexToRgba(theme.bg, 0.6)};
                }
            `;

            // Apply global page styling overrides
            let pageStyleEl = document.getElementById(`${CONFIG.ID_PREFIX}page-styles`);
            if (!pageStyleEl) {
                pageStyleEl = document.createElement('style');
                pageStyleEl.id = `${CONFIG.ID_PREFIX}page-styles`;
                document.head.appendChild(pageStyleEl);
            }
            pageStyleEl.textContent = `
                body.chameleon-themed {
                    background-color: var(--chameleon-bg) !important;
                    color: var(--chameleon-text) !important;
                    transition: background-color 0.5s, color 0.5s;
                }
                .chameleon-themed a { color: var(--chameleon-primary) !important; }
                .chameleon-themed button, .chameleon-themed input[type="submit"], .chameleon-themed input[type="button"] {
                    background-color: var(--chameleon-primary) !important;
                    color: ${this.getContrastYIQ(theme.primary)} !important;
                    border: 1px solid var(--chameleon-border) !important;
                }
                .chameleon-themed input, .chameleon-themed textarea, .chameleon-themed select {
                    background-color: var(--chameleon-card) !important;
                    color: var(--chameleon-text) !important;
                    border: 1px solid var(--chameleon-border) !important;
                }
                .chameleon-themed div, .chameleon-themed header, .chameleon-themed footer, .chameleon-themed section, .chameleon-themed article, .chameleon-themed aside, .chameleon-themed nav, .chameleon-themed main {
                   border-color: var(--chameleon-border) !important;
                }
            `;
            document.body.classList.add('chameleon-themed');

            if (!isInitial) {
                this.controller.ui.showNotification(`Theme applied: ${theme.name}`);
            }
            // Update select box if it exists (for when theme is applied via AI or palette)
            if (document.getElementById('chameleon-theme-select')) {
                document.getElementById('chameleon-theme-select').value = themeKey;
            }
        }

        // Injects custom CSS provided by the user
        applyCustomCSS(css, idSuffix = 'custom') {
            const styleId = `${CONFIG.ID_PREFIX}${idSuffix}-styles`;
            let styleEl = document.getElementById(styleId);
            if (!styleEl) {
                styleEl = document.createElement('style');
                styleEl.id = styleId;
                document.head.appendChild(styleEl);
            }
            styleEl.textContent = css;
            if (idSuffix === 'custom') {
                this.controller.ui.showNotification('Custom CSS applied.');
            }
        }

        /**
         * Simulates generative UI creation based on a prompt.
         * In a real scenario, this would call a multimodal LLM API.
         * @param {string} prompt The user's description of the desired component.
         */
        async generateUI(prompt) {
            if (!prompt.trim()) {
                this.controller.ui.showNotification('Please provide a description for the UI component.', 2000, { type: 'warning' });
                return;
            }
            this.controller.ui.updateStatus('Generating UI component...', 'info');

            // Simulate LLM generation
            await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));

            let generatedHtml = '';
            let generatedCss = '';
            let generatedJs = '';
            let componentName = 'Generated Component';

            if (prompt.toLowerCase().includes('login form')) {
                componentName = 'Login Form';
                generatedHtml = `
                    <div class="${CONFIG.ID_PREFIX}generated-component chameleon-card" style="max-width: 400px; margin: 20px auto; padding: 20px;">
                        <h4 style="text-align: center; margin-bottom: 20px;">Login</h4>
                        <form class="${CONFIG.ID_PREFIX}generated-form">
                            <div class="chameleon-form-group">
                                <label for="gen-email">Email</label>
                                <input type="email" id="gen-email" class="chameleon-input" placeholder="your@email.com">
                            </div>
                            <div class="chameleon-form-group">
                                <label for="gen-password">Password</label>
                                <input type="password" id="gen-password" class="chameleon-input" placeholder="********">
                            </div>
                            <button type="submit" class="chameleon-button" style="width: 100%; margin-top: 10px;">Sign In</button>
                            <p style="text-align: center; margin-top: 15px; font-size: 12px;"><a href="#" style="color: var(--chameleon-primary);">Forgot Password?</a></p>
                        </form>
                    </div>
                `;
                generatedJs = `
                    document.querySelector('.${CONFIG.ID_PREFIX}generated-form').addEventListener('submit', function(e) {
                        e.preventDefault();
                        alert('Login form submitted (simulated)!');
                        console.log('Generated form submitted:', { email: document.getElementById('gen-email').value });
                    });
                `;
            } else if (prompt.toLowerCase().includes('product card')) {
                componentName = 'Product Card';
                generatedHtml = `
                    <div class="${CONFIG.ID_PREFIX}generated-component chameleon-card" style="width: 280px; margin: 20px; display: inline-block; vertical-align: top; text-align: center;">
                        <img src="https://via.placeholder.com/200x150/58a6ff/ffffff?text=Product" alt="Product Image" style="max-width: 100%; border-radius: 4px; margin-bottom: 15px;">
                        <h4 style="font-size: 18px; margin-bottom: 10px;">Awesome Gadget Pro</h4>
                        <p style="font-size: 22px; font-weight: bold; color: var(--chameleon-primary); margin-bottom: 15px;">$99.99</p>
                        <button class="chameleon-button" style="width: 90%;">Add to Cart</button>
                    </div>
                `;
                generatedJs = `
                    document.querySelector('.${CONFIG.ID_PREFIX}generated-component button').addEventListener('click', function() {
                        alert('Added Awesome Gadget Pro to cart!');
                        console.log('Product added to cart.');
                    });
                `;
            } else {
                componentName = 'Generic Component';
                generatedHtml = `
                    <div class="${CONFIG.ID_PREFIX}generated-component chameleon-card" style="margin: 20px auto; padding: 20px; text-align: center;">
                        <h4>AI Generated Content</h4>
                        <p>This is a dynamically generated component based on your prompt: "${prompt}".</p>
                        <button class="chameleon-button secondary">Action</button>
                    </div>
                `;
            }

            const wrapper = document.createElement('div');
            wrapper.className = `${CONFIG.ID_PREFIX}generated-wrapper`;
            wrapper.innerHTML = generatedHtml;

            document.body.appendChild(wrapper);

            // Inject CSS for the generated component (if any)
            if (generatedCss) {
                this.applyCustomCSS(generatedCss, `generated-ui-${Date.now()}`);
            }

            // Inject JS for the generated component (if any)
            if (generatedJs) {
                const scriptEl = document.createElement('script');
                scriptEl.textContent = generatedJs;
                scriptEl.id = `${CONFIG.ID_PREFIX}generated-script-${Date.now()}`;
                document.body.appendChild(scriptEl);
                // Mark for potential cleanup
                scriptEl.dataset.chameleonGenerated = 'true';
            }

            // Add a removable overlay to the generated component
            const generatedEl = wrapper.querySelector(`.${CONFIG.ID_PREFIX}generated-component`);
            if (generatedEl) {
                DOMUtils.createRemovableOverlay(generatedEl, () => {
                    wrapper.remove(); // Remove the wrapper which contains the component
                    // Also try to remove associated script if it was injected
                    const scriptId = generatedEl.querySelector('form, button')?.id ? `${CONFIG.ID_PREFIX}generated-script-${generatedEl.querySelector('form, button').id.split('-').pop()}` : null;
                    if (scriptId) {
                        const scriptToRemove = document.getElementById(scriptId);
                        if (scriptToRemove) scriptToRemove.remove();
                    }
                    this.controller.ui.showNotification(`${componentName} removed.`, 2000, { type: 'info' });
                });
                this.controller.ui.addRemovableOverlay(generatedEl.querySelector(`.${CONFIG.ID_PREFIX}removable-overlay`), generatedEl);
            }


            this.controller.ui.updateStatus(`Generated and injected ${componentName}.`, 'success', 3000);
            this.controller.ui.showNotification(`Generated and injected a ${componentName}. Hover to remove.`, 5000, { type: 'success' });
            this.controller.agent.trackUserActivity('ui_generated', { prompt: prompt, component: componentName });
        }

        // Resets all applied styles and removes custom CSS
        resetStyles() {
            document.body.classList.remove('chameleon-themed');
            const rootStyle = document.getElementById(`${CONFIG.ID_PREFIX}root-styles`);
            if (rootStyle) rootStyle.textContent = ''; // Clear custom root variables
            const pageStyle = document.getElementById(`${CONFIG.ID_PREFIX}page-styles`);
            if (pageStyle) pageStyle.textContent = ''; // Clear page-wide overrides
            const customStyle = document.getElementById(`${CONFIG.ID_PREFIX}custom-styles`);
            if (customStyle) customStyle.textContent = ''; // Clear user custom CSS
            const animationStyle = document.getElementById(`${CONFIG.ID_PREFIX}animations-styles`);
            if (animationStyle) animationStyle.textContent = ''; // Clear animations
            // Remove all animation classes
            document.querySelectorAll('[class*="chameleon-anim-"]').forEach(el => {
                el.className = el.className.split(' ').filter(c => !c.startsWith('chameleon-anim-')).join(' ');
            });
            // Remove all generated components and their scripts
            document.querySelectorAll(`.${CONFIG.ID_PREFIX}generated-wrapper`).forEach(el => el.remove());
            document.querySelectorAll(`script[id^="${CONFIG.ID_PREFIX}generated-script-"]`).forEach(el => el.remove());
            this.controller.ui.hideAllRemovableOverlays();

            this.controller.ui.showNotification('All page styles and generated UI reset.');
        }

        // Converts hex color to RGBA
        hexToRgba(hex, alpha) {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }

        // Determines contrasting text color for a given background hex color
        getContrastYIQ(hexcolor) {
            hexcolor = hexcolor.replace("#", "");
            const r = parseInt(hexcolor.substr(0, 2), 16);
            const g = parseInt(hexcolor.substr(2, 2), 16);
            const b = parseInt(hexcolor.substr(4, 2), 16);
            const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
            return (yiq >= 128) ? '#0d1117' : '#e6edf3'; // Dark text for light backgrounds, light text for dark
        }
    }

    // Analyzes page content and specific elements for performance, security, and accessibility
    class PageAnalyzer {
        constructor(c) {
            this.controller = c;
            this.performanceMonitor = new PerformanceMonitor(c);
        }
        // Renders the analyzer UI in its tab
        render() {
            const container = document.getElementById(`${CONFIG.ID_PREFIX}tab-analyze`);
            if (!container) return;
            container.innerHTML = `
                <h3>Page & Element Analyzer</h3>
                <p>Run a full-page audit or inspect individual elements.</p>
                <button id="chameleon-run-scan" class="chameleon-button">${ICONS.analyze} Run Full Page Scan</button>
                <div id="chameleon-analysis-results" class="chameleon-analysis-results">
                    <p class="chameleon-placeholder">Scan results will appear here. Or, use the ${ICONS.inspect} inspector to analyze a specific element.</p>
                </div>
            `;
            container.querySelector('#chameleon-run-scan').addEventListener('click', () => this.runFullPageScan());
        }

        // Initiates a full page scan and displays results
        async runFullPageScan() {
            this.controller.ui.updateStatus('Scanning page...', 'info');
            const resultsContainer = document.getElementById('chameleon-analysis-results');
            resultsContainer.innerHTML = `<div class="chameleon-spinner-wrapper">${ICONS.spinner} Analyzing page...</div>`;

            // Run scans in parallel for efficiency
            const [perfData, securityReport, pageMetrics] = await Promise.all([
                this.performanceMonitor.getReport(),
                this.controller.vulnerabilityScanner.getReport(), // Use the main scanner
                this.getPageMetrics()
            ]);

            this.controller.ui.updateStatus('Scan complete.', 'success', 3000);

            resultsContainer.innerHTML = `
                <div class="chameleon-card">
                    <h4>${ICONS.performance} Performance Metrics</h4>
                    <div class="chameleon-result-item"><span>Page Load Time</span> <span class="chameleon-badge">${perfData.pageLoadTime.toFixed(0)} ms</span></div>
                    <div class="chameleon-result-item"><span>DOM Interactive</span> <span class="chameleon-badge">${perfData.domInteractive.toFixed(0)} ms</span></div>
                    <div class="chameleon-result-item"><span>Network Requests</span> <span class="chameleon-badge">${perfData.networkRequests}</span></div>
                </div>
                <div class="chameleon-card">
                    <h4>${ICONS.security} Security Report (Score: <span class="chameleon-badge ${securityReport.score > 80 ? 'success' : securityReport.score > 50 ? 'warning' : 'danger'}">${securityReport.score}/100</span>)</h4>
                    ${securityReport.threats.length > 0 ? securityReport.threats.map(t => `<div class="chameleon-result-item"><span>${t.type.replace(/_/g, ' ')}</span> <span class="chameleon-badge danger">${t.severity}</span></div>`).join('') : '<p class="chameleon-info-text">No major threats detected.</p>'}
                </div>
                 <div class="chameleon-card">
                    <h4>Accessibility & SEO</h4>
                    <div class="chameleon-result-item"><span>Images (without alt)</span> <span class="chameleon-badge ${pageMetrics.imagesWithoutAlt > 0 ? 'warning' : 'success'}">${pageMetrics.images} (${pageMetrics.imagesWithoutAlt})</span></div>
                    <div class="chameleon-result-item"><span>Links (empty href)</span> <span class="chameleon-badge ${pageMetrics.emptyLinks > 0 ? 'warning' : 'success'}">${pageMetrics.links} (${pageMetrics.emptyLinks})</span></div>
                    <div class="chameleon-result-item"><span>Missing H1 Tag</span> <span class="chameleon-badge ${pageMetrics.missingH1 ? 'danger' : 'success'}">${pageMetrics.missingH1 ? 'Yes' : 'No'}</span></div>
                    <div class="chameleon-result-item"><span>Total Elements</span> <span class="chameleon-badge">${pageMetrics.domElements}</span></div>
                </div>
            `;
            // Report scan results to the agent for proactive suggestions
            this.controller.agent.processInsight('page_scan_complete', {
                performance: perfData,
                security: securityReport,
                metrics: pageMetrics
            });
            this.controller.agent.trackUserActivity('full_page_scan_executed');
        }

        // Gathers basic page metrics for accessibility and SEO
        getPageMetrics() {
            const allImages = document.querySelectorAll('img').length;
            const imagesWithoutAlt = document.querySelectorAll('img:not([alt]), img[alt=""]').length;
            const allLinks = document.querySelectorAll('a').length;
            const emptyLinks = document.querySelectorAll('a:not([href]), a[href=""], a[href="#"]').length; // Also check for empty href or just '#'
            return {
                domElements: document.querySelectorAll('*').length,
                images: allImages,
                imagesWithoutAlt: imagesWithoutAlt,
                links: allLinks,
                emptyLinks: emptyLinks,
                missingH1: document.querySelectorAll('h1').length === 0,
            };
        }

        // Analyzes a specific DOM element and displays its properties
        analyzeElement(element) {
            const container = document.getElementById(`${CONFIG.ID_PREFIX}tab-analyze`);
            if (!element || !container) return;

            const resultsContainer = container.querySelector('#chameleon-analysis-results');
            const selector = DOMUtils.getSelector(element);
            const styles = window.getComputedStyle(element);
            const analysisHTML = `
                <div class="chameleon-card">
                    <h4>Element: &lt;${element.tagName.toLowerCase()}&gt;</h4>
                    <div class="chameleon-form-group">
                        <label>CSS Selector</label>
                        <input class="chameleon-input" type="text" value="${selector}" readonly>
                    </div>
                    <button class="chameleon-button secondary" data-action="copy-selector" data-selector="${selector}">${ICONS.copy} Copy Selector</button>
                    <div class="chameleon-form-group" style="margin-top: 16px;">
                        <label>Element Text</label>
                        <textarea class="chameleon-textarea" readonly>${element.textContent.trim().substring(0, 500)}</textarea>
                    </div>
                </div>
                <div class="chameleon-card">
                     <h4>Computed Styles (Filtered)</h4>
                     <pre class="chameleon-code-block">${this.formatStyles(styles)}</pre>
                </div>
            `;
            resultsContainer.innerHTML = analysisHTML;
            container.querySelector('[data-action="copy-selector"]').addEventListener('click', (e) => {
                GM_setClipboard(e.target.dataset.selector);
                this.controller.ui.showNotification('Selector copied to clipboard!');
                this.controller.agent.trackUserActivity('selector_copied');
            });
        }

        // Formats computed styles for display
        formatStyles(styles) {
            const importantStyles = [
                'display', 'position', 'width', 'height', 'top', 'left', 'right', 'bottom',
                'color', 'background-color', 'font-size', 'font-family', 'font-weight', 'line-height',
                'padding', 'margin', 'border', 'border-radius', 'box-shadow',
                'flex', 'flex-direction', 'justify-content', 'align-items',
                'grid', 'grid-template-columns', 'grid-gap',
                'transform', 'opacity', 'z-index', 'cursor', 'overflow'
            ];
            let output = '';
            importantStyles.forEach(prop => {
                if (styles[prop]) {
                    output += `${prop}: ${styles[prop]};\n`;
                }
            });
            return output || 'No significant computed styles found.';
        }
    }

    // Monitors page performance metrics
    class PerformanceMonitor {
        constructor(c) { this.controller = c; }
        async getReport() {
            // Simulate network delay for a more realistic feel
            await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));

            const perf = ROOT_WINDOW.performance.timing;
            return {
                pageLoadTime: perf.loadEventEnd - perf.navigationStart,
                domInteractive: perf.domInteractive - perf.navigationStart,
                networkRequests: ROOT_WINDOW.performance.getEntriesByType ? ROOT_WINDOW.performance.getEntriesByType('resource').length : 'N/A',
            };
        }
    }

    // Live API Interceptor & Mocking Engine
    class APIMonitor {
        constructor(c) {
            this.controller = c;
            this.interceptedRequests = [];
            this.mockRules = [];
            this.originalFetch = ROOT_WINDOW.fetch;
            this.originalXHR = ROOT_WINDOW.XMLHttpRequest;
            this.isMonitoring = false;
        }

        normalizePayload(body) {
            if (body == null) {
                return null;
            }
            if (typeof body === 'string') {
                return safeParseJSON(body);
            }
            try {
                if (ROOT_WINDOW.URLSearchParams && body instanceof ROOT_WINDOW.URLSearchParams) {
                    return Object.fromEntries(body.entries());
                }
            } catch (error) {
                return String(body);
            }
            try {
                if (ROOT_WINDOW.FormData && body instanceof ROOT_WINDOW.FormData) {
                    const result = {};
                    for (const [key, value] of body.entries()) {
                        if (typeof value === 'string') {
                            result[key] = value;
                        } else if (value && typeof value.name === 'string') {
                            result[key] = `[File:${value.name}]`;
                        } else {
                            result[key] = String(value);
                        }
                    }
                    return result;
                }
            } catch (error) {
                return String(body);
            }
            if (ROOT_WINDOW.Blob && body instanceof ROOT_WINDOW.Blob) {
                return `[Blob ${body.type || 'unknown'} • ${body.size || 0} bytes]`;
            }
            const hasArrayBuffer = typeof ArrayBuffer !== 'undefined';
            if ((hasArrayBuffer && body instanceof ArrayBuffer) || (hasArrayBuffer && ArrayBuffer.isView && ArrayBuffer.isView(body))) {
                const size = typeof body.byteLength === 'number' ? body.byteLength : (body.length || 0);
                return `[Binary Data • ${size} bytes]`;
            }
            if (typeof body === 'object') {
                try {
                    return JSON.parse(JSON.stringify(body));
                } catch (error) {
                    return String(body);
                }
            }
            if (typeof body === 'number' || typeof body === 'boolean') {
                return body;
            }
            if (typeof body === 'function') {
                return '[Function body]';
            }
            return String(body);
        }

        async readClonedResponseBody(clonedResponse) {
            if (!clonedResponse) {
                return null;
            }
            try {
                return await clonedResponse.json();
            } catch (error) {
                try {
                    return await clonedResponse.text();
                } catch (nestedError) {
                    return null;
                }
            }
        }

        parseMockResponse(responseText) {
            const parsed = safeParseJSON(responseText);
            return {
                parsed,
                text: serializeForResponse(parsed),
            };
        }

        normalizeHeaders(headers) {
            if (!headers) {
                return undefined;
            }
            try {
                if (ROOT_WINDOW.Headers && headers instanceof ROOT_WINDOW.Headers) {
                    const result = {};
                    headers.forEach((value, key) => {
                        result[key] = value;
                    });
                    return result;
                }
            } catch (error) {
                return undefined;
            }
            if (Array.isArray(headers)) {
                return headers.reduce((acc, [key, value]) => {
                    acc[key] = value;
                    return acc;
                }, {});
            }
            if (headers && typeof headers === 'object') {
                return { ...headers };
            }
            return undefined;
        }

        init() {
            this.overrideNetworkAPIs();
            this.isMonitoring = true;
            this.controller.log('API Monitor initialized, intercepting network calls.');
        }

        render() {
            const container = document.getElementById(`${CONFIG.ID_PREFIX}tab-network`);
            if (!container) return;
            container.innerHTML = `
                <h3>Live API Monitor & Mocking</h3>
                <p>Intercept, inspect, and mock network requests and responses.</p>
                <div class="chameleon-card">
                    <h4>Mocking Rules</h4>
                    <div class="chameleon-form-group">
                        <label for="mock-url-regex">URL Regex (e.g., /api/user)</label>
                        <input type="text" id="mock-url-regex" class="chameleon-input" placeholder="/api/user">
                    </div>
                    <div class="chameleon-form-group">
                        <label for="mock-method">Method</label>
                        <select id="mock-method" class="chameleon-select">
                            <option value="ANY">ANY</option>
                            <option value="GET">GET</option>
                            <option value="POST">POST</option>
                            <option value="PUT">PUT</option>
                            <option value="DELETE">DELETE</option>
                        </select>
                    </div>
                    <div class="chameleon-form-group">
                        <label for="mock-status">Status Code</label>
                        <input type="number" id="mock-status" class="chameleon-input" value="200">
                    </div>
                    <div class="chameleon-form-group">
                        <label for="mock-response">Mock JSON Response</label>
                        <textarea id="mock-response" class="chameleon-textarea" placeholder='{"message": "Mocked response"}'></textarea>
                    </div>
                    <button id="add-mock-rule" class="chameleon-button">${ICONS.execute} Add Mock Rule</button>
                    <div id="mock-rules-list" class="chameleon-code-block" style="margin-top: 10px;"></div>
                </div>
                <div class="chameleon-card">
                    <h4>Intercepted Requests</h4>
                    <div id="intercepted-requests-list" class="chameleon-code-block" style="max-height: 400px; overflow-y: auto;">
                        <p class="chameleon-placeholder">No requests intercepted yet.</p>
                    </div>
                    <button id="clear-requests" class="chameleon-button secondary" style="margin-top: 10px;">Clear Log</button>
                </div>
            `;
            this.bindEvents();
            this.updateMockRulesList();
            this.updateInterceptedRequestsList();
        }

        bindEvents() {
            const container = document.getElementById(`${CONFIG.ID_PREFIX}tab-network`);
            container.querySelector('#add-mock-rule').addEventListener('click', () => this.addMockRuleFromUI());
            container.querySelector('#clear-requests').addEventListener('click', () => {
                this.interceptedRequests = [];
                this.updateInterceptedRequestsList();
                this.controller.ui.showNotification('API log cleared.');
                this.controller.agent.trackUserActivity('api_log_cleared');
            });
            container.querySelector('#mock-rules-list').addEventListener('click', (e) => {
                if (e.target.classList.contains('remove-mock-rule')) {
                    const index = parseInt(e.target.dataset.index);
                    this.removeMockRule(index);
                }
            });
            container.querySelector('#intercepted-requests-list').addEventListener('click', (e) => {
                if (e.target.classList.contains('replay-request')) {
                    const index = parseInt(e.target.dataset.index);
                    this.replayRequest(index);
                }
            });
        }

        addMockRuleFromUI() {
            const urlRegex = document.getElementById('mock-url-regex').value;
            const method = document.getElementById('mock-method').value;
            const status = parseInt(document.getElementById('mock-status').value);
            const responseText = document.getElementById('mock-response').value;

            if (!urlRegex) {
                this.controller.ui.showNotification('URL Regex is required for mock rule.', 2000, { type: 'warning' });
                return;
            }
            try {
                JSON.parse(responseText); // Validate JSON
            } catch (e) {
                this.controller.ui.showNotification('Invalid JSON response.', 2000, { type: 'warning' });
                return;
            }

            this.addMockRule({
                urlRegex: urlRegex,
                method: method,
                status: status,
                response: responseText,
            });

            this.controller.ui.showNotification('Mock rule added.', 2000, { type: 'success' });
            this.controller.agent.trackUserActivity('mock_rule_added', { url: urlRegex, method: method });
            // Clear inputs
            document.getElementById('mock-url-regex').value = '';
            document.getElementById('mock-response').value = '';
        }

        addMockRule(rule) {
            this.mockRules.push(rule);
            this.updateMockRulesList();
        }

        removeMockRule(index) {
            this.mockRules.splice(index, 1);
            this.updateMockRulesList();
            this.controller.ui.showNotification('Mock rule removed.', 2000, { type: 'info' });
        }

        updateMockRulesList() {
            const listEl = document.getElementById('mock-rules-list');
            if (!listEl) return;
            if (this.mockRules.length === 0) {
                listEl.innerHTML = '<p class="chameleon-placeholder">No mock rules active.</p>';
                return;
            }
            listEl.innerHTML = this.mockRules.map((rule, index) => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px dashed var(--chameleon-border);">
                    <span>[${rule.method}] ${rule.urlRegex} -> ${rule.status}</span>
                    <button class="chameleon-button secondary remove-mock-rule" data-index="${index}" style="padding: 2px 6px; font-size: 11px;">Remove</button>
                </div>
            `).join('');
        }

        updateInterceptedRequestsList() {
            const listEl = document.getElementById('intercepted-requests-list');
            if (!listEl) return;
            if (this.interceptedRequests.length === 0) {
                listEl.innerHTML = '<p class="chameleon-placeholder">No requests intercepted yet.</p>';
                return;
            }
            listEl.innerHTML = this.interceptedRequests.map((req, index) => `
                <div style="margin-bottom: 10px; padding: 8px; border: 1px solid var(--chameleon-border); border-radius: 6px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; font-weight: bold;">
                        <span>${req.method} ${req.url}</span>
                        <span class="chameleon-badge ${req.status >= 200 && req.status < 300 ? 'success' : req.status >= 400 ? 'danger' : 'warning'}">${req.status}</span>
                    </div>
                    <div style="font-size: 12px; color: var(--text-secondary); margin-top: 5px;">
                        Duration: ${req.duration ? req.duration.toFixed(0) + 'ms' : 'N/A'}
                    </div>
                    <div style="margin-top: 10px;">
                        <details>
                            <summary style="cursor: pointer; color: var(--chameleon-primary);">Request Body</summary>
                            <pre class="chameleon-code-block">${req.requestBody ? JSON.stringify(req.requestBody, null, 2) : 'N/A'}</pre>
                        </details>
                        <details style="margin-top: 5px;">
                            <summary style="cursor: pointer; color: var(--chameleon-primary);">Response Body</summary>
                            <pre class="chameleon-code-block">${req.responseBody ? JSON.stringify(req.responseBody, null, 2) : 'N/A'}</pre>
                        </details>
                    </div>
                    <button class="chameleon-button secondary replay-request" data-index="${index}" style="margin-top: 10px; padding: 5px 10px; font-size: 12px;">Replay</button>
                </div>
            `).join('');
        }

        async replayRequest(index) {
            const req = this.interceptedRequests[index];
            if (!req) return;

            this.controller.ui.showNotification(`Replaying ${req.method} ${req.url}...`, 0, { type: 'info' });
            this.controller.agent.trackUserActivity('api_request_replayed', { url: req.url, method: req.method });

            try {
                const options = {
                    method: req.method,
                    headers: req.requestHeaders,
                    data: req.requestBody == null ? undefined : (typeof req.requestBody === 'string' ? req.requestBody : JSON.stringify(req.requestBody)),
                    responseType: 'json', // Assume JSON for simplicity
                    timeout: 10000,
                    onload: (response) => {
                        this.controller.ui.showNotification(`Replay successful: ${response.status}`, 3000, { type: 'success' });
                        this.controller.log('Replayed request response:', response);
                        // Optionally add replayed response to log
                        this.addInterceptedRequest({
                            url: req.url,
                            method: req.method,
                            status: response.status,
                            requestBody: req.requestBody,
                            responseBody: response.response,
                            duration: response.finalUrl ? (Date.now() - req.timestamp) : 0, // Simple duration calc
                            isReplay: true
                        });
                    },
                    onerror: (error) => {
                        this.controller.ui.showNotification(`Replay failed: ${error.status}`, 3000, { type: 'danger' });
                        this.controller.error('Replayed request error:', error);
                    }
                };
                GM_xmlhttpRequest(options);
            } catch (e) {
                this.controller.error('Error during replay:', e);
                this.controller.ui.showNotification('Error replaying request.', 3000, { type: 'danger' });
            }
        }

        addInterceptedRequest(requestData) {
            this.interceptedRequests.unshift(requestData); // Add to beginning
            if (this.interceptedRequests.length > 50) { // Keep log size manageable
                this.interceptedRequests.pop();
            }
            this.updateInterceptedRequestsList();
        }

        // Overrides global fetch and XMLHttpRequest to intercept requests
        overrideNetworkAPIs() {
            const self = this; // Preserve 'this' context

            // Intercept Fetch API
            ROOT_WINDOW.fetch = async function (...args) {
                const url = args[0] instanceof ROOT_WINDOW.Request ? args[0].url : args[0];
                const options = args[0] instanceof ROOT_WINDOW.Request ? args[0] : args[1] || {};
                const method = options.method ? options.method.toUpperCase() : 'GET';
                const startTime = Date.now();
                const requestBody = self.normalizePayload(options.body);
                const requestHeaders = self.normalizeHeaders(options.headers);

                // Check for mock rules
                const matchedRule = self.mockRules.find(rule =>
                    new RegExp(rule.urlRegex).test(url) &&
                    (rule.method === 'ANY' || rule.method === method)
                );

                if (matchedRule) {
                    self.controller.log(`[API Mock] Intercepted ${method} ${url}, returning mocked response.`);
                    const mockResponseData = self.parseMockResponse(matchedRule.response);
                    const mockResponse = new ROOT_WINDOW.Response(mockResponseData.text, {
                        status: matchedRule.status,
                        headers: { 'Content-Type': 'application/json', 'X-Mocked-By': 'Chameleon-AI-Forge' }
                    });
                    self.addInterceptedRequest({
                        url: url,
                        method: method,
                        status: matchedRule.status,
                        requestHeaders: requestHeaders,
                        requestBody: requestBody,
                        responseBody: mockResponseData.parsed,
                        duration: Date.now() - startTime,
                        isMocked: true
                    });
                    return mockResponse;
                }

                // Proceed with original fetch if no mock rule matches
                try {
                    const response = await self.originalFetch.call(ROOT_WINDOW, ...args);
                    const clonedResponse = response.clone(); // Clone to read body without consuming original
                    const responseBody = await self.readClonedResponseBody(clonedResponse);

                    self.addInterceptedRequest({
                        url: url,
                        method: method,
                        status: response.status,
                        requestHeaders: requestHeaders,
                        requestBody: requestBody,
                        responseBody: responseBody,
                        duration: Date.now() - startTime
                    });
                    return response;
                } catch (error) {
                    self.controller.error(`[API Monitor] Fetch error for ${url}:`, error);
                    self.addInterceptedRequest({
                        url: url,
                        method: method,
                        status: 0, // Indicate network error
                        requestHeaders: requestHeaders,
                        requestBody: requestBody,
                        responseBody: { error: error.message },
                        duration: Date.now() - startTime
                    });
                    throw error;
                }
            };

            // Intercept XMLHttpRequest
            ROOT_WINDOW.XMLHttpRequest = class extends self.originalXHR {
                constructor() {
                    super();
                    this._requestUrl = '';
                    this._requestMethod = '';
                    this._requestBody = null;
                    this._startTime = 0;
                    this._headers = {}; // To store request headers

                    this.addEventListener('readystatechange', () => {
                        if (this.readyState === 4) { // Request finished and response is ready
                            const duration = Date.now() - this._startTime;
                            let responseSource = null;
                            try {
                                responseSource = this.responseText;
                            } catch (textError) {
                                responseSource = this.response ?? null;
                            }
                            const responseBody = self.normalizePayload(responseSource);
                            const requestHeaders = this._headers && Object.keys(this._headers).length ? { ...this._headers } : undefined;

                            self.addInterceptedRequest({
                                url: this._requestUrl,
                                method: this._requestMethod,
                                status: this.status,
                                requestHeaders: requestHeaders,
                                requestBody: this._requestBody,
                                responseBody: responseBody,
                                duration: duration
                            });
                        }
                    });
                }

                open(method, url, ...args) {
                    this._requestMethod = method.toUpperCase();
                    this._requestUrl = url;
                    this._startTime = Date.now();
                    this._headers = {};
                    this._requestBody = null;
                    super.open(method, url, ...args);
                }

                setRequestHeader(header, value) {
                    this._headers[header] = value;
                    super.setRequestHeader(header, value);
                }

                send(body) {
                    if (typeof body !== 'undefined') {
                        this._requestBody = self.normalizePayload(body);
                    } else {
                        this._requestBody = null;
                    }

                    // Check for mock rules for XHR
                    const matchedRule = self.mockRules.find(rule =>
                        new RegExp(rule.urlRegex).test(this._requestUrl) &&
                        (rule.method === 'ANY' || rule.method === this._requestMethod)
                    );

                    if (matchedRule) {
                        self.controller.log(`[API Mock] Intercepted XHR ${this._requestMethod} ${this._requestUrl}, returning mocked response.`);
                        const mockResponseData = self.parseMockResponse(matchedRule.response);
                        // Simulate XHR response
                        Object.defineProperty(this, 'status', { value: matchedRule.status, writable: true });
                        Object.defineProperty(this, 'responseText', { value: mockResponseData.text, writable: true });
                        Object.defineProperty(this, 'response', { value: mockResponseData.parsed, writable: true }); // For .response property
                        Object.defineProperty(this, 'readyState', { value: 4, writable: true });

                        // Fire events to simulate completion
                        this.dispatchEvent(new Event('loadstart'));
                        this.dispatchEvent(new Event('progress'));
                        this.dispatchEvent(new Event('load'));
                        this.dispatchEvent(new Event('loadend'));

                        self.addInterceptedRequest({
                            url: this._requestUrl,
                            method: this._requestMethod,
                            status: matchedRule.status,
                            requestHeaders: this._headers && Object.keys(this._headers).length ? { ...this._headers } : undefined,
                            requestBody: this._requestBody,
                            responseBody: mockResponseData.parsed,
                            duration: Date.now() - this._startTime,
                            isMocked: true
                        });
                        return; // Prevent actual send
                    }

                    super.send(body);
                }
            };
        }
    }

    // Active Vulnerability & Exploit Scanner
    class VulnerabilityScanner {
        constructor(c) {
            this.controller = c;
            this.findings = [];
        }

        render() {
            const container = document.getElementById(`${CONFIG.ID_PREFIX}tab-security`);
            if (!container) return;
            container.innerHTML = `
                <h3>Active Vulnerability Scanner</h3>
                <p>Actively probe for common web vulnerabilities in an ethical, non-destructive way.</p>
                <div class="chameleon-card">
                    <h4>Scan Options</h4>
                    <button id="scan-xss" class="chameleon-button">${ICONS.security} Scan for Reflected XSS</button>
                    <button id="scan-sql" class="chameleon-button">${ICONS.security} Scan for Basic SQLi</button>
                    <button id="scan-dirs" class="chameleon-button">${ICONS.security} Scan for Exposed Directories</button>
                    <button id="clear-security-findings" class="chameleon-button secondary" style="margin-top: 10px;">Clear Findings</button>
                </div>
                <div class="chameleon-card">
                    <h4>Scan Findings</h4>
                    <div id="security-findings-list" class="chameleon-code-block" style="max-height: 400px; overflow-y: auto;">
                        <p class="chameleon-placeholder">No findings yet. Run a scan!</p>
                    </div>
                </div>
            `;
            this.bindEvents();
            this.updateFindingsList();
        }

        bindEvents() {
            const container = document.getElementById(`${CONFIG.ID_PREFIX}tab-security`);
            container.querySelector('#scan-xss').addEventListener('click', () => this.scanXSS());
            container.querySelector('#scan-sql').addEventListener('click', () => this.scanSQLInjection());
            container.querySelector('#scan-dirs').addEventListener('click', () => this.scanDirectoryExposure());
            container.querySelector('#clear-security-findings').addEventListener('click', () => {
                this.findings = [];
                this.updateFindingsList();
                this.controller.ui.showNotification('Security findings cleared.');
                this.controller.agent.trackUserActivity('security_findings_cleared');
            });
        }

        addFinding(type, severity, description, element = null) {
            this.findings.push({ type, severity, description, element: element ? DOMUtils.getSelector(element) : null, timestamp: Date.now() });
            this.updateFindingsList();
            this.controller.ui.showNotification(`Security finding: ${type} (${severity})`, 5000, { type: severity === 'critical' || severity === 'high' ? 'danger' : 'warning' });
            this.controller.agent.processInsight('security_finding', { type, severity, description, element: element });
        }

        updateFindingsList() {
            const listEl = document.getElementById('security-findings-list');
            if (!listEl) return;
            if (this.findings.length === 0) {
                listEl.innerHTML = '<p class="chameleon-placeholder">No findings yet. Run a scan!</p>';
                return;
            }
            listEl.innerHTML = this.findings.map(f => `
                <div style="margin-bottom: 10px; padding: 8px; border: 1px solid var(--chameleon-border); border-radius: 6px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; font-weight: bold;">
                        <span>${f.type.replace(/_/g, ' ')}</span>
                        <span class="chameleon-badge ${f.severity === 'critical' || f.severity === 'high' ? 'danger' : f.severity === 'medium' ? 'warning' : 'info'}">${f.severity}</span>
                    </div>
                    <div style="font-size: 12px; margin-top: 5px;">${f.description}</div>
                    ${f.element ? `<div style="font-size: 11px; color: var(--text-secondary); word-break: break-all;">Element: <code>${f.element}</code></div>` : ''}
                </div>
            `).join('');
        }

        // Generic function to get a security report (used by PageAnalyzer)
        async getReport() {
            // This is a passive report, active scans are triggered by buttons
            let threats = [];
            let score = 100;

            // Check for mixed content (HTTP resources on HTTPS page)
            if (window.location.protocol === 'https:') {
                document.querySelectorAll('img[src^="http:"], script[src^="http:"], link[href^="http:"]').forEach(el => {
                    threats.push({ type: 'insecure_content', severity: 'medium', element: el });
                    score -= 5;
                });
            }

            // Check for inline scripts with eval/document.write (basic check for potential XSS)
            document.querySelectorAll('script:not([src])').forEach(script => {
                const scriptContent = script.textContent.toLowerCase();
                if (scriptContent.includes('eval(') || scriptContent.includes('document.write(')) {
                    threats.push({ type: 'suspicious_inline_script', severity: 'high', element: script });
                    score -= 10;
                }
            });

            // Check for external scripts from suspicious domains (simulated)
            const suspiciousDomains = ['bad-tracker.com', 'malicious-cdn.net'];
            document.querySelectorAll('script[src], link[href]').forEach(el => {
                const url = el.src || el.href;
                if (suspiciousDomains.some(domain => url.includes(domain))) {
                    threats.push({ type: 'external_script_from_suspicious_domain', severity: 'critical', element: el });
                    score -= 20;
                }
            });

            // Check for forms without CSRF tokens (very basic, just checks for hidden input names)
            document.querySelectorAll('form').forEach(form => {
                const hasCsrfToken = form.querySelector('input[type="hidden"][name*="csrf"], input[type="hidden"][name*="token"]');
                if (!hasCsrfToken) {
                    threats.push({ type: 'potential_csrf_vulnerability', severity: 'low', element: form });
                    score -= 2;
                }
            });

            return { threats, score: Math.max(0, score) };
        }

        /**
         * Scans for reflected XSS by injecting benign payloads into input fields.
         * @param {Element} [targetElement] - Optional. If provided, only scan this element.
         */
        async scanXSS(targetElement = null) {
            this.controller.ui.updateStatus('Scanning for XSS...', 'info');
            this.controller.agent.trackUserActivity('scan_xss', { target: targetElement ? DOMUtils.getSelector(targetElement) : 'page' });
            const inputs = targetElement ? [targetElement] : Array.from(document.querySelectorAll('input[type="text"], input[type="search"], textarea'));
            const payload = `<img src=x onerror="console.log('Chameleon-XSS-Test-Success');">`;
            let found = false;

            const originalConsoleLog = ROOT_WINDOW.console.log;
            let xssDetected = false;

            // Temporarily override console.log to detect our payload
            ROOT_WINDOW.console.log = function (...args) {
                if (args.includes('Chameleon-XSS-Test-Success')) {
                    xssDetected = true;
                }
                originalConsoleLog.apply(this, args);
            };

            for (const input of inputs) {
                const originalValue = input.value;
                input.value = payload;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));

                // Simulate interaction that might trigger XSS (e.g., blur, form submit)
                input.blur();
                // If it's part of a form, try to submit it (non-destructive)
                const form = input.closest('form');
                if (form) {
                    const submitButton = form.querySelector('button[type="submit"], input[type="submit"]');
                    if (submitButton) {
                        submitButton.click(); // This might trigger a page reload, so be careful
                        await new Promise(r => setTimeout(r, 500)); // Give time for script to execute
                    }
                }

                if (xssDetected) {
                    this.addFinding('reflected_xss', 'critical', `Potential reflected XSS detected in input field. Payload: "${payload}"`, input);
                    found = true;
                    xssDetected = false; // Reset for next input
                }
                input.value = originalValue; // Restore original value
            }

            ROOT_WINDOW.console.log = originalConsoleLog; // Restore original console.log

            if (!found) {
                this.controller.ui.showNotification('No reflected XSS vulnerabilities found.', 3000, { type: 'success' });
            }
            this.controller.ui.updateStatus('XSS scan complete.', 'info');
        }

        /**
         * Scans for basic SQL Injection by probing login forms.
         * @param {Element} [targetForm] - Optional. If provided, only scan this form.
         */
        async scanSQLInjection(targetForm = null) {
            this.controller.ui.updateStatus('Scanning for SQL Injection...', 'info');
            this.controller.agent.trackUserActivity('scan_sqli', { target: targetForm ? DOMUtils.getSelector(targetForm) : 'page' });
            const forms = targetForm ? [targetForm] : Array.from(document.querySelectorAll('form'));
            const sqliPayload = `' OR 1=1 --`;
            let found = false;

            for (const form of forms) {
                const passwordInput = form.querySelector('input[type="password"]');
                const usernameInput = form.querySelector('input[type="text"], input[type="email"]');
                const submitButton = form.querySelector('button[type="submit"], input[type="submit"]');

                if (passwordInput && usernameInput && submitButton) {
                    const originalPassword = passwordInput.value;
                    const originalUsername = usernameInput.value;

                    passwordInput.value = sqliPayload;
                    usernameInput.value = 'admin'; // Use a common username

                    this.controller.ui.showNotification(`Probing form for SQLi: ${DOMUtils.getSelector(form)}`, 1000, { type: 'info' });
                    submitButton.click();

                    // Wait for potential page reload or API response
                    await new Promise(r => setTimeout(r, 2000));

                    // Check for common success/error messages (simulated)
                    const pageText = document.body.textContent.toLowerCase();
                    if (pageText.includes('login successful') || pageText.includes('welcome admin') || pageText.includes('dashboard')) {
                        this.addFinding('basic_sqli_success', 'high', `Potential SQL Injection (Login Bypass) detected in form. Payload: "${sqliPayload}"`, form);
                        found = true;
                    } else if (pageText.includes('sql error') || pageText.includes('database error') || pageText.includes('syntax error')) {
                        this.addFinding('basic_sqli_error', 'medium', `Potential SQL Injection (Error-based) detected in form. Payload: "${sqliPayload}"`, form);
                        found = true;
                    }

                    passwordInput.value = originalPassword; // Restore
                    usernameInput.value = originalUsername; // Restore
                }
            }
            if (!found) {
                this.controller.ui.showNotification('No basic SQL Injection vulnerabilities found.', 3000, { type: 'success' });
            }
            this.controller.ui.updateStatus('SQL Injection scan complete.', 'info');
        }

        /**
         * Scans for exposed directories by probing common paths.
         */
        async scanDirectoryExposure() {
            this.controller.ui.updateStatus('Scanning for exposed directories...', 'info');
            this.controller.agent.trackUserActivity('scan_directory_exposure');
            const commonPaths = ['/.git/', '/.env', '/admin/', '/backup/', '/uploads/', '/config/', '/test/', '/debug/'];
            let found = false;

            for (const path of commonPaths) {
                const url = new URL(path, window.location.href).href;
                this.controller.ui.showNotification(`Probing ${url}...`, 1000, { type: 'info' });
                try {
                    const response = await new Promise((resolve, reject) => {
                        GM_xmlhttpRequest({
                            method: 'GET',
                            url: url,
                            onload: (res) => resolve(res),
                            onerror: (err) => reject(err),
                            timeout: 5000
                        });
                    });

                    if (response.status === 200 || response.status === 403) {
                        const responseText = response.responseText.toLowerCase();
                        if (response.status === 200 && (responseText.includes('index of') || responseText.includes('parent directory'))) {
                            this.addFinding('directory_listing', 'critical', `Directory listing enabled for: ${url}`);
                            found = true;
                        } else if (response.status === 200) {
                            this.addFinding('exposed_file_or_directory', 'high', `Potentially exposed directory/file (200 OK) at: ${url}`);
                            found = true;
                        } else if (response.status === 403) {
                            this.addFinding('forbidden_directory_access', 'medium', `Access to directory forbidden (403) at: ${url}`);
                            found = true;
                        }
                    }
                } catch (e) {
                    this.controller.log(`Failed to probe ${url}: ${e.message}`);
                }
            }
            if (!found) {
                this.controller.ui.showNotification('No exposed directories found.', 3000, { type: 'success' });
            }
            this.controller.ui.updateStatus('Directory scan complete.', 'info');
        }

        /**
         * Allows AgentCore to trigger specific scans on specific elements.
         * @param {Element} element The element to scan.
         * @param {string} scanType 'xss' or 'sqli'.
         */
        async scanTarget(element, scanType) {
            if (!element) {
                this.controller.ui.showNotification('No element provided for targeted scan.', 2000, { type: 'warning' });
                return;
            }
            this.controller.ui.showNotification(`Running targeted ${scanType} scan on element...`, 0, { type: 'info' });
            if (scanType === 'xss') {
                await this.scanXSS(element);
            } else if (scanType === 'sqli') {
                if (element.tagName === 'FORM') {
                    await this.scanSQLInjection(element);
                } else {
                    this.controller.ui.showNotification('SQLi scan requires a form element.', 2000, { type: 'warning' });
                }
            } else {
                this.controller.ui.showNotification(`Unknown scan type: ${scanType}`, 2000, { type: 'warning' });
            }
        }
    }

    // Groups advanced tools like Component Isolation and Session Recorder
    class ToolKit {
        constructor(c) {
            this.controller = c;
            this.appIsolation = new AppIsolationEngine(c);
            this.sessionRecorder = new SessionRecorder(c);
        }
        // Renders the toolkit UI in its tab
        render() {
            const container = document.getElementById(`${CONFIG.ID_PREFIX}tab-tools`);
            if (!container) return;
            container.innerHTML = `
                <h3>Toolkit</h3>
                <p>Advanced tools for developers and power users.</p>
                <div class="chameleon-card">
                    <h4>${ICONS.tools} Component Isolation & Remixing</h4>
                    <p>Select elements on the page to analyze, extract, or replicate them as reusable components.</p>
                    <div id="${CONFIG.ID_PREFIX}isolation-controls">
                        <!-- AppIsolationEngine will render its controls here -->
                    </div>
                </div>
                <div class="chameleon-card">
                    <h4>${ICONS.record} Session Recorder</h4>
                    <p>Record your actions on the page and generate automation scripts.</p>
                    <div id="${CONFIG.ID_PREFIX}recorder-controls">
                        <!-- SessionRecorder will render its controls here -->
                    </div>
                </div>
            `;
            this.appIsolation.renderControls(container.querySelector(`#${CONFIG.ID_PREFIX}isolation-controls`));
            this.sessionRecorder.renderControls(container.querySelector(`#${CONFIG.ID_PREFIX}recorder-controls`));
        }
    }

    // The conversational AI driver, interpreting natural language commands
    class GenesisDriver {
        constructor(c) {
            this.controller = c;
            this.conversation = []; // Stores conversation history
            this.context = {
                lastSelectedElements: null, // Stores elements selected by previous commands
            };
        }
        // Renders the chat interface for Genesis AI
        render() {
            const container = document.getElementById(`${CONFIG.ID_PREFIX}tab-genesis`);
            if (!container) return;
            container.innerHTML = `
                <div id="${CONFIG.ID_PREFIX}genesis-conversation" class="chameleon-genesis-conversation">
                    <div class="chameleon-message ai">
                        <span class="chameleon-avatar">${ICONS.logo}</span>
                        <div class="chameleon-bubble">Hello! I am the Genesis AI. How can I augment your web experience today? Try asking me to "make this page cyberpunk" or "find all buttons and make them pulse".</div>
                    </div>
                </div>
                <div class="chameleon-genesis-input-area">
                    <textarea id="${CONFIG.ID_PREFIX}genesis-input" class="chameleon-textarea" placeholder="Send a message... (e.g., 'Summarize this article')"></textarea>
                    <button id="${CONFIG.ID_PREFIX}genesis-send" class="chameleon-button">${ICONS.execute}</button>
                </div>
            `;
            this.bindEvents();
        }

        // Binds events for the chat input and send button
        bindEvents() {
            const sendBtn = document.getElementById(`${CONFIG.ID_PREFIX}genesis-send`);
            const input = document.getElementById(`${CONFIG.ID_PREFIX}genesis-input`);
            if (sendBtn) sendBtn.addEventListener('click', () => this.sendMessage());
            if (input) input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) { // Send on Enter, new line on Shift+Enter
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }

        // Sends a user message and triggers command processing
        sendMessage() {
            const input = document.getElementById(`${CONFIG.ID_PREFIX}genesis-input`);
            const message = input.value.trim();
            if (!message) return;

            this.addMessage(message, 'user');
            input.value = '';
            input.focus();

            this.controller.agent.trackUserActivity('genesis_command', { command: message });
            this.processCommand(message);
        }

        // Adds a message to the conversation history display
        addMessage(text, sender) {
            const conversationEl = document.getElementById(`${CONFIG.ID_PREFIX}genesis-conversation`);
            const messageEl = document.createElement('div');
            messageEl.className = `chameleon-message ${sender}`;
            const avatar = sender === 'ai' ? ICONS.logo : ICONS.user;
            messageEl.innerHTML = `<span class="chameleon-avatar">${avatar}</span><div class="chameleon-bubble">${text}</div>`;
            conversationEl.appendChild(messageEl);
            conversationEl.scrollTop = conversationEl.scrollHeight; // Auto-scroll to bottom

            // Store in conversation history
            this.conversation.push({ role: sender, content: text });
        }

        // Processes a natural language command using the AgentCore
        async processCommand(command) {
            this.addMessage(`<span class="chameleon-spinner-wrapper">${ICONS.spinner} Thinking...</span>`, 'ai');
            const lastMessageBubble = document.querySelector(`#${CONFIG.ID_PREFIX}genesis-conversation .chameleon-message.ai:last-child .chameleon-bubble`);

            try {
                // Simulate AI processing time
                await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1500));

                const operations = this.parseCommand(command);
                if (operations.length === 0) {
                    lastMessageBubble.innerHTML = "I'm not sure how to do that yet. Could you rephrase?";
                    return;
                }

                let executionContext = this.context.lastSelectedElements; // Start with previously selected elements
                let successfulOperations = 0;

                for (const op of operations) {
                    try {
                        // Delegate execution to AgentCore for centralized logic and potential follow-ups
                        const result = await this.controller.agent.executeAgentOperation(op, executionContext);
                        if (result !== undefined) { // If an operation returns elements, update context
                            executionContext = result;
                        }
                        successfulOperations++;
                    } catch (opError) {
                        this.controller.error(`Operation failed: ${op.type}`, opError);
                        lastMessageBubble.innerHTML = `An operation failed: ${opError.message}. I'll try to continue.`;
                        // Don't break, try next operation
                    }
                }

                this.context.lastSelectedElements = executionContext; // Update context for next command
                const finalMessage = successfulOperations > 0
                    ? `Done! I've completed ${successfulOperations} operation(s). ${executionContext && executionContext.length > 0 ? `The ${executionContext.length} affected elements are now my focus for the next command.` : ''}`
                    : `I couldn't complete any operations based on your request.`;
                lastMessageBubble.innerHTML = finalMessage;

                // Agent-driven follow-up suggestion
                this.controller.agent.suggestFollowUp(command, executionContext);

            } catch (error) {
                this.controller.error("Error processing command:", error);
                lastMessageBubble.innerHTML = `An unexpected error occurred: ${error.message}`;
            }
        }

        // Parses a natural language command into structured operations
        parseCommand(command) {
            const normalizedCommand = typeof command === 'string' ? command.replace(/\s+/g, ' ').trim() : '';
            const lowerCmd = normalizedCommand.toLowerCase();
            const operations = [];
            const directStyles = CommandUtils.extractStyleInstructions(normalizedCommand);
            const directAnimations = CommandUtils.extractAnimationInstructions(normalizedCommand);

            // Prioritize specific commands that should not be combined
            if (lowerCmd.includes('reset all styles') || lowerCmd.includes('clear styles')) {
                operations.push({ type: 'reset_styles' });
                return operations;
            }

            // Theme command: "make this page cyberpunk", "apply theme neural dark"
            const themeMatch = lowerCmd.match(/(?:make this page|apply theme) (?:the )?([\w\s]+)/);
            if (themeMatch) {
                const themeName = themeMatch[1].replace('theme ', '').trim();
                const themeKey = Object.keys(NEURAL_THEMES).find(k => k.replace(/_/g, ' ').toLowerCase().includes(themeName));
                if (themeKey) {
                    operations.push({ type: 'theme', theme: themeKey });
                    return operations;
                }
            }

            // Find/Select elements: "find all buttons", "select h2 tags", "get all divs"
            const findRegex = /(?:find|select|get) (?:all )?(.+?)(?: that are| with| and|$)/;
            const findMatch = lowerCmd.match(findRegex);
            if (findMatch) {
                let selector = findMatch[1].trim().replace(/ tags?/g, '');
                // Simple mapping for common elements
                if (selector.includes('button')) selector = 'button';
                else if (selector.includes('link')) selector = 'a';
                else if (selector.includes('image')) selector = 'img';
                else if (selector.includes('input')) selector = 'input';
                else if (selector.includes('paragraph')) selector = 'p';
                else if (selector.includes('heading')) selector = 'h1, h2, h3, h4, h5, h6';
                operations.push({ type: 'select', selector: selector });
            }

            // Apply styles: "color them blue", "make the background red", "change font size to 20px"
            const styleRegex = /(?:make them|color them|style them|change their|set their|make the background|set the background) (.+?)(?: and|$)/;
            const styleMatch = lowerCmd.match(styleRegex);
            if (styleMatch) {
                const styleString = styleMatch[1].trim();
                let style = {};
                if (styleString.includes('background')) {
                    style.backgroundColor = styleString.replace('background ', '').trim();
                } else if (styleString.includes('font size to')) {
                    style.fontSize = styleString.replace('font size to ', '').trim();
                } else if (styleString.includes('font family to')) {
                    style.fontFamily = styleString.replace('font family to ', '').trim();
                } else if (styleString.includes('border')) {
                    style.border = styleString.replace('border ', '').trim();
                } else if (styleString.includes('text align')) {
                    style.textAlign = styleString.replace('text align ', '').trim();
                }
                else {
                    style.color = styleString; // Default to color if not specific
                }
                operations.push({ type: 'style', style });
            }

            // Add animations: "add a pulse animation", "make them glow"
            const animRegex = /add a (.+?) (?:animation|effect)|make them (glow|pulse|shake)/;
            const animMatch = lowerCmd.match(animRegex);
            if (animMatch) {
                const animName = animMatch[1] || animMatch[2];
                operations.push({ type: 'animate', animation: animName });
            }

            // New: Modify DOM (attributes, text, classes)
            // "make all links open in new tabs" -> modify_dom (target: 'a', attribute: 'target', value: '_blank')
            // "disable the submit button" -> modify_dom (target: 'button[type="submit"]', attribute: 'disabled', value: 'true')
            // "change the title of the first h1 to 'New Title'" -> modify_dom (target: 'h1:first-of-type', textContent: 'New Title')
            const modifyDomRegex = /(?:make|change|set) (?:the )?(.+?)(?: to be| to| with| as) (.+)/;
            const modifyDomMatch = lowerCmd.match(modifyDomRegex);
            if (modifyDomMatch) {
                const targetDesc = modifyDomMatch[1].trim();
                const actionDesc = modifyDomMatch[2].trim();
                let selector = '';
                let attribute = '';
                let value = '';
                let textContentVar = '';

                if (targetDesc.includes('links')) selector = 'a';
                else if (targetDesc.includes('submit button')) selector = 'button[type="submit"], input[type="submit"]';
                else if (targetDesc.includes('first h1')) selector = 'h1:first-of-type';
                else if (targetDesc.includes('this element')) selector = this.context.lastSelectedElements && this.context.lastSelectedElements.length > 0 ? DOMUtils.getSelector(this.context.lastSelectedElements[0]) : '';

                if (actionDesc.includes('open in new tabs')) { attribute = 'target'; value = '_blank'; }
                else if (actionDesc.includes('disabled')) { attribute = 'disabled'; value = 'true'; }
                else if (actionDesc.includes('enabled')) { attribute = 'disabled'; value = ''; }
                else if (actionDesc.startsWith('title ')) { textContentVar = actionDesc.replace('title ', '').replace(/^'|'$/g, ''); } // Remove quotes
                else if (actionDesc.includes('hidden')) { attribute = 'style'; value = 'display: none !important;'; }
                else if (actionDesc.includes('visible')) { attribute = 'style'; value = 'display: block !important;'; }


                if (selector && (attribute || textContentVar)) {
                    operations.push({ type: 'modify_dom', selector, attribute, value, textContent: textContentVar });
                }
            }

            // New: Inject HTML
            // "add a 'Learn More' button to the main content" -> inject_html (target: 'main', position: 'beforeend', html: '<button>Learn More</button>')
            const injectHtmlRegex = /add (?:a |an )?(.+?) (?:to|into) (.+?)(?: at (.+))?$/;
            const injectHtmlMatch = lowerCmd.match(injectHtmlRegex);
            if (injectHtmlMatch) {
                const componentDesc = injectHtmlMatch[1].trim();
                const targetSelector = injectHtmlMatch[2].trim();
                const position = injectHtmlMatch[3] ? injectHtmlMatch[3].trim() : 'beforeend'; // default position

                let htmlContent = '';
                if (componentDesc.includes('button')) htmlContent = `<button class="chameleon-button">${componentDesc}</button>`;
                else if (componentDesc.includes('tooltip')) htmlContent = `<span style="background: black; color: white; padding: 5px; border-radius: 3px; position: absolute; z-index: 9999999;">${componentDesc}</span>`;
                else if (componentDesc.includes('login form')) {
                    operations.push({ type: 'generate_ui', prompt: 'login form' });
                    return operations;
                }
                // Add more complex HTML generation here based on prompt

                if (htmlContent && targetSelector) {
                    operations.push({ type: 'inject_html', selector: targetSelector, position, html: htmlContent });
                }
            }

            // New: Inject Script
            // "prevent this form from submitting" -> inject_script (selector: 'form', script: 'e.preventDefault()', event: 'submit')
            const injectScriptRegex = /(?:prevent|stop) (.+?) from (.+?)(?: by (.+))?$/;
            const injectScriptMatch = lowerCmd.match(injectScriptRegex);
            if (injectScriptMatch) {
                const targetDesc = injectScriptMatch[1].trim();
                const actionDesc = injectScriptMatch[2].trim();
                let selector = '';
                let script = '';
                let event = '';

                if (targetDesc.includes('form')) selector = 'form';
                else if (targetDesc.includes('button')) selector = 'button';
                else if (targetDesc.includes('this element')) selector = this.context.lastSelectedElements && this.context.lastSelectedElements.length > 0 ? DOMUtils.getSelector(this.context.lastSelectedElements[0]) : '';

                if (actionDesc.includes('submitting')) { script = 'e.preventDefault();'; event = 'submit'; }
                else if (actionDesc.includes('clicking')) { script = 'e.preventDefault();'; event = 'click'; }

                if (selector && script && event) {
                    operations.push({ type: 'inject_script', selector, script, event });
                }
            }

            // New: API Monitor commands
            // "monitor api calls to /users"
            // "mock /api/data with { 'status': 'ok' }"
            const monitorApiMatch = lowerCmd.match(/monitor api calls to (.+)/);
            if (monitorApiMatch) {
                operations.push({ type: 'monitor_api', url_regex: monitorApiMatch[1].trim() });
            }
            const mockApiMatch = lowerCmd.match(/mock (.+?) with (.+)/);
            if (mockApiMatch) {
                operations.push({ type: 'mock_api', url_regex: mockApiMatch[1].trim(), response: mockApiMatch[2].trim() });
            }

            // New: Vulnerability Scanner commands
            // "scan this login form for SQL injection"
            const scanElementMatch = lowerCmd.match(/scan (?:this )?(.+?) for (xss|sqli|sql injection)/);
            if (scanElementMatch) {
                const targetDesc = scanElementMatch[1].trim();
                const scanType = scanElementMatch[2].trim().replace('sql injection', 'sqli');
                let selector = '';
                if (targetDesc.includes('login form')) selector = 'form:has(input[type="password"])';
                else if (targetDesc.includes('input field')) selector = 'input[type="text"], textarea';
                else if (targetDesc.includes('this element')) selector = this.context.lastSelectedElements && this.context.lastSelectedElements.length > 0 ? DOMUtils.getSelector(this.context.lastSelectedElements[0]) : '';

                if (selector) {
                    operations.push({ type: 'scan_element', selector, scan_type: scanType });
                }
            }

            // New: Recreate Component (Generative UI from existing)
            // "recreate the header with a new title 'Chameleon Dashboard'"
            const recreateComponentMatch = lowerCmd.match(/recreate (?:the )?(.+?) with a new title '(.+?)'/);
            if (recreateComponentMatch) {
                const targetDesc = recreateComponentMatch[1].trim();
                const newTitle = recreateComponentMatch[2].trim();
                let selector = '';
                if (targetDesc.includes('header')) selector = 'header';
                else if (targetDesc.includes('footer')) selector = 'footer';
                else if (targetDesc.includes('main content')) selector = 'main';
                else if (targetDesc.includes('this element')) selector = this.context.lastSelectedElements && this.context.lastSelectedElements.length > 0 ? DOMUtils.getSelector(this.context.lastSelectedElements[0]) : '';

                if (selector) {
                    operations.push({ type: 'recreate_component', selector, new_content_prompt: `a ${targetDesc} with title "${newTitle}"` });
                }
            }


            // Simple commands
            if (lowerCmd.includes('summarize')) operations.push({ type: 'summarize' });
            if (lowerCmd.includes('scan page') || lowerCmd.includes('audit page')) operations.push({ type: 'scan' });
            if (lowerCmd.includes('record my actions') || lowerCmd.includes('start recording')) operations.push({ type: 'record_session' });
            if (lowerCmd.includes('stop recording')) operations.push({ type: 'stop_recording' });

            // Cross-tab orchestration (simulated)
            // "Take the product on this page, find it on Amazon and Best Buy in new tabs, and tell me which has the better price."
            if (lowerCmd.includes('find product on amazon and best buy')) {
                operations.push({ type: 'compare_product_price' });
            }
            // "I have five articles open about machine learning. Consolidate the key points from all of them into a single summary in the Toolkit."
            if (lowerCmd.includes('consolidate key points') || lowerCmd.includes('summarize multiple articles')) {
                operations.push({ type: 'consolidate_tab_summaries' });
            }
            // "Log into my GitHub, navigate to the 'WebApp-V2' repository, open a new issue titled 'Fix Login Button Style', and paste the component code from my clipboard into the description."
            if (lowerCmd.includes('log into my github') && lowerCmd.includes('open a new issue')) {
                operations.push({ type: 'github_mission' });
            }
            // "Go to Hacker News, find the top 5 stories with more than 200 points, open each in a new tab, and run the 'Summarize' command on them."
            if (lowerCmd.includes('go to hacker news') && lowerCmd.includes('summarize')) {
                operations.push({ type: 'hacker_news_mission' });
            }


            const hasContextSelection = Array.isArray(this.context.lastSelectedElements) && this.context.lastSelectedElements.length > 0;
            let selectorHints = CommandUtils.detectSelectorsFromCommand(normalizedCommand, lowerCmd, hasContextSelection);
            if (selectorHints.length === 0 && lowerCmd.includes('background')) {
                selectorHints = ['body'];
            }

            if (!operations.some(op => op.type === 'style')) {
                directStyles.forEach(style => {
                    if (style && Object.keys(style).length > 0) {
                        operations.push({ type: 'style', style });
                    }
                });
            }

            if (!operations.some(op => op.type === 'animate')) {
                directAnimations.forEach(animation => {
                    operations.push({ type: 'animate', animation });
                });
            }

            const hasSelectOp = operations.some(op => op.type === 'select');
            const operationsNeedContext = operations.some(op => ['style', 'animate', 'modify_dom', 'inject_html', 'inject_script', 'scan_element', 'recreate_component'].includes(op.type));

            if (!hasSelectOp && operationsNeedContext && selectorHints.length === 0 && !hasContextSelection && lowerCmd.includes('background')) {
                selectorHints = ['body'];
            }

            if (!hasSelectOp && selectorHints.length > 0 && (operationsNeedContext || operations.length === 0)) {
                operations.unshift({ type: 'select', selector: selectorHints.join(', ') });
            }

            if (operations.length === 0 && selectorHints.length > 0 && (directStyles.length > 0 || directAnimations.length > 0)) {
                operations.push({ type: 'select', selector: selectorHints.join(', ') });
                directStyles.forEach(style => {
                    operations.push({ type: 'style', style });
                });
                directAnimations.forEach(animation => {
                    operations.push({ type: 'animate', animation });
                });
            }

            return operations;
        }

        // Simple keyword extraction for summarization simulation
        extractKeywords(text) {
            const words = text.toLowerCase().match(/\b\w{4,}\b/g) || [];
            const wordCounts = {};
            words.forEach(word => {
                wordCounts[word] = (wordCounts[word] || 0) + 1;
            });
            const sortedWords = Object.entries(wordCounts).sort(([, countA], [, countB]) => countB - countA);
            return sortedWords.slice(0, 5).map(([word]) => word); // Top 5 keywords
        }
    }

    // Manages user preferences and data
    class SettingsManager {
        constructor(c) { this.controller = c; }
        // Renders the settings UI in its tab
        render() {
            const container = document.getElementById(`${CONFIG.ID_PREFIX}tab-settings`);
            if (!container) return;
            container.innerHTML = `
                <h3>Settings</h3>
                <p>Configure the behavior of the Genesis Command Center.</p>
                <div class="chameleon-card">
                    <h4>Foresight Engine</h4>
                    <div class="chameleon-setting-item">
                        <label for="setting-auto-enhance">Enable Proactive Enhancement</label>
                        <input type="checkbox" id="setting-auto-enhance" class="chameleon-toggle" ${GM_getValue('autoEnhance', true) ? 'checked' : ''}>
                    </div>
                    <div class="chameleon-setting-item">
                        <label for="setting-foresight-mode">Foresight Mode</label>
                        <select id="setting-foresight-mode" class="chameleon-select">
                            <option value="suggest" ${GM_getValue('foresightMode', 'suggest') === 'suggest' ? 'selected' : ''}>Suggest Actions (Recommended)</option>
                            <option value="auto" ${GM_getValue('foresightMode', 'suggest') === 'auto' ? 'selected' : ''}>Auto-Apply Suggestions</option>
                        </select>
                    </div>
                    <p class="chameleon-info-text">Allows the AI to suggest or apply enhancements based on page content and user behavior.</p>
                </div>
                 <div class="chameleon-card">
                    <h4>Data Management</h4>
                    <button id="setting-clear-cache" class="chameleon-button secondary">${ICONS.security} Clear All Settings & Data</button>
                    <p class="chameleon-info-text">This will remove all saved preferences, themes, and recorded sessions. Requires page reload.</p>
                </div>
            `;
            this.bindEvents();
        }
        // Binds event listeners for settings controls
        bindEvents() {
            document.getElementById('setting-auto-enhance').addEventListener('change', (e) => {
                const isEnabled = e.target.checked;
                GM_setValue('autoEnhance', isEnabled);
                this.controller.ui.showNotification(`Auto Enhancement ${isEnabled ? 'Enabled' : 'Disabled'}.`, 3000, { type: isEnabled ? 'success' : 'warning' });
                if (isEnabled) {
                    this.controller.foresight.startObserver();
                } else {
                    this.controller.foresight.stopObserver();
                }
                this.controller.agent.trackUserActivity('setting_changed', { setting: 'autoEnhance', value: isEnabled });
            });
            document.getElementById('setting-foresight-mode').addEventListener('change', (e) => {
                const mode = e.target.value;
                GM_setValue('foresightMode', mode);
                this.controller.ui.showNotification(`Foresight Mode set to "${mode}".`, 3000, { type: 'info' });
                this.controller.agent.trackUserActivity('setting_changed', { setting: 'foresightMode', value: mode });
            });
            document.getElementById('setting-clear-cache').addEventListener('click', () => {
                if (confirm('Are you sure you want to clear all Chameleon AI-Forge settings and data? This cannot be undone.')) {
                    const keys = GM_listValues();
                    keys.forEach(key => GM_deleteValue(key));
                    this.controller.ui.showNotification('All data cleared. Please reload the page to apply changes.', 5000, { type: 'success' });
                    this.controller.agent.trackUserActivity('data_cleared');
                }
            });
        }
    }

    // Proactively observes the DOM for potential issues or enhancement opportunities
    class ForesightEngine {
        constructor(c) {
            this.controller = c;
            this.observer = null; // MutationObserver instance
            this.userActionHistory = []; // To detect patterns
        }
        // Initializes the foresight engine based on user settings
        init() {
            if (GM_getValue('autoEnhance', true)) {
                this.startObserver();
            }
            this.addGlobalActionListeners();
        }
        // Starts observing DOM mutations
        startObserver() {
            if (this.observer) return; // Already observing
            this.controller.log('Foresight Engine observer started.');
            // Observe childList (add/remove nodes), subtree (all descendants), and specific attributes
            this.observer = new MutationObserver(this.handleMutations);
            this.observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['alt', 'aria-label', 'placeholder', 'title', 'href', 'target', 'disabled'] });
            this.controller.ui.updateStatus('Foresight Engine Active.', 'info');
        }
        // Stops observing DOM mutations
        stopObserver() {
            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
                this.controller.log('Foresight Engine observer stopped.');
                this.controller.ui.updateStatus('Foresight Engine Inactive.', 'info');
            }
        }
        // Adds global listeners for user actions to build history
        addGlobalActionListeners() {
            document.addEventListener('click', this.recordUserAction);
            document.addEventListener('input', this.recordUserAction);
            document.addEventListener('keydown', this.recordUserAction);
            document.addEventListener('copy', this.recordUserAction); // For clipboard copy
        }

        recordUserAction = (e) => {
            if (e.target.closest(`[id^="${CONFIG.ID_PREFIX}"]`)) return; // Ignore Chameleon UI
            const action = {
                type: e.type,
                selector: DOMUtils.getSelector(e.target),
                timestamp: Date.now(),
                value: e.type === 'input' ? e.target.value : undefined,
                key: e.type === 'keydown' ? e.key : undefined,
            };
            this.userActionHistory.push(action);
            if (this.userActionHistory.length > 50) { // Keep history manageable
                this.userActionHistory.shift();
            }
            this.controller.agent.processInsight('user_action_recorded', action);
        }

        // Handles observed DOM mutations and sends insights to AgentCore
        handleMutations = (mutationsList, observer) => {
            mutationsList.forEach(mutation => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // Accessibility: Image without alt
                            if (node.tagName === 'IMG' && (!node.hasAttribute('alt') || node.getAttribute('alt').trim() === '')) {
                                this.controller.agent.processInsight('accessibility_issue', { type: 'image_no_alt', element: node });
                            }
                            // Accessibility: Button without accessible name
                            if (node.tagName === 'BUTTON' && !node.textContent.trim() && !node.querySelector('svg') && !node.hasAttribute('aria-label') && !node.hasAttribute('title')) {
                                this.controller.agent.processInsight('accessibility_issue', { type: 'button_no_label', element: node });
                            }
                            // UX: Detect long unformatted text blocks (e.g., for summarization suggestion)
                            if (node.tagName === 'P' && node.textContent.length > 500 && node.closest('article, main')) {
                                this.controller.agent.processInsight('ux_issue', { type: 'long_paragraph', element: node });
                            }
                            // Form fields without labels
                            if ((node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT') && !node.id && !node.hasAttribute('aria-label') && !node.hasAttribute('placeholder') && !node.closest('label')) {
                                this.controller.agent.processInsight('form_issue', { type: 'input_no_label', element: node });
                            }
                            // External links without target="_blank"
                            if (node.tagName === 'A' && node.href && !node.href.startsWith(window.location.origin) && !node.target) {
                                this.controller.agent.processInsight('ux_issue', { type: 'external_link_no_target_blank', element: node });
                            }
                        }
                    });
                }
                // Attribute changes
                if (mutation.type === 'attributes') {
                    // Re-check alt text if it was added/removed
                    if (mutation.target.tagName === 'IMG' && mutation.attributeName === 'alt') {
                        if (!mutation.target.hasAttribute('alt') || mutation.target.getAttribute('alt').trim() === '') {
                            this.controller.agent.processInsight('accessibility_issue', { type: 'image_no_alt', element: mutation.target });
                        }
                    }
                    // Re-check target for external links
                    if (mutation.target.tagName === 'A' && mutation.attributeName === 'target') {
                        if (mutation.target.href && !mutation.target.href.startsWith(window.location.origin) && !mutation.target.target) {
                            this.controller.agent.processInsight('ux_issue', { type: 'external_link_no_target_blank', element: mutation.target });
                        }
                    }
                }
            });
        }
    }

    // The central intelligence unit, processing insights and orchestrating actions
    class AgentCore {
        constructor(controller) {
            this.controller = controller;
            this.context = {
                currentPage: window.location.href,
                lastUserActivity: null,
                pageScanResults: null,
                lastGenesisCommand: null,
                activeTab: controller.state.activeTab,
                // Add more context variables as needed to inform decisions
            };
            this.userActivityLog = []; // Simple in-memory log for current session
            this.insightQueue = []; // Queue for insights to process sequentially
            this.isProcessingInsights = false;
        }

        // Initializes the agent core and starts processing any queued insights
        init() {
            this.controller.log('Agent Core initialized.');
            this.processInsightQueue(); // Start processing queue
        }

        // Tracks user activity to build a behavioral context
        trackUserActivity(activityType, data = {}) {
            const activity = {
                type: activityType,
                timestamp: Date.now(),
                data: data
            };
            this.userActivityLog.push(activity);
            this.controller.log('User Activity:', activity);
            // Limit log size to prevent memory issues
            if (this.userActivityLog.length > 100) {
                this.userActivityLog.shift();
            }
            this.context.lastUserActivity = activity;
            // Immediately process user activity as an insight
            this.processInsight('user_activity', activity);
        }

        // Adds an insight to the processing queue
        processInsight(insightType, data) {
            this.insightQueue.push({ type: insightType, data: data });
            if (!this.isProcessingInsights) {
                this.processInsightQueue(); // Start processing if not already
            }
        }

        // Processes insights from the queue one by one
        async processInsightQueue() {
            if (this.isProcessingInsights || this.insightQueue.length === 0) {
                return;
            }
            this.isProcessingInsights = true;

            while (this.insightQueue.length > 0) {
                const insight = this.insightQueue.shift();
                this.controller.log('Agent processing insight:', insight);

                // Update agent's internal context based on the insight
                if (insight.type === 'page_scan_complete') {
                    this.context.pageScanResults = insight.data;
                } else if (insight.type === 'genesis_command') {
                    this.context.lastGenesisCommand = insight.data;
                } else if (insight.type === 'tab_switch') {
                    this.context.activeTab = insight.data.tab;
                }

                // Decision logic based on insight type and current context
                switch (insight.type) {
                    case 'accessibility_issue':
                        await this.handleAccessibilityIssue(insight.data);
                        break;
                    case 'ux_issue':
                        await this.handleUXIssue(insight.data);
                        break;
                    case 'form_issue':
                        await this.handleFormIssue(insight.data);
                        break;
                    case 'page_scan_complete':
                        await this.handlePageScanComplete(insight.data);
                        break;
                    case 'security_finding':
                        // Agent acknowledges a finding from the scanner
                        break;
                    case 'user_action_recorded':
                        this.checkForRepetitiveWorkflow(insight.data);
                        break;
                    // Add more insight handlers as the agent's capabilities grow
                }
                await new Promise(resolve => setTimeout(resolve, 50)); // Small delay to prevent blocking the main thread
            }
            this.isProcessingInsights = false;
        }

        // Handles accessibility-related insights
        async handleAccessibilityIssue(data) {
            const foresightMode = GM_getValue('foresightMode', 'suggest');
            const element = data.element;

            if (!element || !document.body.contains(element)) {
                this.controller.log('Agent: Element for accessibility issue no longer in DOM.');
                return;
            }

            if (data.type === 'image_no_alt') {
                const message = `${ICONS.bulb} Accessibility: Image without alt text detected.`;
                const actionText = 'Add Alt Text (Simulated)';
                const actionCallback = () => {
                    this.executeAgentOperation({ type: 'modify_dom', selector: DOMUtils.getSelector(element), attribute: 'alt', value: 'AI-suggested alt text' });
                    element.classList.remove('chameleon-agent-suggested'); // Remove highlight after action
                };

                if (foresightMode === 'auto') {
                    actionCallback();
                } else {
                    element.classList.add('chameleon-agent-suggested'); // Highlight element
                    this.controller.ui.showNotification(message, 5000, { actionText, actionCallback, type: 'warning' });
                }
            } else if (data.type === 'button_no_label') {
                const message = `${ICONS.bulb} Accessibility: Button without accessible label detected.`;
                const actionText = 'Add Label (Simulated)';
                const actionCallback = () => {
                    this.executeAgentOperation({ type: 'modify_dom', selector: DOMUtils.getSelector(element), attribute: 'aria-label', value: 'AI-suggested action' });
                    element.classList.remove('chameleon-agent-suggested');
                };
                if (foresightMode === 'auto') {
                    actionCallback();
                } else {
                    element.classList.add('chameleon-agent-suggested');
                    this.controller.ui.showNotification(message, 5000, { actionText, actionCallback, type: 'warning' });
                }
            }
        }

        // Handles UX-related insights
        async handleUXIssue(data) {
            const foresightMode = GM_getValue('foresightMode', 'suggest');
            const element = data.element;

            if (!element || !document.body.contains(element)) return;

            if (data.type === 'long_paragraph') {
                const message = `${ICONS.bulb} UX Suggestion: Long paragraph detected. Consider summarizing or breaking it up.`;
                const actionText = 'Summarize (Simulated)';
                const actionCallback = () => {
                    this.executeAgentOperation({ type: 'modify_dom', selector: DOMUtils.getSelector(element), textContent: element.textContent.substring(0, 200) + '... (AI-summarized)' });
                    element.classList.remove('chameleon-agent-suggested');
                };
                if (foresightMode === 'auto') {
                    actionCallback();
                } else {
                    element.classList.add('chameleon-agent-suggested');
                    this.controller.ui.showNotification(message, 5000, { actionText, actionCallback, type: 'info' });
                }
            } else if (data.type === 'external_link_no_target_blank') {
                const message = `${ICONS.bulb} UX Suggestion: External link without target="_blank" detected.`;
                const actionText = 'Add target="_blank"';
                const actionCallback = () => {
                    this.executeAgentOperation({ type: 'modify_dom', selector: DOMUtils.getSelector(element), attribute: 'target', value: '_blank' });
                    element.classList.remove('chameleon-agent-suggested');
                };
                if (foresightMode === 'auto') {
                    actionCallback();
                } else {
                    element.classList.add('chameleon-agent-suggested');
                    this.controller.ui.showNotification(message, 5000, { actionText, actionCallback, type: 'info' });
                }
            }
        }

        // Handles form-related insights
        async handleFormIssue(data) {
            const foresightMode = GM_getValue('foresightMode', 'suggest');
            const element = data.element;

            if (!element || !document.body.contains(element)) return;

            if (data.type === 'input_no_label') {
                const message = `${ICONS.bulb} Form Suggestion: Input field without a direct label detected.`;
                const actionText = 'Add Placeholder (Simulated)';
                const actionCallback = () => {
                    this.executeAgentOperation({ type: 'modify_dom', selector: DOMUtils.getSelector(element), attribute: 'placeholder', value: 'AI-suggested placeholder' });
                    element.classList.remove('chameleon-agent-suggested');
                };
                if (foresightMode === 'auto') {
                    actionCallback();
                } else {
                    element.classList.add('chameleon-agent-suggested');
                    this.controller.ui.showNotification(message, 5000, { actionText, actionCallback, type: 'info' });
                }
            }
        }

        // Handles insights from a completed page scan
        async handlePageScanComplete(scanResults) {
            // After a full page scan, the agent can analyze results and suggest actions
            if (scanResults.security.score < 70) {
                this.controller.ui.showNotification(
                    `${ICONS.security} Agent: Your page security score is low (${scanResults.security.score}/100).`,
                    7000,
                    {
                        actionText: 'View Report',
                        actionCallback: () => this.controller.ui.switchTab('security'),
                        type: 'danger'
                    }
                );
            }
            if (scanResults.metrics.imagesWithoutAlt > 0 || scanResults.metrics.emptyLinks > 0) {
                this.controller.ui.showNotification(
                    `${ICONS.bulb} Agent: Found accessibility issues.`,
                    7000,
                    {
                        actionText: 'View Details',
                        actionCallback: () => this.controller.ui.switchTab('analyze'),
                        type: 'warning'
                    }
                );
            }
        }

        // Checks for repetitive user action patterns and suggests automation
        checkForRepetitiveWorkflow(lastAction) {
            // This is a simplified pattern detection. A real system would use more advanced ML.
            // Example: Copy text -> Click -> Input
            const history = this.controller.foresight.userActionHistory;
            if (history.length >= 3) {
                const last3 = history.slice(-3);
                const pattern = last3.map(a => a.type).join('->');

                if (pattern === 'copy->click->input') {
                    // This is a simplification, as actual clipboard content is not easily accessible
                    const copiedText = 'Last copied text (simulated)';
                    const inputSelector = last3[2].selector;
                    this.controller.ui.showNotification(
                        `${ICONS.bulb} Agent: I noticed you copied text and then clicked an element and typed into an input. Would you like to automate this?`,
                        10000,
                        {
                            actionText: 'Automate (Simulated)',
                            actionCallback: () => {
                                this.controller.ui.showNotification(`Automation for copying "${copiedText}" and pasting into "${inputSelector}" enabled (simulated).`, 5000, { type: 'success' });
                                this.controller.agent.trackUserActivity('workflow_automated', { pattern: 'copy_paste' });
                            },
                            type: 'info'
                        }
                    );
                    // Clear history to prevent repeated suggestions for the same pattern
                    this.controller.foresight.userActionHistory = [];
                }
            }
        }


        // Centralized execution of operations, allowing agent to inject logic or context
        async executeAgentOperation(op, context) {
            switch (op.type) {
                case 'select':
                    const elements = Array.from(document.querySelectorAll(op.selector));
                    this.controller.log(`Agent selected ${elements.length} elements with selector "${op.selector}"`);
                    if (elements.length === 0) {
                        throw new Error(`No elements found for selector "${op.selector}".`);
                    }
                    // Briefly highlight selected elements
                    elements.forEach(el => {
                        el.classList.add('chameleon-temp-highlight');
                        setTimeout(() => el.classList.remove('chameleon-temp-highlight'), 1000);
                    });
                    return elements;
                case 'style':
                    if (!context || context.length === 0) throw new Error("No elements selected to style. Please select elements first (e.g., 'find all buttons').");
                    context.forEach(el => Object.assign(el.style, op.style));
                    this.controller.ui.showNotification(`Applied style to ${context.length} elements.`, 2000, { type: 'success' });
                    return context;
                case 'animate':
                    if (!context || context.length === 0) throw new Error("No elements selected to animate. Please select elements first.");
                    const css = `
                        @keyframes chameleon-pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.05); opacity: 0.7; } }
                        @keyframes chameleon-glow { 0%, 100% { box-shadow: 0 0 5px var(--chameleon-accent); } 50% { box-shadow: 0 0 20px var(--chameleon-accent); } }
                        @keyframes chameleon-shake { 0%, 100% { transform: translateX(0); } 10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); } 20%, 40%, 60%, 80% { transform: translateX(5px); } }
                        .chameleon-anim-pulse { animation: chameleon-pulse 2s infinite; }
                        .chameleon-anim-glow { animation: chameleon-glow 2s infinite; }
                        .chameleon-anim-shake { animation: chameleon-shake 0.8s cubic-bezier(.36,.07,.19,.97) both; }
                    `;
                    this.controller.styler.applyCustomCSS(css, 'animations');
                    context.forEach(el => el.classList.add(`chameleon-anim-${op.animation}`));
                    this.controller.ui.showNotification(`Applied "${op.animation}" animation to ${context.length} elements.`, 2000, { type: 'success' });
                    return context;
                case 'scan':
                    this.controller.ui.switchTab('analyze');
                    await this.controller.analyzer.runFullPageScan();
                    return null;
                case 'summarize':
                    const textContent = document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 2000);
                    const title = document.title || 'this page';
                    const keywords = this.controller.genesis.extractKeywords(textContent);
                    this.controller.genesis.addMessage(`Based on the visible content, "${title}" appears to be about: ${keywords.join(', ')}. A full, nuanced summary would require a connection to a true LLM.`, 'ai');
                    return null;
                case 'theme':
                    this.controller.styler.applyTheme(op.theme);
                    return null;
                case 'reset_styles':
                    this.controller.styler.resetStyles();
                    return null;
                case 'record_session':
                    this.controller.ui.switchTab('tools');
                    this.controller.toolkit.sessionRecorder.toggleRecording();
                    return null;
                case 'stop_recording':
                    this.controller.ui.switchTab('tools');
                    if (this.controller.toolkit.sessionRecorder.isRecording) {
                        this.controller.toolkit.sessionRecorder.toggleRecording();
                    } else {
                        this.controller.ui.showNotification('Recording is not active.', 2000, { type: 'info' });
                    }
                    return null;
                case 'modify_dom':
                    const elementsToModify = document.querySelectorAll(op.selector);
                    if (elementsToModify.length === 0) {
                        throw new Error(`No elements found for selector "${op.selector}" to modify.`);
                    }
                    elementsToModify.forEach(el => {
                        if (op.attribute) {
                            if (op.value === 'true') el.setAttribute(op.attribute, ''); // For boolean attributes like 'disabled'
                            else if (op.value === '') el.removeAttribute(op.attribute);
                            else el.setAttribute(op.attribute, op.value);
                        }
                        if (op.textContent !== undefined) {
                            el.textContent = op.textContent;
                        }
                        if (op.addClass) {
                            el.classList.add(op.addClass);
                        }
                        if (op.removeClass) {
                            el.classList.remove(op.removeClass);
                        }
                    });
                    this.controller.ui.showNotification(`Modified ${elementsToModify.length} elements.`, 2000, { type: 'success' });
                    return Array.from(elementsToModify);
                case 'inject_html':
                    const targetElement = document.querySelector(op.selector);
                    if (!targetElement) throw new Error(`Target element for HTML injection not found: "${op.selector}"`);
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = op.html;
                    const injectedElement = tempDiv.firstElementChild;
                    if (!injectedElement) throw new Error('Invalid HTML content provided for injection.');

                    targetElement.insertAdjacentElement(op.position, injectedElement);
                    DOMUtils.createRemovableOverlay(injectedElement, () => injectedElement.remove());
                    this.controller.ui.addRemovableOverlay(injectedElement.querySelector(`.${CONFIG.ID_PREFIX}removable-overlay`), injectedElement);

                    this.controller.ui.showNotification(`Injected HTML into "${op.selector}".`, 3000, { type: 'success' });
                    return [injectedElement];
                case 'inject_script':
                    const scriptTargetElements = document.querySelectorAll(op.selector);
                    if (scriptTargetElements.length === 0) throw new Error(`Target element for script injection not found: "${op.selector}"`);
                    scriptTargetElements.forEach(el => {
                        const scriptId = `${CONFIG.ID_PREFIX}injected-script-${Date.now()}`;
                        const script = document.createElement('script');
                        script.id = scriptId;
                        script.textContent = `
                            (function() {
                                const targetEl = document.querySelector('${DOMUtils.getSelector(el).replace(/'/g, "\\'")}'); // Escape single quotes
                                if (targetEl) {
                                    targetEl.addEventListener('${op.event}', function(e) {
                                        ${op.script}
                                        console.log('Chameleon AI-Forge injected script triggered for event ${op.event} on ${DOMUtils.getSelector(el).replace(/'/g, "\\'")}');
                                    });
                                }
                            })();
                        `;
                        document.body.appendChild(script);
                        // Mark for potential cleanup if needed, but event listeners are harder to remove cleanly.
                        script.dataset.chameleonInjected = 'true';
                    });
                    this.controller.ui.showNotification(`Injected script for "${op.event}" event on ${scriptTargetElements.length} elements.`, 3000, { type: 'success' });
                    return Array.from(scriptTargetElements);
                case 'monitor_api':
                    this.controller.ui.switchTab('network');
                    this.controller.apiMonitor.addMonitorRule({ urlRegex: op.url_regex }); // Simplified rule
                    this.controller.ui.showNotification(`Monitoring API calls matching "${op.url_regex}".`, 3000, { type: 'info' });
                    return null;
                case 'mock_api':
                    this.controller.ui.switchTab('network');
                    try {
                        JSON.parse(op.response); // Validate JSON
                        this.controller.apiMonitor.addMockRule({
                            urlRegex: op.url_regex,
                            method: 'ANY', // Default to ANY method for simplicity
                            status: 200, // Default status
                            response: op.response
                        });
                        this.controller.ui.showNotification(`Added mock rule for "${op.url_regex}".`, 3000, { type: 'success' });
                    } catch (e) {
                        throw new Error('Invalid JSON response provided for mock_api operation.');
                    }
                    return null;
                case 'scan_element':
                    this.controller.ui.switchTab('security');
                    const scanEl = document.querySelector(op.selector);
                    if (!scanEl) throw new Error(`Element for targeted scan not found: "${op.selector}"`);
                    await this.controller.vulnerabilityScanner.scanTarget(scanEl, op.scan_type);
                    return [scanEl];
                case 'recreate_component':
                    const originalComponent = document.querySelector(op.selector);
                    if (!originalComponent) throw new Error(`Component to recreate not found: "${op.selector}"`);
                    await this.controller.toolkit.appIsolation.remixComponent(originalComponent, op.new_content_prompt);
                    return null;
                case 'generate_ui':
                    this.controller.ui.switchTab('style');
                    await this.controller.styler.generateUI(op.prompt);
                    return null;

                // Tier 1: Cross-Tab Orchestration (Simulated)
                case 'github_mission':
                    this.controller.ui.showNotification('Simulating GitHub mission: Logging in, navigating, creating issue...', 5000, { type: 'info' });
                    await new Promise(r => setTimeout(r, 2000));
                    GM_openInTab('https://github.com/login', { active: true, insert: true });
                    await new Promise(r => setTimeout(r, 3000)); // Simulate login time
                    // In a real scenario, you'd interact with the opened tab. Here, we simulate success.
                    GM_openInTab('https://github.com/ChameleonAI-Forge/WebApp-V2/issues/new', { active: true, insert: true });
                    await new Promise(r => setTimeout(r, 2000));
                    this.controller.ui.showNotification('GitHub issue created (simulated)!', 5000, { type: 'success' });
                    return null;
                case 'hacker_news_mission':
                    this.controller.ui.showNotification('Simulating Hacker News mission: Finding top stories, summarizing...', 5000, { type: 'info' });
                    await new Promise(r => setTimeout(r, 2000));
                    const hnUrl = 'https://news.ycombinator.com/';
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: hnUrl,
                        onload: (response) => {
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(response.responseText, 'text/html');
                            const stories = Array.from(doc.querySelectorAll('.athing')).filter(item => {
                                const scoreEl = item.nextElementSibling?.querySelector('.score');
                                return scoreEl && parseInt(scoreEl.textContent) > 200;
                            }).slice(0, 5);

                            if (stories.length === 0) {
                                this.controller.ui.showNotification('No Hacker News stories found with >200 points.', 3000, { type: 'warning' });
                                return;
                            }

                            let summary = 'Hacker News Top Stories Summary:\n';
                            let storiesProcessed = 0;
                            stories.forEach((story, index) => {
                                const titleEl = story.querySelector('.titleline a');
                                const link = titleEl ? titleEl.href : '#';
                                const title = titleEl ? titleEl.textContent : 'No Title';
                                summary += `\n${index + 1}. ${title} (${link})\n`;
                                // Simulate opening in new tab and summarizing content
                                GM_xmlhttpRequest({
                                    method: 'GET',
                                    url: link,
                                    onload: (storyRes) => {
                                        const storyParser = new DOMParser();
                                        const storyDoc = storyParser.parseFromString(storyRes.responseText, 'text/html');
                                        const storyText = storyDoc.body.textContent.replace(/\s+/g, ' ').trim().substring(0, 500);
                                        const keywords = this.controller.genesis.extractKeywords(storyText);
                                        summary += `   Keywords: ${keywords.join(', ')}\n`;
                                        storiesProcessed++;
                                        if (storiesProcessed === stories.length) { // All stories processed
                                            this.controller.genesis.addMessage(summary, 'ai');
                                            this.controller.ui.showNotification('Hacker News stories summarized!', 3000, { type: 'success' });
                                        }
                                    },
                                    onerror: () => {
                                        summary += `   (Failed to load content for summary)\n`;
                                        storiesProcessed++;
                                        if (storiesProcessed === stories.length) {
                                            this.controller.genesis.addMessage(summary, 'ai');
                                            this.controller.ui.showNotification('Hacker News stories summarized (with some errors)!', 3000, { type: 'warning' });
                                        }
                                    }
                                });
                                GM_openInTab(link, { active: false, insert: true }); // Open in background tab
                            });
                        },
                        onerror: () => {
                            this.controller.ui.showNotification('Failed to fetch Hacker News. Check connection or URL.', 3000, { type: 'danger' });
                        }
                    });
                    return null;
                case 'compare_product_price':
                    this.controller.ui.showNotification('Simulating product price comparison...', 5000, { type: 'info' });
                    await new Promise(r => setTimeout(r, 2000));
                    // This would require scraping specific product pages, which is highly site-dependent.
                    // For now, simulate a result.
                    const productName = document.title.split('-')[0].trim() || 'Current Product';
                    const amazonPrice = (Math.random() * 100 + 50).toFixed(2);
                    const bestBuyPrice = (Math.random() * 100 + 50).toFixed(2);
                    const cheaperStore = parseFloat(amazonPrice) < parseFloat(bestBuyPrice) ? 'Amazon' : 'Best Buy';
                    this.controller.genesis.addMessage(`For "${productName}": Amazon has it for $${amazonPrice}, Best Buy for $${bestBuyPrice}. ${cheaperStore} is cheaper.`, 'ai');
                    this.controller.ui.showNotification('Product price comparison complete (simulated)!', 3000, { type: 'success' });
                    return null;
                case 'consolidate_tab_summaries':
                    this.controller.ui.showNotification('Simulating consolidation of key points from multiple tabs...', 5000, { type: 'info' });
                    await new Promise(r => setTimeout(r, 2000));
                    // In a real extension, you'd use chrome.tabs.query to get all tabs and their content.
                    // Here, we'll just summarize the current page multiple times.
                    const currentTitle = document.title || 'Current Page';
                    const currentText = document.body.innerText.replace(/\s+/g, ' ').trim().substring(0, 1000);
                    const summary1 = `Summary from Tab 1 (${currentTitle}): Keywords: ${this.controller.genesis.extractKeywords(currentText).join(', ')}.`;
                    const summary2 = `Summary from Tab 2 (Simulated): More keywords: AI, machine learning, data science.`;
                    const summary3 = `Summary from Tab 3 (Simulated): Key points: neural networks, deep learning, algorithms.`;
                    this.controller.genesis.addMessage(`Consolidated Summary:\n\n${summary1}\n\n${summary2}\n\n${summary3}`, 'ai');
                    this.controller.ui.showNotification('Key points consolidated (simulated)!', 3000, { type: 'success' });
                    return null;

                default:
                    this.controller.log('Agent: Unknown operation:', op);
                    this.controller.ui.showNotification(`I don't understand how to perform "${op.type}".`, 3000, { type: 'warning' });
                    return context;
            }
        }

        // Provides follow-up suggestions based on the last command and context
        async suggestFollowUp(lastCommand, affectedElements) {
            // Example follow-up logic
            if (lastCommand.toLowerCase().includes('scan page')) {
                const scanResults = this.context.pageScanResults;
                if (scanResults && (scanResults.metrics.imagesWithoutAlt > 0 || scanResults.metrics.emptyLinks > 0)) {
                    this.controller.genesis.addMessage(`I noticed some accessibility issues in the scan results. Would you like me to highlight them or suggest fixes?`, 'ai');
                }
            } else if (lastCommand.toLowerCase().includes('find all buttons') && affectedElements && affectedElements.length > 0) {
                this.controller.genesis.addMessage(`I've found ${affectedElements.length} buttons. What would you like to do with them? (e.g., 'color them red', 'make them pulse')`, 'ai');
            } else if (lastCommand.toLowerCase().includes('mock api')) {
                this.controller.genesis.addMessage(`The API is now mocked. Would you like to test it by replaying a request?`, 'ai');
            }
        }
    }

    // Provides a quick search and execution interface for commands
    class CommandPalette {
        constructor(c) {
            this.controller = c;
            this.isOpen = false;
            this.commands = [];
            this.elements = {};
            this.activeItemIndex = -1;
        }

        // Initializes the command palette by registering commands and creating UI
        init() {
            this.registerDefaultCommands();
            this.create();
        }

        // Defines available commands for the palette
        registerDefaultCommands() {
            const c = this.controller;
            this.commands = [
                { name: 'Toggle Command Center', icon: ICONS.logo, action: () => c.ui.togglePanel() },
                { name: 'Toggle Element Inspector', icon: ICONS.inspect, action: () => c.toggleInspectMode() },
                { name: 'Run Full Page Scan', icon: ICONS.analyze, action: () => { c.ui.switchTab('analyze'); c.analyzer.runFullPageScan(); } },
                { name: 'Scan for Reflected XSS', icon: ICONS.security, action: () => { c.ui.switchTab('security'); c.vulnerabilityScanner.scanXSS(); } },
                { name: 'Scan for Basic SQLi', icon: ICONS.security, action: () => { c.ui.switchTab('security'); c.vulnerabilityScanner.scanSQLInjection(); } },
                { name: 'Scan for Exposed Directories', icon: ICONS.security, action: () => { c.ui.switchTab('security'); c.vulnerabilityScanner.scanDirectoryExposure(); } },
                { name: 'Reset All Styles & Generated UI', icon: ICONS.style, action: () => c.styler.resetStyles() },
                { name: 'Start Session Recording', icon: ICONS.record, action: () => { c.ui.switchTab('tools'); c.toolkit.sessionRecorder.toggleRecording(); } },
                { name: 'Stop Session Recording', icon: ICONS.stop, action: () => { c.ui.switchTab('tools'); if (c.toolkit.sessionRecorder.isRecording) c.toolkit.sessionRecorder.toggleRecording(); else c.ui.showNotification('Recording not active.', 2000, { type: 'info' }); } },
                { name: 'Copy Recorded Script', icon: ICONS.copy, action: () => { c.ui.switchTab('tools'); c.toolkit.sessionRecorder.copyScript(); } },
                { name: 'Activate Component Isolation', icon: ICONS.tools, action: () => { c.ui.switchTab('tools'); c.toolkit.appIsolation.enterSelectionMode(); } },
                { name: 'Generate Login Form', icon: ICONS.terminal, action: () => { c.ui.switchTab('style'); c.styler.generateUI('login form'); } },
                { name: 'Generate Product Card', icon: ICONS.terminal, action: () => { c.ui.switchTab('style'); c.styler.generateUI('product card'); } },
                ...Object.entries(NEURAL_THEMES).map(([key, theme]) => ({
                    name: `Apply Theme: ${theme.name}`,
                    icon: ICONS.style,
                    action: () => c.styler.applyTheme(key)
                }))
            ].sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically for consistent display
        }

        // Allows external modules/plugins to register commands
        registerCommand(command) {
            this.commands.push(command);
            this.commands.sort((a, b) => a.name.localeCompare(b.name)); // Re-sort
        }

        // Creates the command palette UI elements
        create() {
            const overlay = document.createElement('div');
            overlay.className = 'chameleon-palette-overlay';
            overlay.innerHTML = `
                <div class="chameleon-palette-modal">
                    <div class="chameleon-palette-input-wrapper">
                        ${ICONS.execute}
                        <input type="text" class="chameleon-palette-input" placeholder="Type a command or search...">
                    </div>
                    <ul class="chameleon-palette-results"></ul>
                </div>
            `;
            document.body.appendChild(overlay);
            this.elements.overlay = overlay;
            this.elements.input = overlay.querySelector('input');
            this.elements.results = overlay.querySelector('ul');

            this.elements.overlay.addEventListener('click', (e) => { if (e.target === this.elements.overlay) this.hide(); });
            this.elements.input.addEventListener('input', () => this.filter());
            this.elements.input.addEventListener('keydown', (e) => {
                const items = this.elements.results.querySelectorAll('li');
                if (items.length === 0) return;

                if (e.key === 'Enter') {
                    e.preventDefault(); // Prevent form submission if any
                    const activeItem = this.elements.results.querySelector('li.active');
                    if (activeItem) activeItem.click();
                } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    items[this.activeItemIndex]?.classList.remove('active');
                    if (e.key === 'ArrowDown') {
                        this.activeItemIndex = (this.activeItemIndex + 1) % items.length;
                    } else {
                        this.activeItemIndex = (this.activeItemIndex - 1 + items.length) % items.length;
                    }
                    items[this.activeItemIndex].classList.add('active');
                    items[this.activeItemIndex].scrollIntoView({ block: 'nearest' });
                }
            });
        }

        // Toggles the visibility of the command palette
        toggle() {
            this.isOpen ? this.hide() : this.show();
            this.controller.agent.trackUserActivity('palette_toggle', { state: this.isOpen ? 'open' : 'closed' });
        }
        // Shows the command palette
        show() {
            this.isOpen = true;
            this.elements.overlay.style.display = 'flex';
            this.elements.input.value = '';
            this.filter(); // Show all commands initially
            this.elements.input.focus();
        }
        // Hides the command palette
        hide() {
            this.isOpen = false;
            this.elements.overlay.style.display = 'none';
            this.activeItemIndex = -1;
        }
        // Filters commands based on user input
        filter() {
            const query = this.elements.input.value.toLowerCase();
            const filteredCommands = this.commands.filter(cmd => cmd.name.toLowerCase().includes(query));
            this.renderResults(filteredCommands);
            this.activeItemIndex = filteredCommands.length > 0 ? 0 : -1; // Reset active item
        }
        // Renders the filtered command results
        renderResults(commands) {
            this.elements.results.innerHTML = '';
            if (commands.length === 0) {
                this.elements.results.innerHTML = '<li class="chameleon-info-text" style="justify-content: center;">No commands found.</li>';
                return;
            }
            commands.forEach((cmd, index) => {
                const li = document.createElement('li');
                li.innerHTML = `${cmd.icon}<span>${cmd.name}</span>`;
                if (index === 0) li.classList.add('active'); // First item active by default
                li.addEventListener('click', () => {
                    cmd.action();
                    this.hide();
                });
                this.elements.results.appendChild(li);
            });
        }
    }

    // Provides a custom context menu for quick element actions
    class ContextMenu {
        constructor(c) {
            this.controller = c;
            this.isOpen = false;
            this.menu = null;
            this.customItems = []; // For plugin-registered items
        }

        // Initializes the context menu listener
        init() {
            document.addEventListener('contextmenu', (e) => {
                // Only show custom context menu if Alt key is pressed
                if (e.altKey) {
                    e.preventDefault();
                    this.show(e);
                    this.controller.agent.trackUserActivity('context_menu_opened', { target: DOMUtils.getSelector(e.target) });
                }
            });
            // Hide menu on any click outside
            document.addEventListener('click', (e) => {
                if (this.menu && !this.menu.contains(e.target)) {
                    this.hide();
                }
            });
            document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.hide(); });
        }

        // Registers a new context menu item from a plugin
        registerItem(item) {
            this.customItems.push(item);
        }

        // Displays the custom context menu at the event's coordinates
        show(e) {
            this.hide(); // Hide any existing menu
            this.isOpen = true;
            const target = e.target;

            this.menu = document.createElement('div');
            this.menu.className = 'chameleon-context-menu';

            // Position the menu
            let posX = e.clientX;
            let posY = e.clientY;
            document.body.appendChild(this.menu); // Append first to get dimensions

            // Calculate menu dimensions (approximate or actual after content is rendered)
            // For now, assume a reasonable size, or render content first and then adjust
            const dummyItem = document.createElement('div');
            dummyItem.className = 'chameleon-context-item';
            dummyItem.innerHTML = '<span>Longest Item Name Possible</span>';
            this.menu.appendChild(dummyItem);
            const menuWidth = dummyItem.offsetWidth + 30; // Estimate width
            const menuHeight = (30 * (3 + this.customItems.length)) + 20; // Estimate height (item height * num items + padding)
            dummyItem.remove(); // Remove dummy

            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            // Adjust position if it goes off screen
            if (posX + menuWidth > viewportWidth) {
                posX = viewportWidth - menuWidth - 10; // 10px padding from right
            }
            if (posY + menuHeight > viewportHeight) {
                posY = viewportHeight - menuHeight - 10; // 10px padding from bottom
            }

            this.menu.style.top = `${posY}px`;
            this.menu.style.left = `${posX}px`;

            const actions = [
                { name: 'Analyze Element', icon: ICONS.analyze, action: () => this.controller.setSelectedElement(target) },
                { name: 'Isolate Component', icon: ICONS.tools, action: () => this.controller.toolkit.appIsolation.isolateElement(target) },
                {
                    name: 'Copy Selector', icon: ICONS.copy, action: () => {
                        GM_setClipboard(DOMUtils.getSelector(target));
                        this.controller.ui.showNotification('Selector copied!');
                    }
                },
                ...this.customItems.map(item => ({ // Add plugin-registered items
                    name: item.name,
                    icon: item.icon,
                    action: () => item.action(target, this.controller) // Pass target element and controller to plugin action
                }))
            ];

            this.menu.innerHTML = actions.map(action => `<div class="chameleon-context-item">${action.icon}<span>${action.name}</span></div>`).join('');

            Array.from(this.menu.children).forEach((item, index) => {
                item.addEventListener('click', (evt) => {
                    evt.stopPropagation(); // Prevent document click from immediately closing it
                    actions[index].action();
                    this.hide();
                });
            });
        }

        // Hides the custom context menu
        hide() {
            if (this.menu) {
                this.menu.remove();
                this.menu = null;
                this.isOpen = false;
            }
        }
    }

    // Provides visual highlighting for elements during inspection mode
    class ElementHighlighter {
        constructor(c) {
            this.controller = c;
            this.overlay = null;
        }
        // Initializes the highlighter by creating its overlay element
        init() { this.create(); }
        create() {
            this.overlay = document.createElement('div');
            this.overlay.id = `${CONFIG.ID_PREFIX}highlighter`;
            this.overlay.style.display = 'none';
            document.body.appendChild(this.overlay);
        }
        // Starts the highlighter, enabling mouse tracking and click detection
        start() {
            this.overlay.style.display = 'block';
            document.addEventListener('mousemove', this.onMouseMove);
            document.addEventListener('click', this.onClick, true); // Use capture phase to ensure it runs before element's own click
        }
        // Stops the highlighter, removing event listeners
        stop() {
            this.overlay.style.display = 'none';
            document.removeEventListener('mousemove', this.onMouseMove);
            document.removeEventListener('click', this.onClick, true);
        }
        // Updates the highlighter's position and size based on the hovered element
        onMouseMove = (e) => {
            const el = e.target;
            // Ignore Chameleon UI elements
            if (!el || el.id.startsWith(CONFIG.ID_PREFIX) || el.closest(`[id^="${CONFIG.ID_PREFIX}"]`)) {
                this.overlay.style.display = 'none';
                return;
            }
            this.overlay.style.display = 'block';
            const rect = el.getBoundingClientRect();
            this.overlay.style.top = `${rect.top + window.scrollY}px`;
            this.overlay.style.left = `${rect.left + window.scrollX}px`;
            this.overlay.style.width = `${rect.width}px`;
            this.overlay.style.height = `${rect.height}px`;
            this.overlay.dataset.info = `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}`;
        }
        // Handles clicks during inspection mode, selecting the element
        onClick = (e) => {
            // Ignore Chameleon UI elements
            if (!e.target || e.target.id.startsWith(CONFIG.ID_PREFIX) || e.target.closest(`[id^="${CONFIG.ID_PREFIX}"]`)) return;
            e.preventDefault(); // Prevent default click action
            e.stopPropagation(); // Stop event propagation
            this.controller.setSelectedElement(e.target);
        }
    }

    // Enables selection, extraction, and remixing of page components
    class AppIsolationEngine {
        constructor(c) {
            this.controller = c;
            this.isSelectionMode = false;
            this.selectedComponents = new Map(); // Map of selector -> element
        }
        // Renders the component isolation controls
        renderControls(container) {
            container.innerHTML = `
                <button id="iso-toggle-select" class="chameleon-button">${ICONS.inspect} Toggle Selection Mode</button>
                <button id="iso-extract" class="chameleon-button secondary" disabled>${ICONS.tools} Extract Selected</button>
                <div id="iso-selection-info" class="chameleon-info-text">0 components selected.</div>
            `;
            this.bindControls();
        }
        // Binds event listeners for isolation controls
        bindControls() {
            document.getElementById('iso-toggle-select').addEventListener('click', () => this.toggleSelectionMode());
            document.getElementById('iso-extract').addEventListener('click', () => this.extractComponents());
        }
        // Toggles the component selection mode
        toggleSelectionMode() {
            this.isSelectionMode ? this.exitSelectionMode() : this.enterSelectionMode();
            this.controller.agent.trackUserActivity('isolation_mode_toggle', { state: this.isSelectionMode ? 'enabled' : 'disabled' });
        }
        // Enters component selection mode
        enterSelectionMode() {
            if (this.isSelectionMode) return;
            this.isSelectionMode = true;
            document.getElementById('iso-toggle-select').classList.add('active');
            document.body.classList.add('chameleon-selection-active'); // Changes cursor
            this.controller.ui.showNotification('Selection Mode Active. Click elements to select/deselect. Press ESC to exit.', 5000);
            document.addEventListener('mouseover', this.onMouseOver);
            document.addEventListener('mouseout', this.onMouseOut);
            document.addEventListener('click', this.onElementClick, true); // Capture phase to intercept clicks
        }
        // Exits component selection mode
        exitSelectionMode() {
            if (!this.isSelectionMode) return;
            this.isSelectionMode = false;
            document.getElementById('iso-toggle-select').classList.remove('active');
            document.body.classList.remove('chameleon-selection-active');
            // Remove all highlight/selected classes
            document.querySelectorAll('.chameleon-iso-highlight').forEach(el => el.classList.remove('chameleon-iso-highlight'));
            document.querySelectorAll('.chameleon-iso-selected').forEach(el => el.classList.remove('chameleon-iso-selected'));
            document.removeEventListener('mouseover', this.onMouseOver);
            document.removeEventListener('mouseout', this.onMouseOut);
            document.removeEventListener('click', this.onElementClick, true);
            this.selectedComponents.clear(); // Clear selection
            this.updateSelectionInfo();
            this.controller.ui.showNotification('Selection Mode Disabled.', 2000);
        }
        // Highlights elements on mouse over during selection mode
        onMouseOver = (e) => {
            if (!this.isSelectionMode || e.target.closest(`[id^="${CONFIG.ID_PREFIX}"]`)) return;
            if (!e.target.classList.contains('chameleon-iso-selected')) { // Don't highlight if already selected
                e.target.classList.add('chameleon-iso-highlight');
            }
        }
        // Removes highlight on mouse out
        onMouseOut = (e) => {
            if (!this.isSelectionMode || e.target.closest(`[id^="${CONFIG.ID_PREFIX}"]`)) return;
            e.target.classList.remove('chameleon-iso-highlight');
        }
        // Handles clicks during selection mode to add/remove elements from selection
        onElementClick = (e) => {
            if (!this.isSelectionMode || e.target.closest(`[id^="${CONFIG.ID_PREFIX}"]`)) return;
            e.preventDefault();
            e.stopPropagation(); // Prevent click from propagating further

            const el = e.target;
            const selector = DOMUtils.getSelector(el);

            if (this.selectedComponents.has(selector)) {
                el.classList.remove('chameleon-iso-selected');
                this.selectedComponents.delete(selector);
            } else {
                el.classList.add('chameleon-iso-selected');
                this.selectedComponents.set(selector, el);
            }
            this.updateSelectionInfo();
            this.controller.agent.trackUserActivity('component_selected', { selector: selector, action: this.selectedComponents.has(selector) ? 'added' : 'removed' });
        }
        // Updates the display of selected component count
        updateSelectionInfo() {
            const count = this.selectedComponents.size;
            document.getElementById('iso-selection-info').textContent = `${count} component${count !== 1 ? 's' : ''} selected.`;
            document.getElementById('iso-extract').disabled = count === 0;
        }
        // Adds a specific element to the isolation selection, typically from context menu
        isolateElement(element) {
            this.controller.ui.switchTab('tools');
            if (!this.isSelectionMode) this.enterSelectionMode();
            const selector = DOMUtils.getSelector(element);
            if (!this.selectedComponents.has(selector)) {
                element.classList.add('chameleon-iso-selected');
                this.selectedComponents.set(selector, element);
                this.updateSelectionInfo();
                this.controller.ui.showNotification('Element added to isolation selection.', 2000, { type: 'info' });
            } else {
                this.controller.ui.showNotification('Element already selected for isolation.', 2000, { type: 'info' });
            }
            this.controller.agent.trackUserActivity('isolate_element_from_context', { selector: selector });
        }
        // Extracts the HTML of selected components to clipboard
        extractComponents() {
            if (this.selectedComponents.size === 0) {
                this.controller.ui.showNotification('No components selected to extract.', 2000, { type: 'warning' });
                return;
            }
            const html = Array.from(this.selectedComponents.values()).map(el => {
                const selector = DOMUtils.getSelector(el);
                return `<!-- Component: ${selector} -->\n${el.outerHTML}`;
            }).join('\n\n');
            GM_setClipboard(html);
            this.controller.ui.showNotification(`Extracted ${this.selectedComponents.size} component(s) to clipboard.`);
            this.exitSelectionMode(); // Exit selection mode after extraction
            this.controller.agent.trackUserActivity('components_extracted', { count: this.selectedComponents.size });
        }

        /**
         * Simulates remixing an existing component based on a prompt and re-injects it.
         * @param {Element} originalElement The element to remix.
         * @param {string} newContentPrompt The prompt for the new content/structure.
         */
        async remixComponent(originalElement, newContentPrompt) {
            this.controller.ui.updateStatus('Remixing component...', 'info');
            this.controller.agent.trackUserActivity('remix_component', { selector: DOMUtils.getSelector(originalElement), prompt: newContentPrompt });

            // Simulate LLM generation for new content
            await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));

            let newHtml = '';
            // Very basic simulation: replace content based on prompt
            if (newContentPrompt.includes('title')) {
                const titleMatch = newContentPrompt.match(/title "(.+?)"/);
                const newTitle = titleMatch ? titleMatch[1] : 'Remixed Title';
                newHtml = originalElement.outerHTML.replace(/<h[1-6].*?>.*?<\/h[1-6]>/i, `<h2 style="color: var(--chameleon-primary);">${newTitle}</h2>`);
            } else {
                newHtml = `<div class="${CONFIG.ID_PREFIX}remixed-content chameleon-card" style="padding: 20px; border: 2px dashed var(--chameleon-accent); margin: 10px 0;">
                    <h4>Remixed Component (AI Generated)</h4>
                    <p>This component was remixed based on your prompt: "${newContentPrompt}".</p>
                    <button class="chameleon-button secondary">New Action</button>
                </div>`;
            }

            const tempContainer = document.createElement('div');
            tempContainer.innerHTML = newHtml;
            const remixedElement = tempContainer.firstElementChild;

            if (remixedElement) {
                originalElement.replaceWith(remixedElement); // Replace the original element
                DOMUtils.createRemovableOverlay(remixedElement, () => remixedElement.remove());
                this.controller.ui.addRemovableOverlay(remixedElement.querySelector(`.${CONFIG.ID_PREFIX}removable-overlay`), remixedElement);
                this.controller.ui.showNotification('Component remixed and injected!', 3000, { type: 'success' });
            } else {
                this.controller.ui.showNotification('Failed to remix component.', 3000, { type: 'danger' });
            }
            this.controller.ui.updateStatus('Component remixing complete.', 'info');
        }
    }

    // Records user interactions and generates automation scripts
    class SessionRecorder {
        constructor(c) {
            this.controller = c;
            this.isRecording = false;
            this.recordedEvents = [];
            this.lastTimestamp = 0;
        }

        // Renders the session recorder controls
        renderControls(container) {
            container.innerHTML = `
                <button id="recorder-toggle" class="chameleon-button">${ICONS.record} Start Recording</button>
                <button id="recorder-play" class="chameleon-button secondary" disabled>${ICONS.play} Playback</button>
                <button id="recorder-copy" class="chameleon-button secondary" disabled>${ICONS.copy} Copy Script</button>
                <div id="recorder-info" class="chameleon-info-text">Ready to record.</div>
            `;
            this.bindControls();
        }

        // Binds event listeners for recorder controls
        bindControls() {
            document.getElementById('recorder-toggle').addEventListener('click', () => this.toggleRecording());
            document.getElementById('recorder-play').addEventListener('click', () => this.playback());
            document.getElementById('recorder-copy').addEventListener('click', () => this.copyScript());
        }

        // Toggles recording state (start/stop)
        toggleRecording() {
            this.isRecording = !this.isRecording;
            const toggleBtn = document.getElementById('recorder-toggle');
            const playBtn = document.getElementById('recorder-play');
            const copyBtn = document.getElementById('recorder-copy');

            if (this.isRecording) {
                this.recordedEvents = [];
                this.lastTimestamp = Date.now();
                this.updateInfo('Recording...');
                toggleBtn.innerHTML = `${ICONS.stop} Stop Recording`;
                toggleBtn.classList.add('active');
                playBtn.disabled = true;
                copyBtn.disabled = true;
                this.startListeners();
                this.controller.agent.trackUserActivity('recording_started');
            } else {
                this.updateInfo(`${this.recordedEvents.length} events recorded.`);
                toggleBtn.innerHTML = `${ICONS.record} Start Recording`;
                toggleBtn.classList.remove('active');
                this.stopListeners();
                playBtn.disabled = this.recordedEvents.length === 0;
                copyBtn.disabled = this.recordedEvents.length === 0;
                this.controller.ui.showNotification(`Recording stopped. ${this.recordedEvents.length} events captured.`, 3000);
                this.controller.agent.trackUserActivity('recording_stopped', { eventCount: this.recordedEvents.length });
            }
        }

        // Updates the recorder's status information
        updateInfo(text) {
            document.getElementById('recorder-info').textContent = text;
        }

        // Starts listening for user interaction events
        startListeners() {
            // Use capture phase to ensure events are caught before they are handled by page scripts
            document.addEventListener('click', this.recordEvent, true);
            document.addEventListener('input', this.recordEvent, true);
            document.addEventListener('change', this.recordEvent, true); // For select/checkboxes
            document.addEventListener('submit', this.recordEvent, true); // For form submissions
            document.addEventListener('keydown', this.recordEvent, true); // For key presses
            document.addEventListener('keyup', this.recordEvent, true); // For key releases
        }

        // Stops listening for user interaction events
        stopListeners() {
            document.removeEventListener('click', this.recordEvent, true);
            document.removeEventListener('input', this.recordEvent, true);
            document.removeEventListener('change', this.recordEvent, true);
            document.removeEventListener('submit', this.recordEvent, true);
            document.removeEventListener('keydown', this.recordEvent, true);
            document.removeEventListener('keyup', this.recordEvent, true);
        }

        // Records a user interaction event
        recordEvent = (e) => {
            if (!this.isRecording || e.target.closest(`[id^="${CONFIG.ID_PREFIX}"]`)) return; // Ignore Chameleon UI events

            const currentTimestamp = Date.now();
            const delay = currentTimestamp - this.lastTimestamp;
            this.lastTimestamp = currentTimestamp;

            const eventData = {
                type: e.type,
                selector: DOMUtils.getSelector(e.target),
                delay: delay, // Time since last event
                timestamp: currentTimestamp, // Absolute timestamp
            };

            if (e.type === 'input') {
                eventData.value = e.target.value;
            } else if (e.type === 'change' && (e.target.tagName === 'SELECT' || e.target.type === 'checkbox' || e.target.type === 'radio')) {
                eventData.value = e.target.value;
                if (e.target.type === 'checkbox' || e.target.type === 'radio') {
                    eventData.checked = e.target.checked;
                }
            } else if (e.type === 'submit') {
                // For submit, we might want to capture form data, but for basic playback, just the submit action is enough
                eventData.formData = Array.from(new FormData(e.target).entries());
            } else if (e.type === 'keydown' || e.type === 'keyup') {
                eventData.key = e.key;
                eventData.code = e.code;
                eventData.ctrlKey = e.ctrlKey;
                eventData.shiftKey = e.shiftKey;
                eventData.altKey = e.altKey;
                eventData.metaKey = e.metaKey;
            }

            this.recordedEvents.push(eventData);
            this.updateInfo(`${this.recordedEvents.length} events recorded...`);
        }

        // Plays back the recorded user interactions
        async playback() {
            if (this.recordedEvents.length === 0) {
                this.controller.ui.showNotification('No events recorded for playback.', 2000, { type: 'warning' });
                return;
            }

            this.controller.ui.showNotification('Starting playback...', 0, { type: 'info' });
            const playBtn = document.getElementById('recorder-play');
            const copyBtn = document.getElementById('recorder-copy');
            playBtn.disabled = true;
            copyBtn.disabled = true;

            for (let i = 0; i < this.recordedEvents.length; i++) {
                const event = this.recordedEvents[i];
                this.updateInfo(`Playing event ${i + 1}/${this.recordedEvents.length}...`);

                // Wait for the recorded delay to simulate realistic timing
                await new Promise(resolve => setTimeout(resolve, event.delay));

                const el = document.querySelector(event.selector);
                if (!el) {
                    this.controller.error(`Playback failed: Element not found for selector "${event.selector}"`);
                    this.controller.ui.showNotification('Playback stopped: element not found.', 5000, { type: 'danger' });
                    playBtn.disabled = false;
                    copyBtn.disabled = false;
                    return;
                }

                // Scroll into view and briefly highlight the element being interacted with
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('chameleon-playback-highlight');

                if (event.type === 'click') {
                    el.click();
                } else if (event.type === 'input') {
                    el.value = event.value;
                    el.dispatchEvent(new Event('input', { bubbles: true })); // Dispatch event to trigger page's own listeners
                } else if (event.type === 'change') {
                    el.value = event.value;
                    if (event.checked !== undefined) {
                        el.checked = event.checked;
                    }
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                } else if (event.type === 'submit') {
                    // For forms, we can either submit directly or simulate button click
                    if (el.tagName === 'FORM') {
                        el.submit(); // This will reload the page, so be careful
                    } else {
                        // If the target is a submit button, click it
                        el.click();
                    }
                } else if (event.type === 'keydown' || event.type === 'keyup') {
                    const keyboardEvent = new KeyboardEvent(event.type, {
                        key: event.key,
                        code: event.code,
                        ctrlKey: event.ctrlKey,
                        shiftKey: event.shiftKey,
                        altKey: event.altKey,
                        metaKey: event.metaKey,
                        bubbles: true,
                        cancelable: true,
                    });
                    el.dispatchEvent(keyboardEvent);
                }

                await new Promise(resolve => setTimeout(() => {
                    el.classList.remove('chameleon-playback-highlight');
                    resolve();
                }, 300)); // Keep highlight for a short duration
            }
            this.controller.ui.showNotification('Playback finished.', 3000, { type: 'success' });
            playBtn.disabled = false;
            copyBtn.disabled = false;
            this.updateInfo(`${this.recordedEvents.length} events recorded.`);
            this.controller.agent.trackUserActivity('recording_playback_finished');
        }

        // Generates a Puppeteer script from the recorded events
        copyScript() {
            if (this.recordedEvents.length === 0) {
                this.controller.ui.showNotification('No events to generate script from.', 2000, { type: 'warning' });
                return;
            }

            let script = `// Puppeteer script generated by Chameleon AI-Forge\n`;
            script += `const puppeteer = require('puppeteer');\n\n`;
            script += `(async () => {\n`;
            script += `  const browser = await puppeteer.launch({ headless: false }); // Set headless: true for no browser UI\n`;
            script += `  const page = await browser.newPage();\n`;
            script += `  await page.goto('${window.location.href}');\n\n`;

            this.recordedEvents.forEach(event => {
                const escapedSelector = event.selector.replace(/'/g, "\\'");
                script += `  // Event: ${event.type} on ${event.selector}\n`;
                script += `  await page.waitForSelector('${escapedSelector}', { timeout: 5000 });\n`;
                script += `  await page.waitForTimeout(${event.delay}); // Wait for recorded delay\n`;

                if (event.type === 'click') {
                    script += `  await page.click('${escapedSelector}');\n\n`;
                } else if (event.type === 'input' || event.type === 'change') {
                    if (event.checked !== undefined) { // Checkbox/radio
                        script += `  const element = await page.$('${escapedSelector}');\n`;
                        script += `  if (element) {\n`;
                        script += `    const isChecked = await element.evaluate(el => el.checked);\n`;
                        script += `    if (isChecked !== ${event.checked}) {\n`;
                        script += `      await element.click(); // Toggle if needed\n`;
                        script += `    }\n`;
                        script += `  }\n\n`;
                    } else { // Text input or select
                        // For text input, use type for new input, or evaluate for existing content
                        script += `  await page.$eval('${escapedSelector}', (el, value) => el.value = value, '${event.value.replace(/'/g, "\\'")}');\n\n`;
                    }
                } else if (event.type === 'submit') {
                    script += `  await page.$eval('${escapedSelector}', form => form.submit());\n\n`;
                } else if (event.type === 'keydown' || event.type === 'keyup') {
                    const modifiers = [];
                    if (event.ctrlKey) modifiers.push('Control');
                    if (event.shiftKey) modifiers.push('Shift');
                    if (event.altKey) modifiers.push('Alt');
                    if (event.metaKey) modifiers.push('Meta');
                    const modifiersStr = modifiers.length > 0 ? `, { modifiers: [${modifiers.map(m => `'${m}'`).join(', ')}] }` : '';
                    script += `  await page.${event.type === 'keydown' ? 'keyboard.down' : 'keyboard.up'}('${event.key}'${modifiersStr});\n\n`;
                }
            });

            script += `  // Optional: Wait before closing to see final state\n`;
            script += `  // await page.waitForTimeout(3000);\n`;
            script += `  await browser.close();\n`;
            script += `})();\n`;

            GM_setClipboard(script);
            this.controller.ui.showNotification('Puppeteer script copied to clipboard!');
            this.controller.agent.trackUserActivity('recorded_script_copied');
        }
    }

    // YOOtheme Builder automation and helper agent
    class YooThemeBuilderAgent {
        constructor(c) {
            this.controller = c;
            this.helperStyleId = `${CONFIG.ID_PREFIX}yoo-helper-style`;
            this.debugClass = `${CONFIG.ID_PREFIX}yoo-debug`;
            this.spacingClassPrefix = `${CONFIG.ID_PREFIX}yoo-spacing-`;
            this.lastRenderContainer = null;
        }

        register() {
            this.ensureHelperStyles();
            this.controller.registerTool({
                id: 'yootheme',
                name: 'YOOtheme Builder',
                icon: ICONS.yootheme,
                renderFn: (container) => this.render(container),
                commands: [
                    { name: 'YOOtheme: Toggle debug outlines', icon: ICONS.inspect, action: () => this.toggleDebugHelpers() },
                    { name: 'YOOtheme: Apply tight spacing preset', icon: ICONS.style, action: () => this.applySpacingPreset('tight') },
                    { name: 'YOOtheme: Apply roomy spacing preset', icon: ICONS.style, action: () => this.applySpacingPreset('roomy') },
                    { name: 'YOOtheme: Clear helper styles', icon: ICONS.minimize, action: () => this.resetHelpers() },
                    { name: 'YOOtheme: Rescan layout inventory', icon: ICONS.analyze, action: () => this.reportInventory() },
                ],
            });
        }

        ensureHelperStyles() {
            if (document.getElementById(this.helperStyleId)) return;
            const style = document.createElement('style');
            style.id = this.helperStyleId;
            style.textContent = `
                body.${this.debugClass} .uk-section, body.${this.debugClass} [class*="uk-section"] {
                    outline: 1px dashed rgba(88,166,255,0.55);
                    background-image: repeating-linear-gradient(90deg, rgba(88,166,255,0.05) 0, rgba(88,166,255,0.05) 10px, transparent 10px, transparent 20px);
                }
                body.${this.debugClass} .uk-grid, body.${this.debugClass} [class*="uk-grid"] {
                    outline: 1px dashed rgba(255,255,255,0.35);
                }
                body.${this.debugClass} .uk-card {
                    outline: 1px solid rgba(63,185,80,0.55);
                    box-shadow: 0 0 0 2px rgba(63,185,80,0.2);
                }
                body.${this.spacingClassPrefix}tight .uk-section {
                    padding-top: 24px !important;
                    padding-bottom: 24px !important;
                }
                body.${this.spacingClassPrefix}tight .uk-container { max-width: 1180px; }
                body.${this.spacingClassPrefix}roomy .uk-section {
                    padding-top: 72px !important;
                    padding-bottom: 72px !important;
                }
                body.${this.spacingClassPrefix}roomy .uk-container { max-width: 1320px; }
            `;
            document.head.appendChild(style);
        }

        detectContext() {
            const markers = [];
            const selectors = [
                '.yootheme-builder',
                '[data-yootheme-builder]',
                '[data-yoo-builder]',
                'body[class*="yootheme"]',
                '.yo-builder',
                'link[href*="yootheme"]'
            ];
            selectors.forEach(sel => {
                if (document.querySelector(sel)) {
                    markers.push(sel);
                }
            });

            ['.uk-section', '.uk-grid', '.uk-container', '.uk-card'].forEach(sel => {
                if (document.querySelector(sel)) {
                    markers.push(`${sel} (UIkit)`);
                }
            });

            const uniqueMarkers = Array.from(new Set(markers));
            const urlHint = /yoo(theme)?/i.test(window.location.href) || /yootheme/i.test(document.title);
            return {
                isLikely: uniqueMarkers.length >= 2 || urlHint,
                markers: uniqueMarkers
            };
        }

        buildInventory() {
            const count = (selector) => document.querySelectorAll(selector).length;
            return {
                builderShells: count('[data-yootheme-builder], [data-yoo-builder], .yootheme-builder'),
                sections: count('.uk-section, [class*="uk-section"]'),
                grids: count('.uk-grid, [class*="uk-grid"]'),
                containers: count('.uk-container'),
                cards: count('.uk-card'),
            };
        }

        toggleDebugHelpers() {
            this.ensureHelperStyles();
            const body = document.body;
            body.classList.toggle(this.debugClass);
            const active = body.classList.contains(this.debugClass);
            this.controller.ui.showNotification(active ? 'YOOtheme debug overlays enabled.' : 'YOOtheme debug overlays disabled.', 2500, { type: active ? 'success' : 'info' });
            this.controller.agent.trackUserActivity('yootheme_debug_toggle', { active });
            this.refreshPanel();
        }

        applySpacingPreset(mode) {
            this.ensureHelperStyles();
            const body = document.body;
            ['tight', 'roomy'].forEach(m => body.classList.remove(`${this.spacingClassPrefix}${m}`));
            if (mode) {
                body.classList.add(`${this.spacingClassPrefix}${mode}`);
                this.controller.ui.showNotification(`Applied ${mode} spacing helper for YOOtheme layouts.`, 2500, { type: 'success' });
            } else {
                this.controller.ui.showNotification('Cleared spacing helpers.', 2000, { type: 'info' });
            }
            this.controller.agent.trackUserActivity('yootheme_spacing_applied', { mode: mode || 'cleared' });
            this.refreshPanel();
        }

        resetHelpers() {
            const body = document.body;
            body.classList.remove(this.debugClass);
            ['tight', 'roomy'].forEach(m => body.classList.remove(`${this.spacingClassPrefix}${m}`));
            this.controller.ui.showNotification('YOOtheme helper styles cleared.', 2000, { type: 'info' });
            this.controller.agent.trackUserActivity('yootheme_helpers_reset');
            this.refreshPanel();
        }

        reportInventory() {
            const inventory = this.buildInventory();
            this.controller.log('YOOtheme inventory', inventory);
            this.controller.ui.showNotification('YOOtheme inventory logged to console.', 2500, { type: 'info' });
            this.refreshPanel();
        }

        render(container) {
            if (!container) return;
            this.lastRenderContainer = container;
            const context = this.detectContext();
            const inventory = this.buildInventory();
            const debugActive = document.body.classList.contains(this.debugClass);
            const spacingActive = document.body.className.split(' ').find(cls => cls.startsWith(this.spacingClassPrefix)) || '';
            const spacingLabel = spacingActive.replace(this.spacingClassPrefix, '') || 'none';

            container.innerHTML = `
                <div class="chameleon-card">
                    <div class="chameleon-card-header">
                        <div>
                            <div class="chameleon-title">YOOtheme Builder Agent</div>
                            <div class="chameleon-info-text">UIkit-aware automation helpers for the builder canvas.</div>
                        </div>
                        <span class="chameleon-badge ${context.isLikely ? 'success' : 'warning'}">${context.isLikely ? 'Detected' : 'Not detected'}</span>
                    </div>
                    <div class="chameleon-form-group">
                        <label>Context signals</label>
                        <div id="${CONFIG.ID_PREFIX}yoo-markers" class="chameleon-info-text">${context.markers.length ? context.markers.map(m => `<span class="chameleon-badge">${m}</span>`).join(' ') : 'No obvious YOOtheme markers detected yet.'}</div>
                    </div>
                    <div class="chameleon-form-group">
                        <label>Quick automations</label>
                        <div class="chameleon-button-row">
                            <button id="${CONFIG.ID_PREFIX}yoo-toggle-debug" class="chameleon-button secondary">${ICONS.inspect} ${debugActive ? 'Disable overlays' : 'Enable overlays'}</button>
                            <button id="${CONFIG.ID_PREFIX}yoo-spacing-tight" class="chameleon-button secondary">${ICONS.style} Tight spacing</button>
                            <button id="${CONFIG.ID_PREFIX}yoo-spacing-roomy" class="chameleon-button secondary">${ICONS.style} Roomy spacing</button>
                            <button id="${CONFIG.ID_PREFIX}yoo-reset" class="chameleon-button secondary">${ICONS.minimize} Reset</button>
                        </div>
                        <div class="chameleon-info-text">Current spacing helper: <span class="chameleon-badge">${spacingLabel}</span></div>
                    </div>
                    <div class="chameleon-form-group">
                        <label>Layout inventory</label>
                        <ul class="chameleon-list">
                            <li>Builder shells: <span class="chameleon-badge">${inventory.builderShells}</span></li>
                            <li>Sections: <span class="chameleon-badge">${inventory.sections}</span></li>
                            <li>Grids: <span class="chameleon-badge">${inventory.grids}</span></li>
                            <li>Containers: <span class="chameleon-badge">${inventory.containers}</span></li>
                            <li>Cards: <span class="chameleon-badge">${inventory.cards}</span></li>
                        </ul>
                        <button id="${CONFIG.ID_PREFIX}yoo-rescan" class="chameleon-button secondary">${ICONS.analyze} Rescan</button>
                    </div>
                </div>
            `;

            const bind = (id, handler) => {
                const el = document.getElementById(id);
                if (el) el.addEventListener('click', handler);
            };

            bind(`${CONFIG.ID_PREFIX}yoo-toggle-debug`, () => this.toggleDebugHelpers());
            bind(`${CONFIG.ID_PREFIX}yoo-spacing-tight`, () => this.applySpacingPreset('tight'));
            bind(`${CONFIG.ID_PREFIX}yoo-spacing-roomy`, () => this.applySpacingPreset('roomy'));
            bind(`${CONFIG.ID_PREFIX}yoo-reset`, () => this.resetHelpers());
            bind(`${CONFIG.ID_PREFIX}yoo-rescan`, () => this.refreshPanel());
        }

        refreshPanel() {
            if (this.lastRenderContainer) {
                this.render(this.lastRenderContainer);
            }
        }
    }

    // --- FINAL STYLESHEET (includes styles for all modules) ---
    // Injects all necessary CSS for the UI components and dynamic styling
    function addGlobalStyles() {
        GM_addStyle(`
            /* --- Core Variables & Fonts --- */
            :root {
                /* Default/Fallback values, overridden by Neural Themes */
                --chameleon-bg: #0d1117;
                --chameleon-text: #e6edf3;
                --chameleon-primary: #58a6ff;
                --chameleon-accent: #1f6feb;
                --chameleon-card: #161b22;
                --chameleon-border: #30363d;

                /* Derived values for glassmorphism */
                --chameleon-accent-glow: rgba(88, 166, 255, 0.5);
                --bg-panel: rgba(22, 27, 34, 0.8);
                --bg-glass: rgba(30, 36, 44, 0.7);
                --border-color: rgba(139, 148, 158, 0.3);
                --header-bg: rgba(13, 17, 23, 0.6);

                /* Status colors */
                --success: #3fb950;
                --danger: #f85149;
                --warning: #e3b341;
                --text-secondary: #8b949e; /* Added for better contrast in some areas */
            }

            /* --- Animations --- */
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes slideInUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            @keyframes panelEnter { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
            @keyframes panelExit { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.95); } }
            @keyframes spin { 100% { transform: rotate(360deg); } }

            /* --- Base Styles for Chameleon UI --- */
            #chameleon-genesis__widget, #chameleon-genesis__panel, .chameleon-modal-overlay, .chameleon-palette-overlay, .chameleon-context-menu, #chameleon-genesis__notification-container {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol';
                box-sizing: border-box;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
            }
            #chameleon-genesis__panel *, #chameleon-genesis__widget *, .chameleon-modal-overlay *, .chameleon-palette-overlay *, .chameleon-context-menu *, #chameleon-genesis__notification-container * {
                box-sizing: inherit;
            }

            /* --- Smart Widget --- */
            #${CONFIG.ID_PREFIX}widget {
                position: fixed; z-index: 9999998; width: 48px; height: 48px;
                background: linear-gradient(135deg, var(--chameleon-accent), var(--chameleon-primary)); color: white;
                border-radius: 50%; box-shadow: 0 5px 20px rgba(0,0,0,0.25), 0 0 0 2px rgba(255,255,255,0.1);
                display: flex; align-items: center; justify-content: center;
                cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); transform: scale(1);
            }
            #${CONFIG.ID_PREFIX}widget:hover { transform: scale(1.1); box-shadow: 0 8px 25px var(--chameleon-accent-glow), 0 0 0 3px rgba(255,255,255,0.2); }
            #${CONFIG.ID_PREFIX}widget.hidden { transform: scale(0); opacity: 0; }
            #${CONFIG.ID_PREFIX}widget svg { width: 28px; height: 28px; }
            .${CONFIG.ID_PREFIX}widget-badge {
                position: absolute; top: -2px; right: -2px;
                background-color: var(--danger); color: white;
                border-radius: 50%; width: 18px; height: 18px;
                font-size: 11px; font-weight: bold; text-align: center; line-height: 18px;
                border: 2px solid var(--chameleon-accent);
                transform: scale(0); opacity: 0; transition: all 0.3s ease;
            }
            .${CONFIG.ID_PREFIX}widget-badge.visible { transform: scale(1); opacity: 1; }

            /* --- Command Center Panel --- */
            .chameleon-panel {
                position: fixed; display: flex; flex-direction: column; z-index: 9999999;
                border-radius: 12px; color: var(--chameleon-text);
                box-shadow: 0 10px 50px rgba(0,0,0,0.4);
                overflow: hidden;
                animation: panelEnter 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                min-width: 400px; min-height: 300px;
            }
            .chameleon-panel.minimized { animation: panelExit 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards; }
            .${CONFIG.ID_PREFIX}panel-bg {
                position: absolute; top: 0; left: 0; right: 0; bottom: 0;
                background: var(--bg-panel);
                backdrop-filter: blur(16px) saturate(180%);
                border: 1px solid var(--border-color);
                border-radius: 12px;
            }

            /* --- Panel Layout --- */
            .${CONFIG.ID_PREFIX}header, .${CONFIG.ID_PREFIX}body, .${CONFIG.ID_PREFIX}footer { position: relative; z-index: 1; }
            .${CONFIG.ID_PREFIX}header { display: flex; justify-content: space-between; align-items: center; padding: 0 12px; height: 48px; border-bottom: 1px solid var(--border-color); flex-shrink: 0; cursor: grab; background: var(--header-bg); }
            .${CONFIG.ID_PREFIX}header:active { cursor: grabbing; }
            .${CONFIG.ID_PREFIX}header-left, .${CONFIG.ID_PREFIX}header-right { display: flex; align-items: center; gap: 8px; }
            .${CONFIG.ID_PREFIX}logo svg { width: 24px; height: 24px; color: var(--chameleon-accent); }
            .${CONFIG.ID_PREFIX}title { font-weight: 600; }
            .${CONFIG.ID_PREFIX}body { display: flex; flex-grow: 1; overflow: hidden; }
            .${CONFIG.ID_PREFIX}sidebar { display: flex; flex-direction: column; padding: 8px; border-right: 1px solid var(--border-color); flex-shrink: 0; }
            .${CONFIG.ID_PREFIX}plugin-tabs-container { margin-top: auto; padding-top: 8px; border-top: 1px solid var(--chameleon-border); } /* For plugin tabs */
            .${CONFIG.ID_PREFIX}content-wrapper { flex-grow: 1; display: flex; flex-direction: column; }
            .${CONFIG.ID_PREFIX}content { flex-grow: 1; overflow-y: auto; padding: 16px; }
            /* Custom scrollbar for content */
            .${CONFIG.ID_PREFIX}content::-webkit-scrollbar { width: 8px; }
            .${CONFIG.ID_PREFIX}content::-webkit-scrollbar-track { background: var(--chameleon-card); border-radius: 10px; }
            .${CONFIG.ID_PREFIX}content::-webkit-scrollbar-thumb { background: var(--chameleon-border); border-radius: 10px; }
            .${CONFIG.ID_PREFIX}content::-webkit-scrollbar-thumb:hover { background: var(--chameleon-accent); }

            .chameleon-tab-content { display: none; height: 100%; font-size: 14px; animation: fadeIn 0.4s ease; box-sizing: border-box; flex-direction: column; }
            .chameleon-tab-content.active { display: flex; }
            .${CONFIG.ID_PREFIX}footer { display: flex; align-items: center; justify-content: space-between; height: 32px; padding: 0 12px; border-top: 1px solid var(--border-color); flex-shrink: 0; font-size: 12px; color: var(--text-secondary); }
            .${CONFIG.ID_PREFIX}resize-handle { position: absolute; right: 0; bottom: 0; width: 16px; height: 16px; cursor: se-resize; }

            /* --- Common UI Components --- */
            .chameleon-btn-icon { background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px; border-radius: 6px; transition: all 0.2s ease; }
            .chameleon-btn-icon:hover { color: var(--chameleon-text); background: rgba(255,255,255,0.1); }
            .chameleon-btn-icon.active, #iso-toggle-select.active, #recorder-toggle.active { color: var(--chameleon-accent); background: rgba(88, 166, 255, 0.15); box-shadow: 0 0 8px var(--chameleon-accent-glow); }
            .chameleon-icon { width: 20px; height: 20px; pointer-events: none; } /* Ensure icons don't interfere with click events */
            .chameleon-tab { background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 10px; border-radius: 6px; transition: all 0.2s ease; }
            .chameleon-tab:hover { color: var(--chameleon-text); background: rgba(255,255,255,0.1); }
            .chameleon-tab.active { color: var(--chameleon-accent); background: rgba(88, 166, 255, 0.15); }
            .chameleon-tab svg { width: 24px; height: 24px; pointer-events: none; }
            .chameleon-form-group { margin-bottom: 16px; }
            .chameleon-form-group label { display: block; font-weight: 500; margin-bottom: 6px; font-size: 12px; color: var(--text-secondary); text-transform: uppercase; }
            .chameleon-input, .chameleon-select, .chameleon-textarea {
                width: 100%; background: var(--chameleon-bg); color: var(--chameleon-text); border: 1px solid var(--chameleon-border);
                border-radius: 6px; padding: 8px 12px; font-size: 14px; box-sizing: border-box; transition: border-color 0.2s, box-shadow 0.2s;
            }
            .chameleon-input:focus, .chameleon-select:focus, .chameleon-textarea:focus { border-color: var(--chameleon-accent); box-shadow: 0 0 0 3px var(--chameleon-accent-glow); outline: none; }
            .chameleon-textarea { resize: vertical; min-height: 80px; }
            .chameleon-button {
                background: var(--chameleon-accent); color: #fff; border: none; border-radius: 6px; padding: 10px 16px;
                cursor: pointer; font-weight: 600; transition: all 0.2s ease; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
            }
            .chameleon-button:hover { filter: brightness(1.1); }
            .chameleon-button.secondary { background: var(--chameleon-border); color: var(--chameleon-text); }
            .chameleon-button.secondary:hover { background: var(--text-secondary); }
            .chameleon-button:disabled { background: var(--chameleon-border); color: var(--text-secondary); cursor: not-allowed; opacity: 0.6; }
            .chameleon-spinner { animation: spin 1.5s linear infinite; width: 1em; height: 1em; }
            .chameleon-spinner .path { stroke: currentColor; stroke-linecap: round; animation: dash 1.5s ease-in-out infinite; }
            @keyframes dash { 0% { stroke-dasharray: 1, 150; stroke-dashoffset: 0; } 50% { stroke-dasharray: 90, 150; stroke-dashoffset: -35; } 100% { stroke-dasharray: 90, 150; stroke-dashoffset: -124; } }
            .chameleon-spinner-wrapper { display: flex; align-items: center; gap: 8px; }

            .chameleon-card { background: var(--bg-glass); border: 1px solid var(--border-color); padding: 16px; border-radius: 8px; margin-bottom: 16px; }
            .chameleon-card h3, .chameleon-card h4 { margin-top: 0; color: var(--chameleon-accent); display: flex; align-items: center; gap: 8px; }
            .chameleon-result-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px dashed var(--chameleon-border); }
            .chameleon-result-item:last-child { border-bottom: none; }
            .chameleon-result-item span:first-child { text-transform: capitalize; }
            .chameleon-badge { background: var(--chameleon-accent); color: white; padding: 2px 8px; border-radius: 10px; font-size: 12px; font-weight: bold; }
            .chameleon-badge.danger { background: var(--danger); }
            .chameleon-badge.warning { background: var(--warning); color: #111; }
            .chameleon-badge.success { background: var(--success); }
            .chameleon-placeholder, .chameleon-info-text { color: var(--text-secondary); text-align: center; padding: 10px; font-style: italic; font-size: 13px; }
            .chameleon-code-block { max-height: 200px; overflow-y: auto; background: var(--chameleon-bg); padding: 8px; border-radius: 6px; font-family: monospace; white-space: pre-wrap; border: 1px solid var(--chameleon-border); }

            /* --- Status Bar --- */
            .chameleon-status { transition: color 0.3s; }
            .chameleon-status.status-info { color: var(--chameleon-accent); }
            .chameleon-status.status-success { color: var(--success); }
            .chameleon-status.status-danger { color: var(--danger); }
            .chameleon-status.status-warning { color: var(--warning); }

            /* --- Notification System --- */
            #${CONFIG.ID_PREFIX}notification-container { position: fixed; bottom: 20px; right: 20px; z-index: 10000000; display: flex; flex-direction: column; gap: 10px; }
            .${CONFIG.ID_PREFIX}notification {
                background: var(--bg-glass); backdrop-filter: blur(10px); border: 1px solid var(--border-color);
                color: var(--chameleon-text); padding: 12px 24px; border-radius: 8px;
                box-shadow: 0 4px 16px rgba(0,0,0,0.3); transition: all 0.3s ease;
                opacity: 0; transform: translateX(20px); display: flex; align-items: center; gap: 16px;
                min-width: 250px;
            }
            .${CONFIG.ID_PREFIX}notification.show { opacity: 1; transform: translateX(0); }
            .${CONFIG.ID_PREFIX}notification button { background: rgba(255,255,255,0.2); border: 1px solid var(--chameleon-border); color: white; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; }
            .${CONFIG.ID_PREFIX}notification button:hover { background: rgba(255,255,255,0.3); }
            .${CONFIG.ID_PREFIX}notification.status-info { border-left: 5px solid var(--chameleon-accent); }
            .${CONFIG.ID_PREFIX}notification.status-success { border-left: 5px solid var(--success); }
            .${CONFIG.ID_PREFIX}notification.status-danger { border-left: 5px solid var(--danger); }
            .${CONFIG.ID_PREFIX}notification.status-warning { border-left: 5px solid var(--warning); }

            /* --- Modal System --- */
            .chameleon-modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); z-index: 10000001; display: flex; align-items: center; justify-content: center; animation: fadeIn 0.3s ease; }
            .chameleon-modal-overlay.hidden { opacity: 0; pointer-events: none; transition: opacity 0.3s ease; }
            .chameleon-modal-content { background: var(--bg-panel); border: 1px solid var(--border-color); border-radius: 12px; box-shadow: 0 10px 50px rgba(0,0,0,0.4); max-width: 500px; width: 90%; animation: slideInUp 0.4s cubic-bezier(0.4, 0, 0.2, 1); }
            .chameleon-modal-header { padding: 16px; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 12px; }
            .chameleon-modal-header h3 { margin: 0; font-size: 18px; }
            .chameleon-modal-body { padding: 16px; line-height: 1.6; max-height: 60vh; overflow-y: auto; }
            .chameleon-modal-body ul { list-style: disc; margin-left: 20px; padding: 0; }
            .chameleon-modal-body li { margin-bottom: 8px; }
            .chameleon-modal-body kbd, .chameleon-kbd-icon { background: rgba(255,255,255,0.1); border: 1px solid var(--border-color); padding: 2px 6px; border-radius: 4px; font-family: monospace; display: inline-flex; align-items: center; justify-content: center; font-size: 0.9em; }
            .chameleon-kbd-icon svg { width: 14px; height: 14px; }
            .chameleon-modal-footer { padding: 16px; border-top: 1px solid var(--border-color); text-align: right; }

            /* Genesis Chat */
            .chameleon-genesis-conversation { flex-grow: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 12px; }
            .chameleon-message { display: flex; gap: 10px; max-width: 85%; animation: fadeIn 0.5s ease; }
            .chameleon-message.user { align-self: flex-end; flex-direction: row-reverse; }
            .chameleon-avatar { flex-shrink: 0; width: 32px; height: 32px; border-radius: 50%; background: var(--chameleon-card); display: flex; align-items: center; justify-content: center; border: 1px solid var(--chameleon-border); }
            .chameleon-avatar svg { width: 20px; height: 20px; color: var(--chameleon-accent); }
            .chameleon-message.user .chameleon-avatar svg { color: var(--text-secondary); }
            .chameleon-bubble { padding: 10px 15px; border-radius: 18px; line-height: 1.5; word-wrap: break-word; }
            .chameleon-message.ai .chameleon-bubble { background: var(--chameleon-card); border-top-left-radius: 4px; }
            .chameleon-message.user .chameleon-bubble { background: var(--chameleon-accent); color: #fff; border-top-right-radius: 4px; }
            .chameleon-genesis-input-area { display: flex; padding: 10px; border-top: 1px solid var(--chameleon-border); gap: 10px; flex-shrink: 0; }
            .chameleon-genesis-input-area textarea { flex-grow: 1; resize: none; height: 50px; }
            .chameleon-genesis-input-area button { height: 50px; width: 50px; flex-shrink: 0; }
            .chameleon-spinner-wrapper { display: flex; align-items: center; gap: 8px; }

            /* --- Highlighter & Selection --- */
            #${CONFIG.ID_PREFIX}highlighter {
                position: absolute; background: rgba(88, 166, 255, 0.3); border: 2px solid var(--chameleon-accent);
                z-index: 9999997; pointer-events: none; transition: all 0.1s linear;
            }
            #${CONFIG.ID_PREFIX}highlighter::after {
                content: attr(data-info); position: absolute; bottom: 100%; left: 0;
                background: var(--chameleon-accent); color: white; padding: 4px 8px; font-size: 12px;
                border-radius: 4px; white-space: nowrap; transform: translateY(-5px);
            }
            body.chameleon-selection-active { cursor: crosshair !important; }
            .chameleon-iso-highlight { outline: 2px dashed var(--chameleon-accent) !important; outline-offset: 2px !important; }
            .chameleon-iso-selected { outline: 3px solid var(--danger) !important; outline-offset: 2px !important; box-shadow: 0 0 20px rgba(248, 81, 73, 0.5) !important; }
            .chameleon-playback-highlight { outline: 3px solid var(--success) !important; outline-offset: 2px !important; transition: outline 0.2s ease; }
            .chameleon-temp-highlight { outline: 2px solid var(--chameleon-primary) !important; outline-offset: 2px !important; transition: outline 0.2s ease; }
            .chameleon-agent-suggested { outline: 2px dashed var(--warning) !important; outline-offset: 2px !important; animation: pulse-warning 1.5s infinite alternate; }
            @keyframes pulse-warning {
                from { box-shadow: 0 0 0px var(--warning); }
                to { box-shadow: 0 0 10px var(--warning); }
            }
            .${CONFIG.ID_PREFIX}removable-overlay {
                position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(255, 0, 0, 0.3); color: white;
                display: flex; align-items: center; justify-content: center;
                font-size: 12px; font-weight: bold; cursor: pointer;
                opacity: 0; transition: opacity 0.3s ease;
                z-index: 10000; /* Above normal content, below Chameleon UI */
                pointer-events: auto; /* Allow clicks */
                box-sizing: border-box;
                border: 2px dashed red;
            }
            .${CONFIG.ID_PREFIX}removable-overlay:hover { opacity: 1; }


            /* --- Command Palette --- */
            .chameleon-palette-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 10000002; background: rgba(0,0,0,0.5); display: none; align-items: flex-start; justify-content: center; padding-top: 15vh; }
            .chameleon-palette-modal { width: 600px; max-width: 90%; background: var(--bg-panel); backdrop-filter: blur(16px); border: 1px solid var(--border-color); border-radius: 8px; box-shadow: 0 10px 50px rgba(0,0,0,0.4); }
            .chameleon-palette-input-wrapper { display: flex; align-items: center; gap: 12px; padding: 12px; border-bottom: 1px solid var(--border-color); }
            .chameleon-palette-input { background: none; border: none; color: var(--chameleon-text); font-size: 16px; width: 100%; outline: none; }
            .chameleon-palette-results { list-style: none; margin: 0; padding: 8px; max-height: 40vh; overflow-y: auto; }
            .chameleon-palette-results li { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 6px; cursor: pointer; }
            .chameleon-palette-results li:hover, .chameleon-palette-results li.active { background: rgba(88, 166, 255, 0.15); color: var(--chameleon-accent); }
            .chameleon-palette-results::-webkit-scrollbar { width: 6px; }
            .chameleon-palette-results::-webkit-scrollbar-track { background: transparent; }
            .chameleon-palette-results::-webkit-scrollbar-thumb { background: var(--chameleon-border); border-radius: 10px; }
            .chameleon-palette-results::-webkit-scrollbar-thumb:hover { background: var(--chameleon-accent); }

            /* --- Context Menu --- */
            .chameleon-context-menu { position: fixed; z-index: 10000003; background: var(--bg-panel); backdrop-filter: blur(10px); border: 1px solid var(--border-color); border-radius: 8px; padding: 8px; box-shadow: 0 5px 20px rgba(0,0,0,0.3); }
            .chameleon-context-item { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 6px; cursor: pointer; color: var(--chameleon-text); }
            .chameleon-context-item:hover { background: rgba(88, 166, 255, 0.15); color: var(--chameleon-accent); }
            .chameleon-setting-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px dashed var(--chameleon-border); }
            .chameleon-setting-item:last-child { border-bottom: none; }
            .chameleon-toggle { position: relative; width: 40px; height: 22px; appearance: none; background: var(--chameleon-border); border-radius: 11px; cursor: pointer; transition: background 0.2s; flex-shrink: 0; }
            .chameleon-toggle::before { content: ''; position: absolute; width: 18px; height: 18px; border-radius: 50%; background: white; top: 2px; left: 2px; transition: transform 0.2s; }
            .chameleon-toggle:checked { background: var(--success); }
            .chameleon-toggle:checked::before { transform: translateX(18px); }
        `);
    }

    // --- INITIALIZATION ---
    // Create the main controller instance and initialize it.
    const chameleonAI = new ChameleonAIForge();
    chameleonAI.init().catch(err => console.error('[CGF] CRITICAL ERROR:', err));

})();
