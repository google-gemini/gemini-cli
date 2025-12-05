/**
 * YOOtheme API Integration
 *
 * This script interacts directly with the YOOtheme Pro internal API for robust,
 * fast, and reliable page building automation. It replaces the fragile UI
 * automation methods.
 *
 * @package     AI Builder
 * @version     6.0.0
 * @author      CLEO AI
 */

(function() {
    'use strict';

    console.log('[YooThemeAPI] 🚀 Initializing Direct API Integration...');

    // ============================================================================
    // CORE API OBJECT
    // ============================================================================

    const YooThemeAPI = {
        history: {
            undoStack: [],
            redoStack: [],
            isRestoring: false, // Flag to prevent recording undo/redo actions
        },

        /**
         * Safely retrieves the YOOtheme customizer instance from the parent window.
         * @returns {object|null} The customizer object or null if not found.
         */
        getCustomizer() {
            if (window.parent && window.parent.$customizer) {
                return window.parent.$customizer;
            }
            console.error('[YooThemeAPI] ❌ YOOtheme $customizer object not found. Are you in the builder?');
            return null;
        },

        /**
         * Creates a new element object with default properties.
         * @param {string} type - The element type (e.g., 'headline', 'text').
         * @param {object} props - Initial properties for the element.
         * @returns {object} A new element data structure.
         */
        createElement(type, props = {}) {
            const customizer = this.getCustomizer();
            if (!customizer) return null;

            // Use YOOtheme's internal method to generate a unique ID
            const id = customizer.uid('el-');

            const defaults = {
                id: id,
                type: type,
                props: {},
                children: [],
            };

            const element = { ...defaults, ...props };
            console.log(`[YooThemeAPI] ✨ Created element object: ${type} (ID: ${id})`);
            return element;
        },

        /**
         * Adds a new element to the builder.
         * @param {string} elementType - The type of element to add.
         * @param {object} props - The properties for the new element.
         * @param {string|null} parentId - The ID of the parent to add to. Defaults to the first section.
         * @returns {Promise<object>} The newly added element's data.
         */
        async addElement(elementType, props, parentId = null) {
            const customizer = this.getCustomizer();
            if (!customizer) throw new Error('Customizer not available.');

            this.recordUndoState('addElement');

            const newElement = this.createElement(elementType, { props });

            // Find a valid parent to add the element to
            if (!parentId) {
                const state = customizer.get('page.sections');
                const firstSectionId = Object.keys(state)[0];
                if (!firstSectionId) {
                    // TODO: Create a section if none exists
                    throw new Error('No sections found on the page to add the element to.');
                }
                parentId = firstSectionId;
            }

            console.log(`[YooThemeAPI] ➕ Adding element '${elementType}' to parent '${parentId}'`);

            // Use the internal YOOtheme method, which might be different from the documented one
            // Based on observation, it might be a Vuex action
            if (customizer.$store) {
                customizer.$store.dispatch('builder/addElement', { parent: parentId, type: elementType, el: newElement });
            } else {
                // Fallback to documented method
                customizer.addElement(parentId, elementType, newElement);
            }

            await this.save();
            return newElement;
        },

        /**
         * Updates an existing element's properties.
         * @param {string} elementId - The ID of the element to update.
         * @param {object} newProps - The new properties to apply.
         * @returns {Promise<boolean>} Success status.
         */
        async updateElement(elementId, newProps) {
            const customizer = this.getCustomizer();
            if (!customizer) throw new Error('Customizer not available.');

            this.recordUndoState('updateElement');

            console.log(`[YooThemeAPI] 🔄 Updating element '${elementId}' with props:`, newProps);

            if (customizer.$store) {
                customizer.$store.dispatch('builder/updateElement', { id: elementId, props: newProps });
            } else {
                customizer.updateElement(elementId, newProps);
            }

            await this.save();
            return true;
        },

        /**
         * Deletes an element from the builder.
         * @param {string} elementId - The ID of the element to delete.
         * @returns {Promise<boolean>} Success status.
         */
        async deleteElement(elementId) {
            const customizer = this.getCustomizer();
            if (!customizer) throw new Error('Customizer not available.');

            this.recordUndoState('deleteElement');

            console.log(`[YooThemeAPI] ❌ Deleting element '${elementId}'`);

            if (customizer.$store) {
                customizer.$store.dispatch('builder/deleteElement', { id: elementId });
            } else {
                customizer.deleteElement(elementId);
            }

            await this.save();
            return true;
        },

        /**
         * Saves the current builder state.
         * @returns {Promise<void>}
         */
        async save() {
            const customizer = this.getCustomizer();
            if (!customizer) return;

            console.log('[YooThemeAPI] 💾 Saving layout...');
            await customizer.save();
            console.log('[YooThemeAPI] ✅ Layout saved.');
        },

        /**
         * Gets the entire builder state.
         * @returns {object|null} The current page data.
         */
        getBuilderState() {
            const customizer = this.getCustomizer();
            if (!customizer) return null;

            // Deep clone to prevent accidental mutation
            return JSON.parse(JSON.stringify(customizer.get('page')));
        },

        /**
         * Restores the builder to a specific state.
         * @param {object} state - The page data object to restore.
         */
        async restoreBuilderState(state) {
            const customizer = this.getCustomizer();
            if (!customizer || !state) return;

            console.log('[YooThemeAPI] ⏪ Restoring builder state...');
            this.history.isRestoring = true;

            // Use the update method to replace the entire page configuration
            customizer.update({ 'page': state });

            await this.save();
            this.history.isRestoring = false;
            console.log('[YooThemeAPI] ✅ State restored.');
        },


        // ============================================================================
        // UNDO / REDO IMPLEMENTATION
        // ============================================================================

        /**
         * Records the current builder state to the undo stack.
         * @param {string} actionName - The name of the action being performed.
         */
        recordUndoState(actionName) {
            if (this.history.isRestoring) return;

            const state = this.getBuilderState();
            if (state) {
                this.history.undoStack.push({ action: actionName, state: state });
                // Clear the redo stack whenever a new action is performed
                this.history.redoStack = [];
                console.log(`[YooThemeAPI] 📝 Recorded state for '${actionName}'. Undo stack size: ${this.history.undoStack.length}`);
            }
        },

        /**
         * Undoes the last action.
         */
        async undo() {
            if (this.history.undoStack.length === 0) {
                console.warn('[YooThemeAPI] 🤷 No actions to undo.');
                return;
            }

            const lastState = this.history.undoStack.pop();
            const currentState = this.getBuilderState();

            // Add the current state to the redo stack before reverting
            this.history.redoStack.push({ action: 'redo', state: currentState });

            console.log(`[YooThemeAPI] ↩️ Undoing action: '${lastState.action}'`);
            await this.restoreBuilderState(lastState.state);
        },

        /**
         * Redoes the last undone action.
         */
        async redo() {
            if (this.history.redoStack.length === 0) {
                console.warn('[YooThemeAPI] 🤷 No actions to redo.');
                return;
            }

            const nextState = this.history.redoStack.pop();
            const currentState = this.getBuilderState();

            // Add the current state back to the undo stack before applying the redo state
            this.history.undoStack.push({ action: 'undo', state: currentState });

            console.log(`[YooThemeAPI] ↪️ Redoing action...`);
            await this.restoreBuilderState(nextState.state);
        }
    };

    // Make the API available globally
    window.YooThemeAPI = YooThemeAPI;

    console.log('[YooThemeAPI] ✅ Direct API Integration Loaded.');
    console.log('[YooThemeAPI] 📖 Usage: YooThemeAPI.addElement("headline", { content: "Hello API!" })');
    console.log('[YooThemeAPI] 📖 Usage: YooThemeAPI.undo() / YooThemeAPI.redo()');

})();
