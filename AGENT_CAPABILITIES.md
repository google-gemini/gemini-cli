# AI Builder Agent Capabilities & Action-Term Mapping (Enterprise Edition)

This document outlines the "scanalyzed" codebase of the AI Builder agent, mapping natural language "Action Terms" to specific code execution paths within the Joomla/YOOtheme environment.

## Architecture Overview

The system has been upgraded to an **Enterprise-Tier Architecture** featuring:
1.  **Self-Healing Automation Core**: A robustness layer that monitors health, retries failed actions, and ensures system stability.
2.  **Enhanced DOM Intelligence**: A dependency-free, deep-scanning engine that understands YOOtheme's semantic structure.
3.  **Advanced UI Automation**: Human-like interaction simulation for complex tasks like Drag & Drop and Styling.

### 1. Frontend (`custom-code.js`)
The main controller running in the browser. It now delegates execution to the `SelfHealingAutomation` engine.

### 2. Self-Healing Core (`self-healing-core.js`)
*   **Responsibility**: Orchestration, Error Recovery, Health Monitoring.
*   **Key Features**:
    *   Pre-flight health checks (iframe existence, customizer API status).
    *   Automatic retry with exponential backoff.
    *   Action verification (did the DOM actually change?).
    *   "Safe Save" logic.

### 3. DOM Intelligence (`dom-intelligence-enhanced.js`)
*   **Responsibility**: Deep scanning and "Understanding" of the page.
*   **Key Features**:
    *   `scanPage()`: Builds a semantic tree of the page.
    *   `findElementByDescription()`: Uses fuzzy matching and semantic inference to find elements by natural language (e.g., "the headline in the hero section").
    *   `createFingerprint()`: Generates robust, multi-attribute fingerprints for elements.

### 4. Automation Engine (`yootheme-automation.js`)
*   **Responsibility**: Low-level interaction with YOOtheme UI.
*   **Key Features**:
    *   `moveElement()`: Simulates complex Drag & Drop events.
    *   `setElementStyle()`: Navigates sidebar tabs to find and modify style controls.
    *   `simulateHumanClick()`: Generates realistic mouse event sequences.

## Action-Term Mapping

The agent interprets natural language prompts and maps them to the following actions:

### 1. `add_element`
*   **Triggers**: "add a button", "create a new section".
*   **Execution**: `SelfHealingAutomation.execute('addElementAndSetText', ...)`
*   **Logic**: Opens modal, searches for element, clicks it, sets content, saves.

### 2. `edit_text`
*   **Triggers**: "change the headline", "update text".
*   **Execution**: `SelfHealingAutomation.execute('changeText', ...)`
*   **Logic**: Finds element, clicks edit, types in TinyMCE/input, saves.

### 3. `remove_element`
*   **Triggers**: "remove this", "delete button".
*   **Execution**: `SelfHealingAutomation.execute('removeElement', ...)`
*   **Logic**: Finds element, clicks delete, confirms modal, saves.

### 4. `style_element` (New!)
*   **Triggers**: "make it blue", "set padding to large".
*   **Execution**: `SelfHealingAutomation.execute('setElementStyle', ...)`
*   **Logic**: Opens editor, switches to "Settings" tab, finds control by label, sets value.

### 5. `move_element` (New!)
*   **Triggers**: "move up", "drag to the next column".
*   **Execution**: `SelfHealingAutomation.execute('moveElement', ...)`
*   **Logic**: Identifies drag handle, simulates `dragstart`, `dragover`, `drop` events.

### 6. `navigate`
*   **Triggers**: "go to home", "open settings".
*   **Execution**: `SelfHealingAutomation.execute('navigateTo', ...)`

## System Introspection
The `SystemIntrospection` module allows the AI to "learn" the capabilities of the installed YOOtheme version dynamically, adapting its strategies if the UI changes.

## Files of Interest

*   `/app/ai_builder/custom-code.js`: Main entry point.
*   `/app/ai_builder/media/js/self-healing-core.js`: Reliability engine.
*   `/app/ai_builder/media/js/dom-intelligence-enhanced.js`: Brain.
*   `/app/ai_builder/media/js/yootheme-automation.js`: Hands.
