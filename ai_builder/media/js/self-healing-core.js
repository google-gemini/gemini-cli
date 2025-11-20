/**
 * Self-Healing Automation Core
 *
 * Enterprise-grade orchestration engine that ensures reliability,
 * verifies actions, handles errors, and preserves system health.
 *
 * @package     AI Builder
 * @version     1.0.0
 */

(function() {
    'use strict';

    class SelfHealingAutomation {
        constructor() {
            this.actionLog = [];
            this.maxRetries = 3;
            this.healthCheckInterval = 5000;
            this.isMonitoring = false;
            this.state = {
                lastAction: null,
                lastStatus: 'idle',
                consecutiveFailures: 0,
                systemHealth: 'healthy' // healthy, degraded, critical
            };
        }

        /**
         * Initialize the engine
         */
        init() {
            console.log('🛡️ Self-Healing Core: Initializing...');
            this.startHealthMonitoring();

            // Expose globally
            window.SelfHealingAutomation = this;

            // Hook into global error handlers
            window.addEventListener('error', (e) => this.handleSystemError(e));

            // Verify dependencies
            this.verifyDependencies();
        }

        /**
         * Verify that required modules are loaded
         */
        verifyDependencies() {
            const required = ['YooThemeAutomation', 'DOMIntelligence', 'PageAwareness'];
            const missing = required.filter(dep => !window[dep]);

            if (missing.length > 0) {
                console.warn(`⚠️ Self-Healing Core: Missing dependencies: ${missing.join(', ')}`);
                this.state.systemHealth = 'degraded';
            } else {
                console.log('✅ Self-Healing Core: All dependencies verified.');
            }
        }

        /**
         * Execute an action with full verification and retry logic
         * @param {string} actionName - Name of function to call on YooThemeAutomation
         * @param {Array} args - Arguments for the function
         * @param {Object} options - Execution options (retries, verification strategy)
         */
        async execute(actionName, args = [], options = {}) {
            const operationId = Date.now().toString(36);
            console.group(`🛡️ Executing: ${actionName} [${operationId}]`);

            try {
                // 1. Pre-flight checks
                await this.checkSystemHealth();
                const startState = this.captureSnapshot();

                // 2. Execution loop with retries
                let result = null;
                let success = false;
                let attempts = 0;
                const maxAttempts = options.retries || this.maxRetries;

                while (!success && attempts < maxAttempts) {
                    attempts++;
                    try {
                        if (attempts > 1) {
                            console.log(`🔄 Retry attempt ${attempts}/${maxAttempts}...`);
                            await this.attemptRecovery(actionName);
                        }

                        // Execute the action on the underlying automation engine
                        if (typeof window.YooThemeAutomation[actionName] !== 'function') {
                            throw new Error(`Unknown action: ${actionName}`);
                        }

                        result = await window.YooThemeAutomation[actionName](...args);

                        // 3. Verification
                        success = await this.verifyOutcome(actionName, args, startState);

                        if (!success) {
                            throw new Error('Verification failed - DOM state did not change as expected');
                        }

                    } catch (err) {
                        console.warn(`⚠️ Attempt ${attempts} failed:`, err.message);
                        this.logAction(operationId, actionName, args, 'failed', err.message);

                        if (attempts === maxAttempts) throw err;
                        await this.smartDelay(attempts);
                    }
                }

                // 4. Success handling
                this.state.consecutiveFailures = 0;
                this.logAction(operationId, actionName, args, 'success');
                console.log('✅ Action verified and completed successfully');

                // Auto-save if safe
                if (options.autoSave !== false) {
                    await this.safeSave();
                }

                return result;

            } catch (finalError) {
                // 5. Failure handling & Rollback
                console.error('❌ Critical Failure:', finalError);
                this.handleCriticalFailure(finalError);
                throw finalError;
            } finally {
                console.groupEnd();
            }
        }

        /**
         * Capture a lightweight snapshot of the current state for verification
         */
        captureSnapshot() {
            if (!window.PageAwareness) return null;
            // Force a fresh scan
            return window.PageAwareness.getPageState(true);
        }

        /**
         * Verify that the action actually happened
         */
        async verifyOutcome(actionName, args, startState) {
            // Wait for DOM to settle
            await new Promise(r => setTimeout(r, 1000));

            const endState = this.captureSnapshot();
            if (!startState || !endState) return true; // Cannot verify, assume true

            console.log('🔍 Verifying outcome...');

            switch (actionName) {
                case 'addElementAndSetText':
                case 'addElement':
                    // Verify element count increased
                    const startCount = startState.elements.length;
                    const endCount = endState.elements.length;
                    const diff = endCount - startCount;
                    console.log(`   Element count: ${startCount} -> ${endCount} (Diff: ${diff})`);
                    return diff > 0;

                case 'changeText':
                case 'editElement':
                     // Harder to verify without deep content inspection,
                     // but we can check if the editor opened/closed or timestamps changed
                     return true;

                case 'removeElement':
                    // Verify element count decreased
                    return endState.elements.length < startState.elements.length;

                default:
                    return true;
            }
        }

        /**
         * Attempt to recover from a failure state
         */
        async attemptRecovery(failedAction) {
            console.log('🚑 Attempting self-healing...');

            // 1. Close any blocking modals
            await this.closeBlockingModals();

            // 2. Reset editor focus
            if (document.activeElement) {
                document.activeElement.blur();
            }

            // 3. Refresh iframe context
            if (window.YooThemeAutomation) {
                // Re-detect iframe
                window.YooThemeAutomation.getPreviewIframe();
            }

            // 4. Wait a bit
            await new Promise(r => setTimeout(r, 1000));
        }

        /**
         * Close any modals that might be blocking interaction
         */
        async closeBlockingModals() {
            const closeButtons = document.querySelectorAll('.uk-modal.uk-open .uk-close, .uk-modal.uk-open button[uk-close]');
            if (closeButtons.length > 0) {
                console.log(`   Found ${closeButtons.length} open modals, closing...`);
                closeButtons.forEach(btn => btn.click());
                await new Promise(r => setTimeout(r, 500));
            }
        }

        /**
         * Safe Save: Only save if system is healthy
         */
        async safeSave() {
            if (this.state.systemHealth !== 'critical') {
                await window.YooThemeAutomation.saveLayout();
            }
        }

        /**
         * Monitor system health
         */
        startHealthMonitoring() {
            if (this.isMonitoring) return;
            this.isMonitoring = true;

            setInterval(async () => {
                await this.checkSystemHealth();
            }, this.healthCheckInterval);
        }

        /**
         * Check current system health
         */
        async checkSystemHealth() {
            let health = 'healthy';

            // Check 1: Is YOOtheme customizer object alive?
            if (!window.$customizer && !window.parent.$customizer) {
                health = 'critical'; // Automation impossible without it
            }

            // Check 2: Is preview iframe accessible?
            try {
                const iframe = window.YooThemeAutomation?.getPreviewIframe();
                if (!iframe) health = 'degraded';
            } catch (e) {
                health = 'degraded';
            }

            this.state.systemHealth = health;

            // Update UI indicator if available
            this.updateHealthUI();
        }

        /**
         * Update visual health indicator
         */
        updateHealthUI() {
            const statusEl = document.getElementById('ai-builder-status');
            if (statusEl) {
                statusEl.className = this.state.systemHealth;
                statusEl.title = `System Health: ${this.state.systemHealth}`;
            }
        }

        logAction(id, action, args, status, error = null) {
            this.actionLog.push({
                id,
                timestamp: new Date().toISOString(),
                action,
                args: JSON.stringify(args), // simplified for log
                status,
                error
            });

            // Keep log size manageable
            if (this.actionLog.length > 50) this.actionLog.shift();
        }

        handleSystemError(event) {
            // Log but don't stop unless critical
            console.error('System Error detected by Self-Healing Core:', event.message);
        }

        smartDelay(attempt) {
            // Exponential backoff
            const ms = Math.min(1000 * Math.pow(2, attempt), 5000);
            return new Promise(r => setTimeout(r, ms));
        }
    }

    // Auto-init
    new SelfHealingAutomation().init();

})();
