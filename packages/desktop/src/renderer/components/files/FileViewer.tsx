import { useState } from 'react';

interface OpenFile {
  path: string;
  name: string;
  content: string;
}

export function FileViewer(): JSX.Element {
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  // Placeholder - this will be wired up to actual file watching
  const activeFile = openFiles[activeIndex];

  return (
    <div className="flex flex-col h-full bg-neutral-50 dark:bg-neutral-850">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-2 py-1 bg-neutral-100 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700 overflow-x-auto">
        {openFiles.length > 0 ? (
          openFiles.map((file, index) => (
            <button
              key={file.path}
              onClick={() => setActiveIndex(index)}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-t-md transition-colors ${
                index === activeIndex
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100'
                  : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
              }`}
            >
              <span className="truncate max-w-[120px]">{file.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenFiles((files) => files.filter((_, i) => i !== index));
                  if (activeIndex >= openFiles.length - 1) {
                    setActiveIndex(Math.max(0, openFiles.length - 2));
                  }
                }}
                className="p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700"
              >
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </button>
          ))
        ) : (
          <span className="text-sm text-neutral-400 px-3 py-1.5">
            No files open
          </span>
        )}
      </div>

      {/* File content */}
      <div className="flex-1 overflow-auto">
        {activeFile ? (
          <pre className="p-4 text-sm font-mono text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap">
            {activeFile.content}
          </pre>
        ) : (
          <div className="flex items-center justify-center h-full text-neutral-400">
            <div className="text-center space-y-2">
              <svg
                className="w-12 h-12 mx-auto opacity-50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <p className="text-sm">
                Files modified by tools will appear here
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
