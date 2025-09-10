/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { getLanguageMap, saveLanguageMap } from '../utils/language';
import './LanguageMappingsManager.css';

export function LanguageMappingsManager() {
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [newExtension, setNewExtension] = useState('');
  const [newLanguage, setNewLanguage] = useState('');

  useEffect(() => {
    const fetchLanguageMap = async () => {
      const map = await getLanguageMap();
      setMappings(map);
    };
    fetchLanguageMap();
  }, []);

  const handleAddMapping = () => {
    if (newExtension && newLanguage) {
      const ext = newExtension.startsWith('.')
        ? newExtension.substring(1)
        : newExtension;
      if (ext) {
        const newMappings = { ...mappings, [ext]: newLanguage };
        setMappings(newMappings);
        saveLanguageMap(newMappings);
        setNewExtension('');
        setNewLanguage('');
      }
    }
  };

  const handleRemoveMapping = (extension: string) => {
    const newMappings = { ...mappings };
    delete newMappings[extension];
    setMappings(newMappings);
    saveLanguageMap(newMappings);
  };

  return (
    <div className="language-mappings-manager">
      <div className="mappings-list">
        {Object.entries(mappings).map(([extension, language]) => (
          <div key={extension} className="mapping-item">
            <span>
              .{extension} &rarr; {language}
            </span>
            <button
              className="remove-button"
              onClick={() => handleRemoveMapping(extension)}
            >
              &times;
            </button>
          </div>
        ))}
      </div>
      <div className="add-mapping-form">
        <input
          type="text"
          placeholder=".ext"
          value={newExtension}
          onChange={(e) => setNewExtension(e.target.value)}
        />
        <input
          type="text"
          placeholder="language"
          value={newLanguage}
          onChange={(e) => setNewLanguage(e.target.value)}
        />
        <button onClick={handleAddMapping}>Add</button>
      </div>
    </div>
  );
}
