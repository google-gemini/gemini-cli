/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { AsyncFzf } from 'fzf';
import type {
  LoadableSettingScope,
  LoadedSettings,
  Settings,
} from '../../config/settings.js';
import { SettingScope } from '../../config/settings.js';
import { getScopeMessageForSetting } from '../../utils/dialogScopeUtils.js';
import {
  getDialogSettingKeys,
  setPendingSettingValue,
  getDisplayValue,
  saveModifiedSettings,
  getSettingDefinition,
  isDefaultValue,
  requiresRestart,
  getRestartRequiredFromModified,
  getEffectiveDefaultValue,
  setPendingSettingValueAny,
  getNestedValue,
  getEffectiveValue,
} from '../../utils/settingsUtils.js';
import { useVimMode } from '../contexts/VimModeContext.js';
import { useKeypress } from '../hooks/useKeypress.js';
import chalk from 'chalk';
import {
  cpSlice,
  cpLen,
  stripUnsafeCharacters,
  getCachedStringWidth,
} from '../utils/textUtils.js';
import {
  type SettingsValue,
  TOGGLE_TYPES,
} from '../../config/settingsSchema.js';
import { coreEvents } from '@google/gemini-cli-core';
import { keyMatchers, Command } from '../keyMatchers.js';
import type { Config } from '@google/gemini-cli-core';
import {
  StandardConfigDialog,
  DialogItem,
} from './shared/StandardConfigDialog.js';

interface FzfResult {
  item: string;
  start: number;
  end: number;
  score: number;
  positions?: number[];
}

interface SettingsDialogProps {
  settings: LoadedSettings;
  onSelect: (settingName: string | undefined, scope: SettingScope) => void;
  onRestartRequest?: () => void;
  availableTerminalHeight?: number;
  config?: Config;
}

export function SettingsDialog({
  settings,
  onSelect,
  onRestartRequest,
  availableTerminalHeight,
  config,
}: SettingsDialogProps): React.JSX.Element {
  const { vimEnabled, toggleVimEnabled } = useVimMode();
  const [selectedScope, setSelectedScope] = useState<LoadableSettingScope>(
    SettingScope.User,
  );
  const [showRestartPrompt, setShowRestartPrompt] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredKeys, setFilteredKeys] = useState<string[]>(() =>
    getDialogSettingKeys(),
  );

  const { fzfInstance, searchMap } = useMemo(() => {
    const keys = getDialogSettingKeys();
    const map = new Map<string, string>();
    const searchItems: string[] = [];

    keys.forEach((key) => {
      const def = getSettingDefinition(key);
      if (def?.label) {
        searchItems.push(def.label);
        map.set(def.label.toLowerCase(), key);
      }
    });

    const fzf = new AsyncFzf(searchItems, {
      fuzzy: 'v2',
      casing: 'case-insensitive',
    });
    return { fzfInstance: fzf, searchMap: map };
  }, []);

  useEffect(() => {
    let active = true;
    if (!searchQuery.trim()) {
      setFilteredKeys(getDialogSettingKeys());
      return;
    }

    const doSearch = async () => {
      const results = await fzfInstance.find(searchQuery);
      if (!active) return;
      const matchedKeys = new Set<string>();
      results.forEach((res: FzfResult) => {
        const key = searchMap.get(res.item.toLowerCase());
        if (key) matchedKeys.add(key);
      });
      setFilteredKeys(Array.from(matchedKeys));
    };

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    doSearch();
    return () => {
      active = false;
    };
  }, [searchQuery, fzfInstance, searchMap]);

  const [pendingSettings, setPendingSettings] = useState<Settings>(() =>
    structuredClone(settings.forScope(selectedScope).settings),
  );
  const [modifiedSettings, setModifiedSettings] = useState<Set<string>>(
    new Set(),
  );
  type PendingValue = boolean | number | string;
  const [globalPendingChanges, setGlobalPendingChanges] = useState<
    Map<string, PendingValue>
  >(new Map());

  useEffect(() => {
    let updated = structuredClone(settings.forScope(selectedScope).settings);
    const newModified = new Set<string>();
    const newRestartRequired = new Set<string>();
    for (const [key, value] of globalPendingChanges.entries()) {
      const def = getSettingDefinition(key);
      if (def?.type === 'boolean' && typeof value === 'boolean') {
        updated = setPendingSettingValue(key, value, updated);
      } else if (
        (def?.type === 'number' && typeof value === 'number') ||
        (def?.type === 'string' && typeof value === 'string')
      ) {
        updated = setPendingSettingValueAny(key, value, updated);
      }
      newModified.add(key);
      if (requiresRestart(key)) newRestartRequired.add(key);
    }
    setPendingSettings(updated);
    setModifiedSettings(newModified);
    setShowRestartPrompt(newRestartRequired.size > 0);
  }, [selectedScope, settings, globalPendingChanges]);

  const maxLabelOrDescriptionWidth = useMemo(() => {
    const allKeys = getDialogSettingKeys();
    let max = 0;
    for (const key of allKeys) {
      const def = getSettingDefinition(key);
      if (!def) continue;
      const scopeMessage = getScopeMessageForSetting(
        key,
        selectedScope,
        settings,
      );
      const labelFull =
        (def.label || key) + (scopeMessage ? ` ${scopeMessage}` : '');
      max = Math.max(
        max,
        getCachedStringWidth(labelFull),
        def.description ? getCachedStringWidth(def.description) : 0,
      );
    }
    return max;
  }, [selectedScope, settings]);

  const handleToggle = (key: string) => {
    const definition = getSettingDefinition(key);
    if (!TOGGLE_TYPES.has(definition?.type)) return;

    const currentValue = getEffectiveValue(key, pendingSettings, {});
    let newValue: SettingsValue;
    if (definition?.type === 'boolean') {
      newValue = !(currentValue as boolean);
    } else if (definition?.type === 'enum' && definition.options) {
      const options = definition.options;
      const currentIndex = options.findIndex(
        (opt) => opt.value === currentValue,
      );
      newValue =
        currentIndex !== -1 && currentIndex < options.length - 1
          ? options[currentIndex + 1].value
          : options[0].value;
    }

    if (!requiresRestart(key)) {
      saveModifiedSettings(
        new Set([key]),
        setPendingSettingValueAny(
          key,
          newValue,
          settings.forScope(selectedScope).settings,
        ),
        settings,
        selectedScope,
      );
      if (key === 'general.vimMode' && newValue !== vimEnabled)
        toggleVimEnabled().catch((e) =>
          coreEvents.emitFeedback('error', 'Failed to toggle vim mode:', e),
        );
      if (key === 'general.previewFeatures')
        config?.setPreviewFeatures(newValue as boolean);

      setModifiedSettings((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setGlobalPendingChanges((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    } else {
      setModifiedSettings((prev) => new Set(prev).add(key));
      setGlobalPendingChanges((prev) =>
        new Map(prev).set(key, newValue as PendingValue),
      );
    }
  };

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState<string>('');
  const [editCursorPos, setEditCursorPos] = useState<number>(0);
  const [cursorVisible, setCursorVisible] = useState<boolean>(true);

  useEffect(() => {
    if (!editingKey) {
      setCursorVisible(true);
      return;
    }
    const id = setInterval(() => setCursorVisible((v) => !v), 500);
    return () => clearInterval(id);
  }, [editingKey]);

  const commitEdit = (key: string) => {
    const definition = getSettingDefinition(key);
    const type = definition?.type;
    if (editBuffer.trim() === '' && type === 'number') {
      setEditingKey(null);
      return;
    }

    const parsed: string | number =
      type === 'number' ? Number(editBuffer.trim()) : editBuffer;
    if (type === 'number' && Number.isNaN(parsed)) {
      setEditingKey(null);
      return;
    }

    if (!requiresRestart(key)) {
      saveModifiedSettings(
        new Set([key]),
        setPendingSettingValueAny(
          key,
          parsed,
          settings.forScope(selectedScope).settings,
        ),
        settings,
        selectedScope,
      );
      setModifiedSettings((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setGlobalPendingChanges((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    } else {
      setModifiedSettings((prev) => new Set(prev).add(key));
      setGlobalPendingChanges((prev) =>
        new Map(prev).set(key, parsed as PendingValue),
      );
    }
    setEditingKey(null);
  };

  const handleItemAction = (key: string) => {
    const definition = getSettingDefinition(key);
    if (definition?.type === 'number' || definition?.type === 'string') {
      const path = key.split('.');
      const currentValue =
        getNestedValue(pendingSettings, path) ??
        getEffectiveDefaultValue(key, config);
      setEditingKey(key);
      setEditBuffer(String(currentValue ?? ''));
      setEditCursorPos(cpLen(String(currentValue ?? '')));
    } else {
      handleToggle(key);
    }
  };

  const handleItemReset = (key: string) => {
    const defValue = getEffectiveDefaultValue(key, config);
    if (!requiresRestart(key)) {
      saveModifiedSettings(
        new Set([key]),
        setPendingSettingValueAny(
          key,
          defValue,
          settings.forScope(selectedScope).settings,
        ),
        settings,
        selectedScope,
      );
      setGlobalPendingChanges((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    } else {
      setGlobalPendingChanges((prev) =>
        new Map(prev).set(key, defValue as PendingValue),
      );
    }
  };

  useKeypress(
    (key) => {
      if (!editingKey) return;

      const { name } = key;
      if (keyMatchers[Command.RETURN](key)) {
        commitEdit(editingKey);
        return;
      }
      if (keyMatchers[Command.ESCAPE](key)) {
        setEditingKey(null);
        return;
      }
      if (name === 'backspace' && editCursorPos > 0) {
        setEditBuffer(
          (b) => cpSlice(b, 0, editCursorPos - 1) + cpSlice(b, editCursorPos),
        );
        setEditCursorPos((p) => p - 1);
        return;
      }
      if (name === 'left') {
        setEditCursorPos((p) => Math.max(0, p - 1));
        return;
      }
      if (name === 'right') {
        setEditCursorPos((p) => Math.min(cpLen(editBuffer), p + 1));
        return;
      }
      const char = stripUnsafeCharacters(key.sequence);
      if (char.length === 1) {
        setEditBuffer(
          (b) =>
            cpSlice(b, 0, editCursorPos) + char + cpSlice(b, editCursorPos),
        );
        setEditCursorPos((p) => p + 1);
      }
    },
    { isActive: true },
  );

  const saveRestartRequiredSettings = () => {
    const restartRequired = getRestartRequiredFromModified(modifiedSettings);
    if (restartRequired.length > 0) {
      saveModifiedSettings(
        new Set(restartRequired),
        pendingSettings,
        settings,
        selectedScope,
      );
      setGlobalPendingChanges((prev) => {
        const next = new Map(prev);
        restartRequired.forEach((k) => next.delete(k));
        return next;
      });
    }
  };

  const renderItem = (key: string, isActive: boolean) => {
    const def = getSettingDefinition(key);
    if (!def) return null;

    const scopeSettings = settings.forScope(selectedScope).settings;
    const isSetInScope = !isDefaultValue(key, scopeSettings);
    const defaultValue = getEffectiveDefaultValue(key, config);
    const currentValue = getEffectiveValue(key, pendingSettings, {});
    const isModified =
      modifiedSettings.has(key) || currentValue !== defaultValue;

    let displayValue: string;
    if (editingKey === key) {
      displayValue = cursorVisible
        ? cpSlice(editBuffer, 0, editCursorPos) +
          chalk.inverse(
            cpSlice(editBuffer, editCursorPos, editCursorPos + 1) || ' ',
          ) +
          cpSlice(editBuffer, editCursorPos + 1)
        : editBuffer;
    } else {
      displayValue = getDisplayValue(
        key,
        scopeSettings,
        settings.merged,
        modifiedSettings,
        pendingSettings,
      );
    }

    return (
      <DialogItem
        key={key}
        isActive={isActive}
        label={def.label}
        description={def.description}
        displayValue={displayValue}
        isModified={isModified}
        isSetInScope={isSetInScope}
        scopeMessage={getScopeMessageForSetting(key, selectedScope, settings)}
        maxLabelWidth={maxLabelOrDescriptionWidth}
      />
    );
  };

  return (
    <StandardConfigDialog
      title="Settings"
      items={filteredKeys}
      renderItem={renderItem}
      onItemAction={handleItemAction}
      onItemReset={handleItemReset}
      onClose={() => {
        saveRestartRequiredSettings();
        onSelect(undefined, selectedScope);
      }}
      enableSearch
      onSearchChange={setSearchQuery}
      searchQuery={searchQuery}
      selectedScope={selectedScope}
      onScopeChange={setSelectedScope}
      restartProps={{
        show: showRestartPrompt,
        onRestart: () => {
          saveRestartRequiredSettings();
          onRestartRequest?.();
        },
      }}
      isEditing={!!editingKey}
      editingIndex={editingKey ? filteredKeys.indexOf(editingKey) : undefined}
      availableTerminalHeight={availableTerminalHeight}
    />
  );
}
