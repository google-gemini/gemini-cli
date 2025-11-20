console.log('%c[AI Builder] ✅✅✅ KNOWLEDGE-ENHANCED VERSION 8.0.4 LOADED ✅✅✅', 'background: #222; color: #bada55; font-size: 24px; font-weight: bold; padding: 10px;');

/**
 * AI Builder - Unified Command Center Loader
 *
 * SIMPLIFIED: Only loads the unified command center.
 * No more multiple UIs, no more conflicts.
 *
 * @package     AI Builder
 * @version     5.1.0
 */

(function() {
    'use strict';

    console.log('%c[AI Builder] 🚀 Loading Unified Command Center ONLY',
        'background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 12px 24px; border-radius: 8px; font-weight: bold; font-size: 16px;');

    // DISABLE all old UIs
    window.AI_BUILDER_OLD_UI_DISABLED = true;

    // Check context
    const isYOOtheme = !!(
        window.$customizer ||
        (window.parent && window.parent.$customizer) ||
        document.querySelector('iframe[name^="preview-"]') ||
        window.location.href.includes('customizer')
    );

    if (!isYOOtheme) {
        console.log('[AI Builder] Not in YOOtheme - skipping');
        return;
    }

    // Load ONLY unified command center
    function loadCommandCenter() {
        const script = document.createElement('script');
        script.src = '/media/plg_system_ai_builder/js/unified-command-center.js';

        script.onload = function() {
            console.log('%c[AI Builder] ✅ COMMAND CENTER READY - Look for ⚡ panel',
                'background: #10b981; color: white; padding: 12px 24px; border-radius: 8px; font-weight: bold; font-size: 16px;');
        };

        script.onerror = function() {
            console.error('%c[AI Builder] ❌ Failed to load command center',
                'background: #ef4444; color: white; padding: 12px 24px; border-radius: 8px; font-weight: bold;');
        };

        document.head.appendChild(script);
    }

    // Load immediately
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadCommandCenter);
    } else {
        loadCommandCenter();
    }

})();
