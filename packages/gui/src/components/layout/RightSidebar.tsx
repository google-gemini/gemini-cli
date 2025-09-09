import React, { useImperativeHandle, forwardRef } from 'react';
import { DirectoryPanel } from '../workspace/DirectoryPanel';
import { TemplatePanel } from '../templates/TemplatePanel';
import type { PresetTemplate } from '@/types';

interface RightSidebarProps {
  onTemplateUse?: (template: PresetTemplate) => void;
}

interface RightSidebarHandle {
  refreshTemplates: () => void;
}

export const RightSidebar = forwardRef<RightSidebarHandle, RightSidebarProps>(({ onTemplateUse }, ref) => {
  const templatePanelRef = React.useRef<{ refreshTemplates: () => void }>(null);

  useImperativeHandle(ref, () => ({
    refreshTemplates: () => {
      templatePanelRef.current?.refreshTemplates();
    }
  }));
  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-card border-l border-border flex flex-col z-40">
      {/* Directory Panel - 上半部分 */}
      <div className="flex-1 min-h-0">
        <DirectoryPanel />
      </div>
      
      {/* Template Panel - 下半部分 */}
      <div className="flex-1 min-h-0 border-t border-border">
        <TemplatePanel ref={templatePanelRef} onTemplateUse={onTemplateUse} />
      </div>
    </div>
  );
});