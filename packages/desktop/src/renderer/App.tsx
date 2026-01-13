import { useState, useEffect } from 'react';
import { TitleBar } from './components/layout/TitleBar';
import { SplitPane } from './components/layout/SplitPane';
import { ChatView } from './components/chat/ChatView';
import { FileViewer } from './components/files/FileViewer';
import { useGemini } from './hooks/useGemini';
import { useUIStore } from './stores/uiStore';

export default function App(): JSX.Element {
  const [isInitialized, setIsInitialized] = useState(false);
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const { showFileViewer, toggleFileViewer } = useUIStore();
  const gemini = useGemini();

  // Initialize Gemini when project is selected
  useEffect(() => {
    if (projectPath && !isInitialized) {
      window.api.gemini
        .initialize({ targetDir: projectPath })
        .then(() => {
          setIsInitialized(true);
        })
        .catch((error) => {
          console.error('Failed to initialize:', error);
        });
    }
  }, [projectPath, isInitialized]);

  // Handle menu events
  useEffect(() => {
    const cleanups = [
      window.api.menu.onToggleFileViewer(toggleFileViewer),
      window.api.menu.onStopGeneration(gemini.abort),
      window.api.menu.onClearConversation(() => {
        gemini.clearMessages();
        window.api.gemini.reset();
      }),
      window.api.menu.onNewConversation(() => {
        gemini.clearMessages();
        window.api.gemini.reset();
      }),
      window.api.menu.onOpenProject(() => {
        // TODO: Open folder picker dialog
        console.log('Open project picker');
      }),
    ];

    return () => cleanups.forEach((cleanup) => cleanup());
  }, [gemini, toggleFileViewer]);

  // Project selection screen
  if (!projectPath) {
    return (
      <div className="flex flex-col h-screen">
        <TitleBar title="Gemini Desktop" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-6 p-8">
            <h1 className="text-2xl font-semibold">Welcome to Gemini Desktop</h1>
            <p className="text-neutral-500 dark:text-neutral-400">
              Select a project folder to get started
            </p>
            <button
              onClick={async () => {
                const folder = await window.api.dialog.openFolder();
                if (folder) {
                  setProjectPath(folder);
                }
              }}
              className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
            >
              Open Project Folder
            </button>
            <p className="text-sm text-neutral-400">
              Or drag and drop a folder here
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TitleBar title={projectPath.split('/').pop() || 'Gemini Desktop'} />

      <div className="flex-1 overflow-hidden">
        {showFileViewer ? (
          <SplitPane
            left={<ChatView gemini={gemini} />}
            right={<FileViewer />}
            defaultLeftWidth={50}
            minLeftWidth={30}
            maxLeftWidth={70}
          />
        ) : (
          <ChatView gemini={gemini} />
        )}
      </div>
    </div>
  );
}
