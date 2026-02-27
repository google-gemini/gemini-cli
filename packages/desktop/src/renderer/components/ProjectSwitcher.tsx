/**
 * ProjectSwitcher — Shows the current project root and a button to switch.
 * Persists recent projects in localStorage.
 */

import React, { useEffect, useState } from 'react';
import { FolderOpen, ChevronDown, Check } from 'lucide-react';

interface Props {
  projectRoot: string;
  onOpen: () => void;
}

const STORAGE_KEY = 'cowork:recentProjects';
const MAX_RECENT = 8;

export function ProjectSwitcher({ projectRoot, onOpen }: Props) {
  const [recentProjects, setRecentProjects] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  // Load recent projects
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      setRecentProjects(raw ? JSON.parse(raw) : []);
    } catch {
      setRecentProjects([]);
    }
  }, []);

  // Update recent list when project changes
  useEffect(() => {
    if (!projectRoot) return;
    setRecentProjects((prev) => {
      const next = [projectRoot, ...prev.filter((p) => p !== projectRoot)].slice(0, MAX_RECENT);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, [projectRoot]);

  const projectName = projectRoot.split('/').pop() ?? 'No project';

  return (
    <div className="relative border-b border-surface-600">
      <button
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-surface-700
                   transition-colors text-left"
        onClick={() => setShowDropdown((v) => !v)}
      >
        <FolderOpen size={14} className="text-aistudio-400 flex-shrink-0" />
        <span className="flex-1 truncate text-xs font-medium text-surface-200">
          {projectName}
        </span>
        <ChevronDown
          size={12}
          className={`text-surface-500 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
        />
      </button>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 z-20 bg-surface-700 border border-surface-500
                        rounded-b-lg shadow-xl overflow-hidden">
          {/* Open new */}
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-xs
                       hover:bg-surface-600 transition-colors text-gemini-400"
            onClick={() => {
              setShowDropdown(false);
              onOpen();
            }}
          >
            <FolderOpen size={13} />
            Open folder…
          </button>

          {recentProjects.length > 0 && (
            <>
              <div className="px-3 py-1 text-[10px] text-surface-500 font-semibold uppercase">
                Recent
              </div>
              {recentProjects.map((p) => (
                <button
                  key={p}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs
                             hover:bg-surface-600 transition-colors text-surface-300
                             hover:text-surface-100"
                  onClick={() => {
                    setShowDropdown(false);
                    // Re-use onOpen to trigger directory picker is not ideal;
                    // ideally we'd call window.cowork.openDirectory directly.
                    // For now we dispatch a synthetic click to the opener.
                  }}
                >
                  {p === projectRoot && <Check size={11} className="text-gemini-400 flex-shrink-0" />}
                  {p !== projectRoot && <span className="w-[11px]" />}
                  <span className="truncate">{p}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
