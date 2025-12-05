/**
 * Test file for Cleo.js Integration in AI Builder
 *
 * This script tests that the Cleo.js (Chameleon AI-Forge) integration
 * is properly loaded and functional with the YOOtheme AI Builder.
 */

function testCleoIntegration() {
    console.log('🧪 Starting Cleo.js Integration Tests...');

    // Test 1: Check that Cleo integration is loaded
    console.log('\n--- Test 1: Cleo Integration Loading ---');
    const cleoIntegrationLoaded = !!window.CleoAIIntegration;
    console.log(`CleoAIIntegration available: ${cleoIntegrationLoaded}`);
    if (cleoIntegrationLoaded) {
        console.log('✅ Cleo Integration loaded successfully');
        console.log('Cleo Integration activated:', window.CleoAIIntegration.activated);
    } else {
        console.log('❌ Cleo Integration not loaded');
        return false;
    }

    // Test 2: Check that enhanced task planner is loaded
    console.log('\n--- Test 2: Enhanced Task Planner ---');
    const enhancedTaskPlanner = typeof window.AITaskPlanner !== 'undefined' &&
                                typeof window.AITaskPlanner.executeCleoPlan !== 'undefined';
    console.log(`Enhanced Task Planner available: ${!!enhancedTaskPlanner}`);
    if (enhancedTaskPlanner) {
        console.log('✅ Enhanced Task Planner with Cleo operations loaded');
    } else {
        console.log('⚠️ Enhanced Task Planner not available');
    }

    // Test 3: Check that enhanced DOM Intelligence is loaded
    console.log('\n--- Test 3: Enhanced DOM Intelligence ---');
    const enhancedDOMIntelligence = typeof window.DOMIntelligence !== 'undefined' &&
                                   typeof window.DOMIntelligence.enhancedScoreMatch !== 'undefined';
    console.log(`Enhanced DOM Intelligence available: ${!!enhancedDOMIntelligence}`);
    if (enhancedDOMIntelligence) {
        console.log('✅ Enhanced DOM Intelligence with Cleo capabilities loaded');
    } else {
        console.log('⚠️ Enhanced DOM Intelligence not available');
    }

    // Test 4: Check Cleo patterns in Task Planner
    console.log('\n--- Test 4: Cleo Patterns in Task Planner ---');
    if (window.AITaskPlanner && window.AITaskPlanner.COMPLEX_PATTERNS) {
        const cleoPatterns = [
            'security_audit', 'accessibility_review', 'performance_analysis',
            'component_isolation', 'ui_generation', 'api_monitoring', 'automated_workflow'
        ];

        let foundCleoPatterns = 0;
        for (const pattern of cleoPatterns) {
            if (window.AITaskPlanner.COMPLEX_PATTERNS[pattern]) {
                foundCleoPatterns++;
                console.log(`✅ Found Cleo pattern: ${pattern}`);
            }
        }

        console.log(`Found ${foundCleoPatterns}/${cleoPatterns.length} Cleo patterns`);
    } else {
        console.log('⚠️ Task Planner or patterns not available for testing');
    }

    // Test 5: Check YOOtheme customizer awareness
    console.log('\n--- Test 5: YOOtheme Awareness ---');
    const inCustomizer = !!(window.$customizer || (window.parent && window.parent.$customizer));
    console.log(`In YOOtheme customizer: ${inCustomizer}`);

    if (window.CleoAIIntegration) {
        const isYooThemeAware = window.CleoAIIntegration.isInYooThemeCustomizer();
        console.log(`Cleo integration YOOtheme awareness: ${isYooThemeAware}`);
    }

    // Test 6: Check that Chameleon AI-Forge is available
    console.log('\n--- Test 6: Chameleon AI-Forge Availability ---');
    const chameleonAvailable = !!window.ChameleonAI;
    console.log(`Chameleon AI-Forge available: ${chameleonAvailable}`);

    if (chameleonAvailable) {
        try {
            const controller = window.ChameleonAI.getController();
            console.log(`Chameleon controller available: ${!!controller}`);
            console.log('✅ Chameleon AI-Forge system available');
        } catch (e) {
            console.log('⚠️ Chameleon controller access failed');
        }
    }

    // Test 7: Check enhanced command parsing
    console.log('\n--- Test 7: Enhanced Command Parsing ---');
    if (window.CleoAIIntegration) {
        try {
            const sampleCommands = [
                'add a hero section',
                'scan for security vulnerabilities',
                'create a login form',
                'check accessibility'
            ];

            for (const cmd of sampleCommands) {
                const ops = window.CleoAIIntegration.parseWithChameleon(cmd);
                console.log(`Command: "${cmd}" -> ${ops.length} operations`);
            }
        } catch (e) {
            console.log('⚠️ Command parsing test failed:', e.message);
        }
    }

    console.log('\n--- Integration Test Summary ---');
    const allTests = [
        cleoIntegrationLoaded,
        enhancedTaskPlanner,
        enhancedDOMIntelligence,
        chameleonAvailable
    ];

    const passedTests = allTests.filter(Boolean).length;
    const totalTests = allTests.length;

    console.log(`Passed: ${passedTests}/${totalTests} core tests`);

    if (passedTests === totalTests) {
        console.log('✅ All core integration tests PASSED!');
        console.log('Cleo.js (Chameleon AI-Forge) has been successfully integrated into the AI Builder.');
        return true;
    } else {
        console.log('⚠️ Some integration tests failed, but core functionality may still work.');
        return false;
    }
}

// Run the test
testCleoIntegration();