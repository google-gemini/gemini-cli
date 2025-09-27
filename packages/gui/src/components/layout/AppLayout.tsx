/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useRef, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ChatArea } from './ChatArea';
import { RightSidebar } from './RightSidebar';
import { useAppStore } from '@/stores/appStore';
import type { PresetTemplate } from '@/types';

export const AppLayout: React.FC = () => {
  const messageInputRef = useRef<{ setMessage: (message: string) => void }>(null);
  const rightSidebarRef = useRef<{ refreshTemplates: () => void }>(null);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const { sidebarCollapsed } = useAppStore();

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
      <div className={`flex-1 flex flex-col ${sidebarCollapsed ? 'ml-16' : ''} ${isRightSidebarOpen ? 'mr-80' : ''}`}>
        <Header
          isRightSidebarOpen={isRightSidebarOpen}
          onToggleRightSidebar={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
        />
        <ChatArea ref={messageInputRef} onTemplateRefresh={handleTemplateRefresh} />
      </div>
      {isRightSidebarOpen && (
        <RightSidebar ref={rightSidebarRef} onTemplateUse={handleTemplateUse} />
      )}
    </div>
  );
};