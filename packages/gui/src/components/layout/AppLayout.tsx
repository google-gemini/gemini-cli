import React, { useRef } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ChatArea } from './ChatArea';
import { RightSidebar } from './RightSidebar';
import type { PresetTemplate } from '@/types';

export const AppLayout: React.FC = () => {
  const messageInputRef = useRef<{ setMessage: (message: string) => void }>(null);
  const rightSidebarRef = useRef<{ refreshTemplates: () => void }>(null);

  const handleTemplateUse = (template: PresetTemplate) => {
    // Fill the message input with template content
    messageInputRef.current?.setMessage(template.content || template.template);
  };

  // Function to refresh templates - this can be called from child components
  const handleTemplateRefresh = () => {
    rightSidebarRef.current?.refreshTemplates();
  };

  // Note: Role and model loading is handled in App.tsx to avoid duplication

  return (
    <div className="flex h-full bg-background text-foreground overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col mr-80">
        <Header />
        <ChatArea ref={messageInputRef} onTemplateRefresh={handleTemplateRefresh} />
      </div>
      <RightSidebar ref={rightSidebarRef} onTemplateUse={handleTemplateUse} />
    </div>
  );
};