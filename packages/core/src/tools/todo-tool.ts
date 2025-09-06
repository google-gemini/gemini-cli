/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
} from './tools.js';
import type { ToolResult } from './tools.js';
import { SessionManager } from '../sessions/SessionManager.js';
import type { SessionData } from '../sessions/SessionManager.js';

// Task priority levels
export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// Task status states
export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  BLOCKED = 'blocked',
  CANCELLED = 'cancelled',
  PAUSED = 'paused'
}

// Core task data structure
export interface TodoTask {
  id: string;
  content: string;         // "Implement user authentication"
  activeForm: string;      // "Implementing user authentication"
  status: TaskStatus;
  priority: TaskPriority;
  dependencies: string[];  // IDs of tasks this task depends on
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  
  // LLM decision support information
  lifecycle: {
    pausedAt?: Date;
    pauseReason?: string;
    resumeCondition?: string;
    cancelledAt?: Date;
    cancelReason?: string;
    estimatedDuration?: number;  // Estimated duration in minutes
    actualDuration?: number;     // Actual duration in minutes
  };
  
  // Context information
  context: {
    lastMentioned?: Date;       // Last time task was mentioned
    mentionCount: number;       // Number of times mentioned
    relatedTopics: string[];    // Related conversation topics
    urgency?: 'low' | 'medium' | 'high' | 'immediate';
  };
}

// Extend existing SessionData interface
declare module '../sessions/SessionManager.js' {
  interface SessionData {
    todos?: TodoTask[];
  }
}

// Tool parameters
interface TodoParams {
  action: 'add' | 'update' | 'list' | 'clear' | 'check_dependencies' | 
          'pause' | 'resume' | 'cancel' | 'archive' | 'get_context';
  taskId?: string;
  content?: string;
  activeForm?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dependencies?: string[];
  
  // Context information for LLM decision support
  contextInfo?: {
    reason?: string;           // Operation reason
    estimatedDuration?: number; // Estimated duration in minutes
    resumeCondition?: string;  // Resume condition
    relatedTopics?: string[];  // Related conversation topics
    urgency?: 'low' | 'medium' | 'high' | 'immediate';
  };
  
  filters?: {
    priority?: TaskPriority[];
    status?: TaskStatus[];
    canStart?: boolean;
    daysSinceUpdate?: number;  // Filter by days since last update
  };
}

// Tool result
interface TodoResult extends ToolResult {
  llmContent: string;
  returnDisplay: string;
  tasks: Array<{
    id: string;
    content: string;
    status: TaskStatus;
    priority: TaskPriority;
    statusIcon: string;
    priorityIcon: string;
    dependsOn: string[];
    blockedBy: string[];
    canStart: boolean;
    createdAt: string;
    daysSinceUpdate: number;
    lifecycle?: {
      pausedAt?: string;
      pauseReason?: string;
      resumeCondition?: string;
    };
    context?: {
      lastMentioned?: string;
      mentionCount: number;
      urgency?: string;
    };
  }>;
  
  summary: {
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    blocked: number;
    cancelled: number;
    paused: number;
    canStart: number;
  };
  
  dependencyGraph?: {
    nodes: Array<{ id: string; label: string; status: TaskStatus }>;
    edges: Array<{ from: string; to: string }>;
  };
  
  // LLM decision support information
  decisionSupport?: {
    staleTasks: Array<{          // Tasks with no recent activity
      id: string;
      daysSinceUpdate: number;
      lastActivity: string;
    }>;
    
    contextSwitches: number;     // Number of context switches
    
    recommendations: Array<{     // Data-based recommendations
      type: 'pause' | 'cancel' | 'prioritize';
      taskId: string;
      reason: string;
      confidence: number;        // Confidence level 0-1
    }>;
  };
}

// Status and priority icon mappings
const STATUS_ICONS: Record<TaskStatus, string> = {
  [TaskStatus.PENDING]: '⏳',
  [TaskStatus.IN_PROGRESS]: '🔄',
  [TaskStatus.COMPLETED]: '✅',
  [TaskStatus.BLOCKED]: '🚫',
  [TaskStatus.CANCELLED]: '❌',
  [TaskStatus.PAUSED]: '⏸️'
};

const PRIORITY_ICONS: Record<TaskPriority, string> = {
  [TaskPriority.CRITICAL]: '🔴',
  [TaskPriority.HIGH]: '🟡',
  [TaskPriority.MEDIUM]: '🟢',
  [TaskPriority.LOW]: '⚪'
};

class TodoInvocation extends BaseToolInvocation<TodoParams, TodoResult> {
  constructor(params: TodoParams) {
    super(params);
  }

  getDescription(): string {
    const { action, content, taskId } = this.params;
    
    switch (action) {
      case 'add':
        return `Add new task: "${content}"`;
      case 'update':
        return `Update task ${taskId}`;
      case 'list':
        return 'List current tasks';
      case 'clear':
        return 'Clear all tasks';
      case 'check_dependencies':
        return 'Check task dependencies';
      default:
        return 'Manage TODO tasks';
    }
  }

  async execute(_signal: AbortSignal): Promise<TodoResult> {
    const sessionManager = SessionManager.getInstance();
    const sessionId = sessionManager.getCurrentSessionId();
    
    if (!sessionId) {
      throw new Error('No active session found');
    }

    const sessions = (sessionManager as unknown as { sessions: Map<string, SessionData> }).sessions;
    const session = sessions.get(sessionId);
    
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Get current todos
    let todos = session.todos || [];

    switch (this.params.action) {
      case 'add':
        todos = this.addTask(todos);
        break;
      case 'update':
        todos = this.updateTask(todos);
        break;
      case 'pause':
        todos = this.pauseTask(todos);
        break;
      case 'resume':
        todos = this.resumeTask(todos);
        break;
      case 'cancel':
        todos = this.cancelTask(todos);
        break;
      case 'archive':
        todos = this.archiveTasks(todos);
        break;
      case 'clear':
        todos = [];
        break;
      case 'list':
      case 'check_dependencies':
      case 'get_context':
        // Read-only operations, don't modify todos
        break;
      default:
        break;
    }

    // Update blocked task statuses
    todos = this.updateBlockedTasks(todos);

    // Save back to session
    if (this.params.action !== 'list' && this.params.action !== 'check_dependencies' && this.params.action !== 'get_context') {
      session.todos = todos;
      sessionManager.updateSessionMetadata(sessionId, {});
    }

    // Apply filters
    const filteredTasks = this.applyFilters(todos);
    
    // Sort by priority and dependencies
    const sortedTasks = this.sortTasks(filteredTasks, todos);

    return this.buildResult(sortedTasks, todos);
  }

  private addTask(todos: TodoTask[]): TodoTask[] {
    const { content, activeForm, priority = TaskPriority.MEDIUM, dependencies = [], contextInfo } = this.params;
    
    if (!content) {
      throw new Error('Task content is required');
    }

    const newTask: TodoTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      content,
      activeForm: activeForm || content,
      status: TaskStatus.PENDING,
      priority,
      dependencies,
      createdAt: new Date(),
      updatedAt: new Date(),
      lifecycle: {
        estimatedDuration: contextInfo?.estimatedDuration
      },
      context: {
        mentionCount: 1,
        relatedTopics: contextInfo?.relatedTopics || [],
        urgency: contextInfo?.urgency,
        lastMentioned: new Date()
      }
    };

    return [...todos, newTask];
  }

  private updateTask(todos: TodoTask[]): TodoTask[] {
    const { taskId, content, activeForm, status, priority, dependencies } = this.params;
    
    if (!taskId) {
      throw new Error('Task ID is required for update');
    }

    return todos.map(task => {
      if (task.id === taskId) {
        const updatedTask: TodoTask = {
          ...task,
          ...(content && { content }),
          ...(activeForm && { activeForm }),
          ...(status && { status }),
          ...(priority && { priority }),
          ...(dependencies && { dependencies }),
          updatedAt: new Date()
        };

        if (status === TaskStatus.COMPLETED && !task.completedAt) {
          updatedTask.completedAt = new Date();
        }

        return updatedTask;
      }
      return task;
    });
  }

  private pauseTask(todos: TodoTask[]): TodoTask[] {
    const { taskId, contextInfo } = this.params;
    
    if (!taskId) {
      throw new Error('Task ID is required for pause');
    }

    return todos.map(task => {
      if (task.id === taskId) {
        return {
          ...task,
          status: TaskStatus.PAUSED,
          updatedAt: new Date(),
          lifecycle: {
            ...task.lifecycle,
            pausedAt: new Date(),
            pauseReason: contextInfo?.reason,
            resumeCondition: contextInfo?.resumeCondition
          }
        };
      }
      return task;
    });
  }

  private resumeTask(todos: TodoTask[]): TodoTask[] {
    const { taskId } = this.params;
    
    if (!taskId) {
      throw new Error('Task ID is required for resume');
    }

    return todos.map(task => {
      if (task.id === taskId && task.status === TaskStatus.PAUSED) {
        return {
          ...task,
          status: TaskStatus.PENDING,
          updatedAt: new Date(),
          context: {
            ...task.context,
            lastMentioned: new Date(),
            mentionCount: task.context.mentionCount + 1
          }
        };
      }
      return task;
    });
  }

  private cancelTask(todos: TodoTask[]): TodoTask[] {
    const { taskId, contextInfo } = this.params;
    
    if (!taskId) {
      throw new Error('Task ID is required for cancel');
    }

    return todos.map(task => {
      if (task.id === taskId) {
        return {
          ...task,
          status: TaskStatus.CANCELLED,
          updatedAt: new Date(),
          lifecycle: {
            ...task.lifecycle,
            cancelledAt: new Date(),
            cancelReason: contextInfo?.reason
          }
        };
      }
      return task;
    });
  }

  private archiveTasks(todos: TodoTask[]): TodoTask[] {
    // Remove completed and cancelled tasks older than 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return todos.filter(task => {
      if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.CANCELLED) {
        return task.updatedAt > thirtyDaysAgo;
      }
      return true;
    });
  }

  // Check if task can start (all dependencies completed)
  private canTaskStart(task: TodoTask, allTasks: TodoTask[]): boolean {
    if (!task.dependencies || task.dependencies.length === 0) {
      return true;
    }
    
    return task.dependencies.every(depId => {
      const depTask = allTasks.find(t => t.id === depId);
      return depTask?.status === TaskStatus.COMPLETED;
    });
  }

  // Get dependencies blocking current task
  private getBlockingDependencies(task: TodoTask, allTasks: TodoTask[]): string[] {
    if (!task.dependencies) return [];
    
    return task.dependencies.filter(depId => {
      const depTask = allTasks.find(t => t.id === depId);
      return depTask?.status !== TaskStatus.COMPLETED;
    });
  }

  // Auto-update blocked task statuses
  private updateBlockedTasks(todos: TodoTask[]): TodoTask[] {
    return todos.map(task => {
      if (task.status === TaskStatus.PENDING) {
        const canStart = this.canTaskStart(task, todos);
        if (!canStart) {
          return { ...task, status: TaskStatus.BLOCKED, updatedAt: new Date() };
        }
      } else if (task.status === TaskStatus.BLOCKED) {
        const canStart = this.canTaskStart(task, todos);
        if (canStart) {
          return { ...task, status: TaskStatus.PENDING, updatedAt: new Date() };
        }
      }
      return task;
    });
  }

  // Apply filters
  private applyFilters(todos: TodoTask[]): TodoTask[] {
    const { filters } = this.params;
    if (!filters) return todos;

    return todos.filter(task => {
      // Priority filter
      if (filters.priority && !filters.priority.includes(task.priority)) {
        return false;
      }

      // Status filter
      if (filters.status && !filters.status.includes(task.status)) {
        return false;
      }

      // Can start filter
      if (filters.canStart !== undefined) {
        const canStart = this.canTaskStart(task, todos);
        if (filters.canStart !== canStart) {
          return false;
        }
      }

      return true;
    });
  }

  // Sort by priority and dependencies
  private sortTasks(tasks: TodoTask[], allTasks: TodoTask[]): TodoTask[] {
    const priorityOrder: Record<TaskPriority, number> = {
      [TaskPriority.CRITICAL]: 4,
      [TaskPriority.HIGH]: 3,
      [TaskPriority.MEDIUM]: 2,
      [TaskPriority.LOW]: 1
    };
    
    return [...tasks].sort((a, b) => {
      // First sort by whether can start
      const aCanStart = this.canTaskStart(a, allTasks);
      const bCanStart = this.canTaskStart(b, allTasks);
      if (aCanStart !== bCanStart) {
        return bCanStart ? 1 : -1;
      }
      
      // Then sort by priority
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  // Build result
  private buildResult(filteredTasks: TodoTask[], allTasks: TodoTask[]): TodoResult {
    const now = new Date();
    const tasks = filteredTasks.map(task => ({
      id: task.id,
      content: task.content,
      status: task.status,
      priority: task.priority,
      statusIcon: STATUS_ICONS[task.status],
      priorityIcon: PRIORITY_ICONS[task.priority],
      dependsOn: task.dependencies,
      blockedBy: this.getBlockingDependencies(task, allTasks),
      canStart: this.canTaskStart(task, allTasks),
      createdAt: task.createdAt.toISOString(),
      daysSinceUpdate: Math.floor((now.getTime() - task.updatedAt.getTime()) / (1000 * 60 * 60 * 24)),
      lifecycle: task.lifecycle.pausedAt ? {
        pausedAt: task.lifecycle.pausedAt.toISOString(),
        pauseReason: task.lifecycle.pauseReason,
        resumeCondition: task.lifecycle.resumeCondition
      } : undefined,
      context: {
        lastMentioned: task.context.lastMentioned?.toISOString(),
        mentionCount: task.context.mentionCount,
        urgency: task.context.urgency
      }
    }));

    // Calculate summary
    const summary = {
      total: allTasks.length,
      completed: allTasks.filter(t => t.status === TaskStatus.COMPLETED).length,
      inProgress: allTasks.filter(t => t.status === TaskStatus.IN_PROGRESS).length,
      pending: allTasks.filter(t => t.status === TaskStatus.PENDING).length,
      blocked: allTasks.filter(t => t.status === TaskStatus.BLOCKED).length,
      cancelled: allTasks.filter(t => t.status === TaskStatus.CANCELLED).length,
      paused: allTasks.filter(t => t.status === TaskStatus.PAUSED).length,
      canStart: allTasks.filter(t => this.canTaskStart(t, allTasks)).length
    };

    // Build dependency graph if has dependencies
    const dependencyGraph = this.buildDependencyGraph(allTasks);

    // Build decision support information
    const decisionSupport = this.buildDecisionSupport(allTasks);

    const result: TodoResult = {
      llmContent: this.buildLLMContent(this.params.action, summary, decisionSupport),
      returnDisplay: this.formatDisplayMessage(summary, tasks.slice(0, 5)),
      tasks,
      summary,
      ...(dependencyGraph && { dependencyGraph }),
      ...(decisionSupport && { decisionSupport })
    };

    return result;
  }

  // Build content specifically for LLM consumption
  private buildLLMContent(
    action: string, 
    summary: TodoResult['summary'], 
    decisionSupport: TodoResult['decisionSupport']
  ): string {
    let content = '';
    
    switch (action) {
      case 'add':
        content = `Task added successfully. Total tasks: ${summary.total}`;
        break;
      case 'update':
        content = `Task updated successfully.`;
        break;
      case 'pause':
        content = `Task paused. You can resume it later when ready.`;
        break;
      case 'resume':
        content = `Task resumed and ready to continue.`;
        break;
      case 'cancel':
        content = `Task cancelled successfully.`;
        break;
      case 'list':
      case 'get_context':
        content = `Current status: ${summary.total} tasks (${summary.completed} completed, ${summary.inProgress} in progress, ${summary.pending} pending, ${summary.paused} paused)`;
        
        // Add decision support information for LLM
        if (decisionSupport?.staleTasks && decisionSupport.staleTasks.length > 0) {
          content += `\n\nDecision support: Found ${decisionSupport.staleTasks.length} stale tasks that haven't been updated recently. Consider pausing or cancelling them.`;
        }
        
        if (decisionSupport?.recommendations && decisionSupport.recommendations.length > 0) {
          const highConfidenceRecs = decisionSupport.recommendations.filter(r => r.confidence > 0.7);
          if (highConfidenceRecs.length > 0) {
            content += `\n\nRecommendations: ${highConfidenceRecs.map(r => `${r.type} task ${r.taskId} (${r.reason})`).join(', ')}`;
          }
        }
        break;
      case 'clear':
        content = `All tasks cleared.`;
        break;
      case 'archive':
        content = `Old completed/cancelled tasks archived.`;
        break;
      default:
        content = `Task operation completed. Status: ${summary.total} total tasks`;
    }
    
    return content;
  }

  // Format display message for users
  private formatDisplayMessage(summary: TodoResult['summary'], tasks: TodoResult['tasks']): string {
    let display = `## TODO Tasks\n\n`;
    display += `**Summary:** ${summary.total} total | `;
    display += `✅ ${summary.completed} completed | `;
    display += `🔄 ${summary.inProgress} in progress | `;
    display += `⏳ ${summary.pending} pending`;
    
    if (summary.paused > 0) display += ` | ⏸️ ${summary.paused} paused`;
    if (summary.cancelled > 0) display += ` | ❌ ${summary.cancelled} cancelled`;
    if (summary.blocked > 0) display += ` | 🚫 ${summary.blocked} blocked`;
    
    display += `\n\n`;
    
    if (tasks.length > 0) {
      display += `### Recent Tasks\n\n`;
      tasks.forEach((task, index) => {
        display += `${index + 1}. ${task.statusIcon} **${task.content}**`;
        if (task.priority !== 'medium') {
          display += ` ${task.priorityIcon}`;
        }
        if (task.dependsOn.length > 0) {
          display += ` (depends on: ${task.dependsOn.length} task${task.dependsOn.length > 1 ? 's' : ''})`;
        }
        if (!task.canStart) {
          display += ` ⚠️ *blocked*`;
        }
        display += `\n`;
      });
      
      if (summary.total > tasks.length) {
        display += `\n*...and ${summary.total - tasks.length} more tasks*\n`;
      }
    }
    
    return display;
  }

  // Build decision support information
  private buildDecisionSupport(todos: TodoTask[]) {
    const now = new Date();
    const staleTasks = todos
      .filter(task => {
        const daysSinceUpdate = Math.floor((now.getTime() - task.updatedAt.getTime()) / (1000 * 60 * 60 * 24));
        return daysSinceUpdate > 1 && (task.status === TaskStatus.IN_PROGRESS || task.status === TaskStatus.PENDING);
      })
      .map(task => ({
        id: task.id,
        daysSinceUpdate: Math.floor((now.getTime() - task.updatedAt.getTime()) / (1000 * 60 * 60 * 24)),
        lastActivity: task.updatedAt.toISOString()
      }));

    // Simple recommendation logic
    const recommendations = staleTasks.map(staleTask => ({
      type: 'pause' as const,
      taskId: staleTask.id,
      reason: `No activity for ${staleTask.daysSinceUpdate} days`,
      confidence: Math.min(0.9, staleTask.daysSinceUpdate * 0.1)
    }));

    if (staleTasks.length === 0 && recommendations.length === 0) {
      return undefined;
    }

    return {
      staleTasks,
      contextSwitches: 0, // Could be calculated based on task history
      recommendations
    };
  }

  // Build dependency graph
  private buildDependencyGraph(todos: TodoTask[]): { nodes: Array<{ id: string; label: string; status: TaskStatus }>; edges: Array<{ from: string; to: string }> } | undefined {
    const hasDependencies = todos.some(task => task.dependencies.length > 0);
    
    if (!hasDependencies) {
      return undefined;
    }

    const nodes = todos.map(task => ({
      id: task.id,
      label: task.content,
      status: task.status
    }));

    const edges: Array<{ from: string; to: string }> = [];
    todos.forEach(task => {
      task.dependencies.forEach(depId => {
        edges.push({ from: depId, to: task.id });
      });
    });

    return { nodes, edges };
  }
}

export class TodoTool extends BaseDeclarativeTool<TodoParams, TodoResult> {
  constructor() {
    super(
      'todo',
      'TODO Task Manager',
      'Manage and track tasks with priorities and dependencies',
      Kind.Other,
      {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['add', 'update', 'list', 'clear', 'check_dependencies', 'pause', 'resume', 'cancel', 'archive', 'get_context'],
            description: 'The action to perform'
          },
          taskId: {
            type: 'string',
            description: 'Task ID for update operations'
          },
          content: {
            type: 'string',
            description: 'Task description'
          },
          activeForm: {
            type: 'string',
            description: 'Description shown while task is in progress'
          },
          status: {
            type: 'string',
            enum: Object.values(TaskStatus),
            description: 'Task status'
          },
          priority: {
            type: 'string',
            enum: Object.values(TaskPriority),
            description: 'Task priority'
          },
          dependencies: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of task IDs this task depends on'
          },
          contextInfo: {
            type: 'object',
            properties: {
              reason: {
                type: 'string',
                description: 'Reason for the operation'
              },
              estimatedDuration: {
                type: 'number',
                description: 'Estimated duration in minutes'
              },
              resumeCondition: {
                type: 'string',
                description: 'Condition for resuming paused tasks'
              },
              relatedTopics: {
                type: 'array',
                items: { type: 'string' },
                description: 'Related conversation topics'
              },
              urgency: {
                type: 'string',
                enum: ['low', 'medium', 'high', 'immediate'],
                description: 'Task urgency level'
              }
            }
          },
          filters: {
            type: 'object',
            properties: {
              priority: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: Object.values(TaskPriority)
                },
                description: 'Filter by priorities'
              },
              status: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: Object.values(TaskStatus)
                },
                description: 'Filter by statuses'
              },
              canStart: {
                type: 'boolean',
                description: 'Filter tasks that can start (no blocking dependencies)'
              },
              daysSinceUpdate: {
                type: 'number',
                description: 'Filter tasks by days since last update'
              }
            }
          }
        },
        required: ['action']
      },
      true,
      false
    );
  }

  protected createInvocation(params: TodoParams): TodoInvocation {
    return new TodoInvocation(params);
  }
}