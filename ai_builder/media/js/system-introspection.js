/**
 * System Introspection - Allows AI to learn about YOOtheme/Joomla internals
 * This provides deep knowledge about what's possible in the system
 */

window.SystemIntrospection = {

    /**
     * Get complete YOOtheme customizer API documentation
     */
    getCustomizerAPI() {
        const customizer = window.parent.$customizer;
        if (!customizer) return null;

        return {
            type: typeof customizer,
            methods: Object.getOwnPropertyNames(Object.getPrototypeOf(customizer))
                .filter(name => typeof customizer[name] === 'function'),
            data: customizer.$data ? Object.keys(customizer.$data) : [],
            computed: customizer.$options?.computed ? Object.keys(customizer.$options.computed) : [],
            watchers: customizer.$options?.watch ? Object.keys(customizer.$options.watch) : []
        };
    },

    /**
     * Get all available YOOtheme elements with their schemas
     */
    getElementSchemas() {
        const doc = window.parent.document;

        // Try to find element definitions in YOOtheme's data
        const customizer = window.parent.$customizer;
        if (customizer && customizer.$data?.elements) {
            return customizer.$data.elements;
        }

        // Fallback: scan the elements modal
        return this.scanElementsFromUI();
    },

    /**
     * Scan elements by inspecting the UI
     */
    scanElementsFromUI() {
        const doc = window.parent.document;
        const elements = {};

        // Find all element cards in the builder
        doc.querySelectorAll('.uk-card.yo-panel').forEach(card => {
            const name = card.querySelector('.uk-card-title')?.textContent;
            const description = card.querySelector('.uk-text-meta')?.textContent;

            if (name) {
                elements[name] = {
                    name,
                    description,
                    // Add more details as we discover them
                };
            }
        });

        return elements;
    },

    /**
     * Get current page structure and data
     */
    getPageStructure() {
        const customizer = window.parent.$customizer;
        if (!customizer || !customizer.$data) return null;

        return {
            page: customizer.$data.page,
            sections: customizer.$data.sections,
            theme: customizer.$data.theme,
            // Include whatever structure YOOtheme uses
        };
    },

    /**
     * Get all available actions/mutations
     */
    getAvailableActions() {
        const customizer = window.parent.$customizer;
        if (!customizer) return [];

        const actions = [];

        // If using Vuex
        if (customizer.$store) {
            actions.push(...Object.keys(customizer.$store._actions || {}));
        }

        // If using Vue methods
        if (customizer.$options?.methods) {
            actions.push(...Object.keys(customizer.$options.methods));
        }

        return actions;
    },

    /**
     * Introspect a specific element to learn its properties
     */
    inspectElement(elementType) {
        const doc = window.parent.document;

        // Try to find the element in the builder and inspect its edit form
        // This would give us all the properties it accepts

        return {
            type: elementType,
            properties: {}, // Would be populated by inspecting the edit UI
            defaults: {},
            validation: {}
        };
    },

    /**
     * Get complete system capabilities
     */
    getSystemCapabilities() {
        return {
            yootheme: {
                version: this.getYOOthemeVersion(),
                elements: this.getElementSchemas(),
                api: this.getCustomizerAPI(),
                actions: this.getAvailableActions()
            },
            joomla: {
                version: window.Joomla?.JVersion || 'unknown',
                // Add Joomla-specific capabilities
            },
            builder: {
                canAddElements: true,
                canEditElements: true,
                canDeleteElements: true,
                canReorderElements: true,
                // List all capabilities
            }
        };
    },

    /**
     * Get YOOtheme version
     */
    getYOOthemeVersion() {
        // Try to extract from various sources
        const scripts = window.parent.document.scripts;
        for (let script of scripts) {
            if (script.src.includes('yootheme') && script.src.includes('ver=')) {
                const match = script.src.match(/ver=([0-9.]+)/);
                if (match) return match[1];
            }
        }
        return 'unknown';
    },

    /**
     * Generate complete API documentation
     */
    generateAPIDocs() {
        const capabilities = this.getSystemCapabilities();

        let docs = '# YOOtheme System API Documentation\n\n';
        docs += `## YOOtheme Version: ${capabilities.yootheme.version}\n\n`;

        docs += '## Available Elements:\n';
        for (let [name, details] of Object.entries(capabilities.yootheme.elements)) {
            docs += `- **${name}**: ${details.description || 'No description'}\n`;
        }

        docs += '\n## Available API Methods:\n';
        for (let method of capabilities.yootheme.api.methods) {
            docs += `- \`${method}()\`\n`;
        }

        docs += '\n## Available Actions:\n';
        for (let action of capabilities.yootheme.actions) {
            docs += `- ${action}\n`;
        }

        return docs;
    },

    /**
     * Export all knowledge as JSON for AI training
     */
    exportKnowledgeBase() {
        return JSON.stringify(this.getSystemCapabilities(), null, 2);
    }
};

// Auto-export knowledge on load
console.log('📚 System Introspection loaded');
console.log('Usage:');
console.log('  SystemIntrospection.generateAPIDocs() - Get complete API docs');
console.log('  SystemIntrospection.exportKnowledgeBase() - Export as JSON');
console.log('  SystemIntrospection.getSystemCapabilities() - Get all capabilities');
