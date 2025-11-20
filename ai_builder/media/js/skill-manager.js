/**
 * Skill Manager
 *
 * Manages the AI's learned capabilities by storing, retrieving, and executing
 * auto-generated scripts from the Action Recorder.
 *
 * @package     AI Builder
 * @version     6.0.0
 * @author      CLEO AI
 */

(function() {
    'use strict';

    console.log('[SkillManager] 🧠 Initializing...');

    const STORAGE_KEY = 'cleo_skill_catalog';

    class SkillManager {
        constructor() {
            this.skills = this.loadSkills();
            console.log(`[SkillManager] ${Object.keys(this.skills).length} skills loaded from storage.`);
        }

        /**
         * Loads all skills from localStorage.
         * @returns {object} An object containing all stored skills.
         */
        loadSkills() {
            try {
                const storedSkills = localStorage.getItem(STORAGE_KEY);
                return storedSkills ? JSON.parse(storedSkills) : {};
            } catch (e) {
                console.error('[SkillManager] Error loading skills from localStorage:', e);
                return {};
            }
        }

        /**
         * Saves all skills to localStorage.
         */
        saveSkills() {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(this.skills));
            } catch (e) {
                console.error('[SkillManager] Error saving skills to localStorage:', e);
            }
        }

        /**
         * Adds a new skill to the catalog.
         * @param {string} name - The name of the skill.
         * @param {string} script - The JavaScript code for the skill.
         * @param {string} description - A natural language description of the skill.
         * @returns {boolean} Success status.
         */
        addSkill(name, script, description = '') {
            if (!name || !script) {
                console.error('[SkillManager] Skill name and script are required.');
                return false;
            }

            const skillName = this.sanitizeSkillName(name);

            if (this.skills[skillName]) {
                console.warn(`[SkillManager] Overwriting existing skill: ${skillName}`);
            }

            this.skills[skillName] = {
                name: skillName,
                description: description || `Auto-generated skill to perform: ${skillName}`,
                script: script,
                createdAt: new Date().toISOString(),
            };

            this.saveSkills();
            console.log(`[SkillManager] ✨ Skill '${skillName}' added successfully.`);
            return true;
        }

        /**
         * Retrieves a skill by its name.
         * @param {string} name - The name of the skill to retrieve.
         * @returns {object|null} The skill object or null if not found.
         */
        getSkill(name) {
            const skillName = this.sanitizeSkillName(name);
            return this.skills[skillName] || null;
        }

        /**
         * Executes a stored skill.
         * @param {string} name - The name of the skill to run.
         * @returns {Promise<boolean>} A promise that resolves to true if the skill was executed, false otherwise.
         */
        async runSkill(name) {
            const skill = this.getSkill(name);
            if (!skill) {
                console.error(`[SkillManager] ❌ Skill '${name}' not found.`);
                return false;
            }

            console.log(`[SkillManager] ▶️ Executing skill: ${name}`);
            try {
                // This is a dynamic evaluation of the script. It's powerful but requires
                // the script content to be trusted (which it is, as we generated it).
                const skillFunction = new Function(`return ${skill.script}`)();
                await skillFunction();
                return true;
            } catch (e) {
                console.error(`[SkillManager] ❌ Error executing skill '${name}':`, e);
                return false;
            }
        }

        /**
         * Lists all available skills.
         * @returns {Array<string>} An array of skill names.
         */
        listSkills() {
            return Object.keys(this.skills);
        }

        /**
         * Deletes a skill from the catalog.
         * @param {string} name - The name of the skill to delete.
         */
        deleteSkill(name) {
            const skillName = this.sanitizeSkillName(name);
            if (this.skills[skillName]) {
                delete this.skills[skillName];
                this.saveSkills();
                console.log(`[SkillManager] 🗑️ Skill '${skillName}' deleted.`);
            } else {
                console.warn(`[SkillManager] Skill '${skillName}' not found for deletion.`);
            }
        }

        /**
         * Finds skills based on a search query.
         * @param {string} query - The search term.
         * @returns {Array<object>} A list of matching skills.
         */
        findSkills(query) {
            const lowerQuery = query.toLowerCase();
            return Object.values(this.skills).filter(skill =>
                skill.name.toLowerCase().includes(lowerQuery) ||
                skill.description.toLowerCase().includes(lowerQuery)
            );
        }

        /**
         * Sanitizes a skill name to be a valid JavaScript function name.
         * @param {string} name - The input name.
         * @returns {string} The sanitized name.
         */
        sanitizeSkillName(name) {
            return name
                .trim()
                .replace(/\s+/g, '_') // Replace spaces with underscores
                .replace(/[^a-zA-Z0-9_]/g, ''); // Remove invalid characters
        }
    }

    // Make it available globally
    window.SkillManager = new SkillManager();

    console.log('[SkillManager] ✅ Skill Manager initialized.');
    console.log('[SkillManager] 📖 Usage: SkillManager.addSkill("mySkill", "async function mySkill() { console.log(\'hi\'); }")');
    console.log('[SkillManager] 📖 Usage: SkillManager.runSkill("mySkill")');

})();
