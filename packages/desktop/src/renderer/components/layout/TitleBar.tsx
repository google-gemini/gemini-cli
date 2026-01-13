interface TitleBarProps {
  title: string;
}

export function TitleBar({ title }: TitleBarProps): JSX.Element {
  return (
    <div className="titlebar-drag h-12 flex items-center justify-center bg-neutral-100/80 dark:bg-neutral-800/80 backdrop-blur-xl border-b border-neutral-200 dark:border-neutral-700">
      {/* Traffic light buttons space (macOS) */}
      <div className="absolute left-0 w-20" />

      {/* Title */}
      <span className="text-sm font-medium text-neutral-600 dark:text-neutral-300">
        {title}
      </span>

      {/* Right side actions (optional) */}
      <div className="absolute right-4 flex items-center gap-2 titlebar-no-drag">
        {/* Settings button */}
        <button
          onClick={() => window.api.menu.onPreferences(() => {})}
          className="p-1.5 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
          title="Settings"
        >
          <svg
            className="w-4 h-4 text-neutral-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
