import { create } from 'zustand';

interface UIState {
  showFileViewer: boolean;
  sidebarWidth: number;
  toggleFileViewer: () => void;
  setShowFileViewer: (show: boolean) => void;
  setSidebarWidth: (width: number) => void;
}

export const useUIStore = create<UIState>((set) => ({
  showFileViewer: true,
  sidebarWidth: 50,

  toggleFileViewer: () =>
    set((state) => ({ showFileViewer: !state.showFileViewer })),

  setShowFileViewer: (show) => set({ showFileViewer: show }),

  setSidebarWidth: (width) => set({ sidebarWidth: width }),
}));
