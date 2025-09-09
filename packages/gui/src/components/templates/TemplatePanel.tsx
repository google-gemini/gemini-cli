/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useImperativeHandle, forwardRef } from 'react';
import { 
  BookTemplate, 
  Plus,
  Edit3,
  Trash2,
  Check,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { multiModelService } from '@/services/multiModelService';
import { useAppStore } from '@/stores/appStore';
import type { PresetTemplate } from '@/types';

interface TemplatePanelProps {
  onTemplateUse?: (template: PresetTemplate) => void;
}

interface TemplatePanelHandle {
  refreshTemplates: () => void;
}

export const TemplatePanel = forwardRef<TemplatePanelHandle, TemplatePanelProps>(({ onTemplateUse }, ref) => {
  const [templates, setTemplates] = useState<PresetTemplate[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editContent, setEditContent] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [createName, setCreateName] = useState<string>('');
  const [createContent, setCreateContent] = useState<string>('');
  const [createDescription, setCreateDescription] = useState<string>('');
  const [creating, setCreating] = useState<boolean>(false);
  
  const { initialized } = useAppStore();

  // Load templates when app is initialized
  React.useEffect(() => {
    if (initialized) {
      console.log('App initialized, loading templates...');
      loadTemplates();
    }
  }, [initialized]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const backendTemplates = await multiModelService.getAllTemplatesAsync();
      const customTemplates = backendTemplates.filter(template => !template.isBuiltin);
      setTemplates(customTemplates);
      console.log('Templates loaded:', customTemplates.length, 'custom templates');
    } catch (error) {
      console.error('Failed to load templates:', error);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  // Expose refresh method to parent components
  useImperativeHandle(ref, () => ({
    refreshTemplates: () => {
      loadTemplates();
    }
  }));

  const handleUseTemplate = (template: PresetTemplate) => {
    if (onTemplateUse) {
      onTemplateUse(template);
    }
  };

  const handleEditTemplate = (template: PresetTemplate) => {
    setEditingTemplate(template.id);
    setEditName(template.name);
    setEditContent(template.content || template.template);
    setEditDescription(template.description || '');
  };

  const handleSaveEdit = async () => {
    if (editingTemplate) {
      try {
        await multiModelService.updateCustomTemplate(editingTemplate, {
          name: editName.trim(),
          template: editContent.trim(),
          description: editDescription.trim() || undefined,
        });
        
        // Reload templates to get updated data
        await loadTemplates();
        
        setEditingTemplate(null);
        setEditName('');
        setEditContent('');
        setEditDescription('');
      } catch (error) {
        console.error('Failed to update template:', error);
      }
    }
  };

  const handleCancelEdit = () => {
    setEditingTemplate(null);
    setEditName('');
    setEditContent('');
    setEditDescription('');
  };

  const handleDeleteTemplate = async (templateId: string) => {
    try {
      await multiModelService.deleteCustomTemplate(templateId);
      
      // Reload templates to get updated data
      await loadTemplates();
      
      if (selectedTemplate === templateId) {
        setSelectedTemplate(null);
      }
    } catch (error) {
      console.error('Failed to delete template:', error);
    }
  };

  const handleCreateTemplate = async () => {
    if (!createName.trim() || !createContent.trim()) return;

    setCreating(true);
    try {
      const templateData = {
        id: `template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: createName.trim(),
        description: createDescription.trim() || '',
        category: 'custom',
        icon: '📝',
        template: createContent.trim(),
        variables: [],
        tags: [],
        author: 'User',
        version: '1.0.0',
        lastModified: new Date(),
        usageCount: 0
      };
      
      await multiModelService.addCustomTemplate(templateData);
      
      // Reload templates to get updated data
      await loadTemplates();
      
      // Reset form and hide it
      setCreateName('');
      setCreateContent('');
      setCreateDescription('');
      setShowCreateForm(false);
    } catch (error) {
      console.error('Failed to create template:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleCancelCreate = () => {
    setCreateName('');
    setCreateContent('');
    setCreateDescription('');
    setShowCreateForm(false);
  };


  return (
    <div className="p-4 h-full flex flex-col min-h-0">
      {/* Header */}
      <div key="template-header" className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <BookTemplate size={16} className="text-primary" />
          <span className="font-medium text-sm">Templates</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setShowCreateForm(!showCreateForm)}
          disabled={creating}
        >
          <Plus size={12} />
        </Button>
      </div>

      {/* Templates List */}
      <div key="template-list" className="space-y-1 flex-1 overflow-y-auto min-h-0">
        {loading && (
          <div key="loading-state" className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Loading templates...
          </div>
        )}
        
        {!loading && templates.length === 0 && (
          <div key="empty-state" className="text-xs text-muted-foreground py-2 text-center">
            No templates yet
            <div className="text-xs text-muted-foreground/70 mt-1">
              Save a message as template to get started
            </div>
          </div>
        )}
        
        {/* Temporarily comment out entire template list to isolate key warning issue */}
        {/* {templates.map((template) => (
          <div key={template.id} className="group bg-accent/30 rounded hover:bg-accent/50 transition-colors">
            Temporarily comment out edit mode to debug key warnings
            {editingTemplate === template.id ? (
              Edit Mode
              <div className="p-3 space-y-2">
                <Input
                  key={`edit-name-${editingTemplate}`}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Template name"
                  className="text-xs"
                />
                <textarea
                  key={`edit-content-${editingTemplate}`}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder="Template content"
                  className="w-full p-2 text-xs border rounded resize-none bg-background"
                  rows={3}
                />
                {editDescription !== undefined && (
                  <Input
                    key={`edit-desc-${editingTemplate}`}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Template description (optional)"
                    className="text-xs"
                  />
                )}
                <div key={`edit-actions-${editingTemplate}`} className="flex gap-1">
                  <Button
                    key={`save-edit-${editingTemplate}`}
                    variant="ghost"
                    size="sm"
                    onClick={handleSaveEdit}
                    className="flex-1 h-6 text-xs bg-green-500/20 hover:bg-green-500/30 text-green-600"
                  >
                    <Check size={10} className="mr-1" />
                    Save
                  </Button>
                  <Button
                    key={`cancel-edit-${editingTemplate}`}
                    variant="ghost"
                    size="sm"
                    onClick={handleCancelEdit}
                    className="flex-1 h-6 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-600"
                  >
                    <X size={10} className="mr-1" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              Normal Display Mode - simplified for debugging
              <div className="p-3 cursor-pointer" onClick={() => handleUseTemplate(template)}>
                Temporarily comment out all nested elements with keys to debug
                <div>
                  {template.name} - {template.content || template.template}
                </div>
                
                Comment out all nested divs with keys
                Template Content - Prominent Display
                <div key={`content-${template.id}`} className="text-sm font-medium text-foreground mb-2 line-clamp-3 leading-relaxed">
                  {template.content || template.template}
                </div>
                
                Template Name and Actions
                <div key={`header-${template.id}`} className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground truncate flex-1" title={template.name}>
                    {template.name}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                    <Button
                      key={`edit-${template.id}`}
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditTemplate(template);
                      }}
                      className="h-5 w-5 hover:bg-blue-500/20 hover:text-blue-500"
                      title="Edit template"
                    >
                      <Edit3 size={10} />
                    </Button>
                    <Button
                      key={`delete-${template.id}`}
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTemplate(template.id);
                      }}
                      className="h-5 w-5 hover:bg-destructive/20 hover:text-destructive"
                      title="Delete template"
                    >
                      <Trash2 size={10} />
                    </Button>
                  </div>
                </div>
                
                Date - Below everything
                <div key={`date-${template.id}`} className="text-xs text-muted-foreground/60">
                  {new Date(template.lastModified).toLocaleDateString()}
                </div>
              </div>
            )}
          </div>
        ))} */}
        
        {/* Template list with proper data filtering to prevent React key warnings */}
        {templates
          .filter(template => template.id && (template.name || template.content || template.template))
          .map((template) => (
          <div key={template.id} className="group bg-accent/30 rounded hover:bg-accent/50 transition-colors">
            {editingTemplate === template.id ? (
              /* Edit Mode */
              <div className="p-3 space-y-2">
                <Input
                  key={`edit-name-${editingTemplate}`}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Template name"
                  className="text-xs"
                />
                <textarea
                  key={`edit-content-${editingTemplate}`}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder="Template content"
                  className="w-full p-2 text-xs border rounded resize-none bg-background"
                  rows={3}
                />
                {editDescription !== undefined && (
                  <Input
                    key={`edit-desc-${editingTemplate}`}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Template description (optional)"
                    className="text-xs"
                  />
                )}
                <div key={`edit-actions-${editingTemplate}`} className="flex gap-1">
                  <Button
                    key={`save-edit-${editingTemplate}`}
                    variant="ghost"
                    size="sm"
                    onClick={handleSaveEdit}
                    className="flex-1 h-6 text-xs bg-green-500/20 hover:bg-green-500/30 text-green-600"
                  >
                    <Check size={10} className="mr-1" />
                    Save
                  </Button>
                  <Button
                    key={`cancel-edit-${editingTemplate}`}
                    variant="ghost"
                    size="sm"
                    onClick={handleCancelEdit}
                    className="flex-1 h-6 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-600"
                  >
                    <X size={10} className="mr-1" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              /* Normal Display Mode */
              <div className="p-3 cursor-pointer" onClick={() => handleUseTemplate(template)}>
                {/* Template Content - Prominent Display */}
                <div key={`content-${template.id}`} className="text-sm font-medium text-foreground mb-2 line-clamp-3 leading-relaxed">
                  {template.content || template.template || 'No content'}
                </div>
                
                {/* Template Name and Actions */}
                <div key={`header-${template.id}`} className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground truncate flex-1" title={template.name}>
                    {template.name || 'Unnamed Template'}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                    <Button
                      key={`edit-${template.id}`}
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditTemplate(template);
                      }}
                      className="h-5 w-5 hover:bg-blue-500/20 hover:text-blue-500"
                      title="Edit template"
                    >
                      <Edit3 size={10} />
                    </Button>
                    <Button
                      key={`delete-${template.id}`}
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTemplate(template.id);
                      }}
                      className="h-5 w-5 hover:bg-destructive/20 hover:text-destructive"
                      title="Delete template"
                    >
                      <Trash2 size={10} />
                    </Button>
                  </div>
                </div>
                
                {/* Date - Below everything */}
                <div key={`date-${template.id}`} className="text-xs text-muted-foreground/60">
                  {new Date(template.lastModified).toLocaleDateString()}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Create Template Form */}
      {showCreateForm && (
        <div key="create-form" className="mt-3 p-3 bg-accent/10 rounded border flex-shrink-0">
          <div className="space-y-2">
            <Input
              key="create-name-input"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="Template name"
              className="text-xs"
            />
            <textarea
              key="create-content-textarea"
              value={createContent}
              onChange={(e) => setCreateContent(e.target.value)}
              placeholder="Template content (required)"
              className="w-full p-2 text-xs border rounded resize-none bg-background"
              rows={4}
            />
            <Input
              key="create-desc-input"
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              placeholder="Template description (optional)"
              className="text-xs"
            />
            <div key="create-actions" className="flex gap-1">
              <Button
                key="create-template-btn"
                variant="ghost"
                size="sm"
                onClick={handleCreateTemplate}
                disabled={!createName.trim() || !createContent.trim() || creating}
                className="flex-1 h-6 text-xs bg-green-500/20 hover:bg-green-500/30 text-green-600"
              >
                <Check size={10} className="mr-1" />
                {creating ? 'Creating...' : 'Create'}
              </Button>
              <Button
                key="cancel-create-btn"
                variant="ghost"
                size="sm"
                onClick={handleCancelCreate}
                disabled={creating}
                className="flex-1 h-6 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-600"
              >
                <X size={10} className="mr-1" />
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

TemplatePanel.displayName = 'TemplatePanel';