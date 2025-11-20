/**
 * MINIMAL DIAGNOSTIC VERSION - Use this to test if AI Builder is causing issues
 *
 * INSTRUCTIONS:
 * 1. Copy this entire file
 * 2. Paste into: YOOtheme Customizer → Settings → Custom Code → JavaScript
 * 3. Save and test if the builder pane is now accessible
 *
 * If the builder works with this minimal version, then the full version needs adjustment.
 * If the builder still doesn't work, the issue is NOT caused by AI Builder.
 */

(function() {
    'use strict';

    console.log('='.repeat(60));
    console.log('AI Builder - Minimal Diagnostic Version');
    console.log('='.repeat(60));

    // Diagnostic checks
    const diagnostics = {
        hasCustomizer: !!window.$customizer,
        customizerInParent: !!(window.parent && window.parent.$customizer),
        isInIframe: window !== window.top,
        hasVue: !!window.Vue,
        hasJoomla: !!window.Joomla,
        location: window.location.href,
        iframeCount: document.querySelectorAll('iframe').length
    };

    console.log('🔍 Diagnostics:', diagnostics);

    // Only show a minimal notice, don't inject full UI
    setTimeout(() => {
        const notice = document.createElement('div');
        notice.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #10b981;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-family: sans-serif;
            font-size: 13px;
            z-index: 99999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;
        notice.textContent = '✅ AI Builder (Minimal) Loaded - Check console for diagnostics';
        document.body.appendChild(notice);

        // Auto-hide after 5 seconds
        setTimeout(() => notice.remove(), 5000);
    }, 1000);

    // Check if we're in the right context
    if (!diagnostics.hasCustomizer && !diagnostics.customizerInParent) {
        console.warn('⚠️ NOT IN YOOTHEME CUSTOMIZER');
        console.log('📝 To access YOOtheme Customizer:');
        console.log('   1. Go to Joomla Admin');
        console.log('   2. Click: Extensions → Templates → Site Templates');
        console.log('   3. Click your YOOtheme template name');
        console.log('   4. Click "Customizer" button');
        console.log('   5. Or navigate to: Appearance → YOOtheme → Customizer');
    } else {
        console.log('✅ YOOtheme customizer detected');
    }

    console.log('='.repeat(60));

})();
