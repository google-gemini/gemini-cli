import React from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ChatArea } from './ChatArea';
import { useAppStore } from '@/stores/appStore';
import { cn } from '@/utils/cn';

export const AppLayout: React.FC = () => {
  const { sidebarCollapsed } = useAppStore();

  // Note: Role and model loading is handled in App.tsx to avoid duplication

  return (
    <div className="flex h-full bg-background text-foreground overflow-hidden">
      <Sidebar />
      <div className={cn(
        "flex-1 flex flex-col transition-all duration-300 ease-in-out",
        sidebarCollapsed ? "ml-16" : "ml-80"
      )}>
        <Header />
        <ChatArea />
      </div>
    </div>
  );
};