/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { CustomTheme, createDefaultCustomTheme, validateCustomTheme } from '../themes/theme.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { LoadedSettings, SettingScope } from '../../config/settings.js';

interface CustomThemeEditorProps {
    /** Callback function when a custom theme is saved */
    onSave: (customTheme: CustomTheme, scope: SettingScope) => void;
    /** Callback function when editing is cancelled */
    onCancel: () => void;
    /** The settings object */
    settings: LoadedSettings;
    /** Existing custom theme to edit (if editing) */
    existingTheme?: CustomTheme;
    /** Terminal width for layout calculations */
    terminalWidth: number;
}

interface ColorField {
    label: string;
    key: keyof CustomTheme;
    description: string;
}

const COLOR_FIELDS: ColorField[] = [
    { label: 'Background', key: 'Background', description: 'Main background color' },
    { label: 'Foreground', key: 'Foreground', description: 'Main text color' },
    { label: 'Light Blue', key: 'LightBlue', description: 'Light blue accent' },
    { label: 'Accent Blue', key: 'AccentBlue', description: 'Primary blue accent' },
    { label: 'Accent Purple', key: 'AccentPurple', description: 'Purple accent' },
    { label: 'Accent Cyan', key: 'AccentCyan', description: 'Cyan accent' },
    { label: 'Accent Green', key: 'AccentGreen', description: 'Green accent' },
    { label: 'Accent Yellow', key: 'AccentYellow', description: 'Yellow accent' },
    { label: 'Accent Red', key: 'AccentRed', description: 'Red accent' },
    { label: 'Comment', key: 'Comment', description: 'Comment text color' },
    { label: 'Gray', key: 'Gray', description: 'Gray/muted text color' },
];

export function CustomThemeEditor({
    onSave,
    onCancel,
    settings,
    existingTheme,
    terminalWidth,
}: CustomThemeEditorProps): React.JSX.Element {
    const [selectedScope, setSelectedScope] = useState<SettingScope>(
        SettingScope.User,
    );
    const [focusedSection, setFocusedSection] = useState<'name' | 'colors' | 'scope'>(
        'name',
    );
    const [currentFieldIndex, setCurrentFieldIndex] = useState(0);
    const [themeName, setThemeName] = useState(existingTheme?.name || '');
    const [customTheme, setCustomTheme] = useState<CustomTheme>(
        existingTheme || createDefaultCustomTheme('New Custom Theme', 'dark'),
    );
    const [validationError, setValidationError] = useState<string | null>(null);
    const [editColorIndex, setEditColorIndex] = useState<number | null>(null);
    const [editColorValue, setEditColorValue] = useState<string>('');

    const scopeItems = [
        { label: 'User Settings', value: SettingScope.User },
        { label: 'Workspace Settings', value: SettingScope.Workspace },
    ];

    const handleNameChange = useCallback((newName: string) => {
        setThemeName(newName);
        setCustomTheme(prev => ({ ...prev, name: newName }));
    }, []);

    const handleColorChange = useCallback((field: keyof CustomTheme, color: string) => {
        setCustomTheme(prev => ({ ...prev, [field]: color }));
    }, []);

    const handleSave = useCallback(() => {
        const finalTheme = { ...customTheme, name: themeName };
        const validation = validateCustomTheme(finalTheme);

        if (!validation.isValid) {
            setValidationError(validation.error || 'Invalid theme');
            return;
        }
        setValidationError(null);
        onSave(finalTheme, selectedScope);
    }, [customTheme, themeName, selectedScope, onSave]);

    useInput((input, key) => {
        if (editColorIndex !== null) {
            if (key.escape) {
                setEditColorIndex(null);
                setEditColorValue('');
                return;
            }
            if (key.return) {
                const field = COLOR_FIELDS[editColorIndex];
                setCustomTheme(prev => ({ ...prev, [field.key]: editColorValue }));
                setEditColorIndex(null);
                setEditColorValue('');
                return;
            }
            if (key.backspace || key.delete) {
                setEditColorValue(prev => prev.slice(0, -1));
                return;
            }
            if (input && input.length === 1) {
                setEditColorValue(prev => prev + input);
                return;
            }
            return;
        }
        if (focusedSection === 'colors') {
            if (key.upArrow) {
                setCurrentFieldIndex(i => (i > 0 ? i - 1 : COLOR_FIELDS.length - 1));
                return;
            }
            if (key.downArrow) {
                setCurrentFieldIndex(i => (i < COLOR_FIELDS.length - 1 ? i + 1 : 0));
                return;
            }
            if (key.return) {
                setEditColorIndex(currentFieldIndex);
                setEditColorValue(customTheme[COLOR_FIELDS[currentFieldIndex].key] as string);
                return;
            }
        }
        if (key.tab) {
            if (focusedSection === 'name') {
                setFocusedSection('colors');
                setCurrentFieldIndex(0);
            } else if (focusedSection === 'colors') {
                setFocusedSection('scope');
            } else {
                setFocusedSection('name');
            }
        } else if (key.escape) {
            onCancel();
        } else if (key.return) {
            if (focusedSection === 'scope') {
                handleSave();
            }
        } else if (focusedSection === 'name') {
            if (key.backspace || key.delete) {
                setThemeName(prev => prev.slice(0, -1));
            } else if (input && input.length === 1) {
                setThemeName(prev => prev + input);
            }
        }
    });

    const renderColorFields = () => (
        <Box flexDirection="column" marginLeft={2} marginTop={0}>
            {COLOR_FIELDS.map((field, index) => {
                const isFocused = focusedSection === 'colors' && currentFieldIndex === index;
                const isEditing = editColorIndex === index;
                const color = isEditing ? editColorValue : (customTheme[field.key] as string);
                return (
                    <Box key={field.key} marginY={0}>
                        <Text bold={isFocused || isEditing} color={isFocused || isEditing ? Colors.AccentBlue : undefined}>
                            {isFocused ? '> ' : '  '}
                        </Text>
                        <Text bold={isFocused || isEditing}>{field.label}:</Text>
                        <Box marginLeft={2}>
                            {isEditing ? (
                                <Text color={Colors.AccentYellow}>{color || ' '}</Text>
                            ) : (
                                <Text color={color}>{'█'}</Text>
                            )}
                            <Text> {color}</Text>
                        </Box>
                        <Text color={Colors.Gray}>{' '}({field.description})</Text>
                        {isEditing && (
                            <Text color={Colors.Gray}> (Type new value, Enter=save, Esc=cancel)</Text>
                        )}
                    </Box>
                );
            })}
        </Box>
    );

    return (
        <Box
            borderStyle="round"
            borderColor={Colors.Gray}
            flexDirection="column"
            padding={1}
            width="100%"
        >
            <Text bold color={Colors.AccentBlue}>
                {existingTheme ? 'Edit Custom Theme' : 'Create Custom Theme'}
            </Text>

            {/* Theme Name Section */}
            <Box marginTop={1} flexDirection="column">
                <Text bold={focusedSection === 'name'} color={focusedSection === 'name' ? Colors.AccentBlue : undefined}>
                    {focusedSection === 'name' ? '> ' : '  '}Theme Name:
                </Text>
                <Box marginLeft={2} marginTop={0}>
                    <Text bold={focusedSection === 'name'}>
                        {themeName || 'Enter theme name...'}
                    </Text>
                </Box>
            </Box>

            {/* Color Fields Section */}
            <Box marginTop={1} flexDirection="column">
                <Text bold={focusedSection === 'colors'} color={focusedSection === 'colors' ? Colors.AccentBlue : undefined}>
                    {focusedSection === 'colors' ? '> ' : '  '}Colors:
                </Text>
                {renderColorFields()}
            </Box>

            {/* Validation Error */}
            {validationError && (
                <Box marginTop={1}>
                    <Text color={Colors.AccentRed}>{validationError}</Text>
                </Box>
            )}

            {/* Scope Selection */}
            <Box marginTop={1} flexDirection="column">
                <Text bold={focusedSection === 'scope'} color={focusedSection === 'scope' ? Colors.AccentBlue : undefined}>
                    {focusedSection === 'scope' ? '> ' : '  '}Save to:
                </Text>
                <Box marginLeft={2} marginTop={0}>
                    <RadioButtonSelect
                        items={scopeItems}
                        initialIndex={selectedScope === SettingScope.User ? 0 : 1}
                        onSelect={(scope) => setSelectedScope(scope as SettingScope)}
                        onHighlight={() => { }}
                        isFocused={focusedSection === 'scope'}
                    />
                </Box>
            </Box>

            {/* Instructions */}
            <Box marginTop={1} flexDirection="column">
                <Text color={Colors.Gray}>
                    Up/Down: Move • Enter: Edit/Save • Esc: Cancel • Tab: Next Section
                </Text>
                <Text color={Colors.Gray}>
                    Type hex colors (e.g., #ff0000) or use named colors
                </Text>
            </Box>
        </Box>
    );
} 