/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { Config } from '../config/config.js';
import { getErrorMessage } from '../utils/errors.js';
import { GoogleAuth } from 'google-auth-library';
import { GaxiosResponse, Gaxios, GaxiosOptions } from 'gaxios';
import { v4 as uuidv4 } from 'uuid';
import { Type } from '@google/genai';

// Interface for a single repository within a group
interface RepositoryRef {
  resource: string;
  branchPattern?: string;
}

// Interface for the full RepositoryGroup resource
interface RepositoryGroup {
  name: string;
  createTime?: string;
  updateTime?: string;
  labels?: Record<string, string>;
  repositories?: RepositoryRef[];
}

// Interface for the Long Running Operation response
interface LongRunningOperation {
  name: string;
  metadata?: any;
  done: boolean;
  error?: { code: number; message: string; details?: any[] };
  response?: any;
}

/**
 * Parameters for the UpdateRepositoryGroupTool.
 */
export interface UpdateRepositoryGroupParams {
  /** The ID of the parent CodeRepositoryIndex. */
  indexId: string;
  /** The ID of the RepositoryGroup to update. */
  repositoryGroupId: string;
  /** The Google Cloud location (region). */
  location: string;
  /** The Google Cloud project ID. */
  projectId: string;

  /** Optional. API environment. Defaults to 'staging'. */
  environment?: 'prod' | 'staging';
  /** Optional. Unique UUID for request idempotency. */
  requestId?: string;

  // Label operations
  setLabels?: Record<string, string>;
  updateLabels?: Record<string, string>;
  clearLabels?: boolean;
  removeLabels?: string[];

  // Repository operations
  setRepositories?: RepositoryRef[];
  addRepositories?: RepositoryRef[];
  clearRepositories?: boolean;
  removeRepositories?: RepositoryRef[];
}

/**
 * Result from the UpdateRepositoryGroupTool.
 */
export interface UpdateRepositoryGroupResult extends ToolResult {
  operation?: LongRunningOperation;
}

/**
 * A tool to update a Repository Group.
 */
export class UpdateRepositoryGroupTool extends BaseTool<
  UpdateRepositoryGroupParams,
  UpdateRepositoryGroupResult
> {
  static readonly Name: string = 'update_repository_group';
  private auth: GoogleAuth;
  private client: Gaxios;

  constructor(private readonly config: Config) {
    super(
      UpdateRepositoryGroupTool.Name,
      'Update Repository Group',
      'Updates labels and repositories for a specific Repository Group.',
      {
        type: Type.OBJECT,
        properties: {
          indexId: { type: Type.STRING, description: 'ID of the parent index.' },
          repositoryGroupId: { type: Type.STRING, description: 'ID of the group.' },
          location: { type: Type.STRING, description: 'Google Cloud location.' },
          projectId: { type: Type.STRING, description: 'Google Cloud project ID.' },
          environment: { type: Type.STRING, enum: ['prod', 'staging'], default: 'staging' },
          requestId: { type: Type.STRING, description: 'Optional UUID for idempotency.' },
          setLabels: { type: Type.OBJECT, description: 'Replace all labels.' },
          updateLabels: { type: Type.OBJECT, description: 'Add or update labels.' },
          clearLabels: { type: Type.BOOLEAN, description: 'Remove all labels.' },
          removeLabels: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Remove labels by key.' },
          setRepositories: { type: Type.ARRAY, items: { type: Type.OBJECT }, description: 'Replace all repositories.' },
          addRepositories: { type: Type.ARRAY, items: { type: Type.OBJECT }, description: 'Add repositories.' },
          clearRepositories: { type: Type.BOOLEAN, description: 'Remove all repositories.' },
          removeRepositories: { type: Type.ARRAY, items: { type: Type.OBJECT }, description: 'Remove specific repositories.' },
        },
        required: ['indexId', 'repositoryGroupId', 'location', 'projectId'],
      },
    );

    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    this.client = new Gaxios();
  }

  private isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  validateParams(params: UpdateRepositoryGroupParams): string | null {
    if (!params.indexId?.trim()) return "The 'indexId' is required.";
    if (!params.repositoryGroupId?.trim()) return "The 'repositoryGroupId' is required.";
    if (!params.location?.trim()) return "The 'location' is required.";
    if (!params.projectId?.trim()) return "The 'projectId' is required.";

    const labelOps = [params.setLabels, params.updateLabels, params.clearLabels, params.removeLabels].filter(op => op !== undefined).length;
    if (labelOps > 1) return 'At most one label operation (set, update, clear, remove) can be specified.';

    const repoOps = [params.setRepositories, params.addRepositories, params.clearRepositories, params.removeRepositories].filter(op => op !== undefined).length;
    if (repoOps > 1) return 'At most one repository operation (set, add, clear, remove) can be specified.';

    if (labelOps === 0 && repoOps === 0) return 'At least one update operation for labels or repositories must be specified.';

    if (params.requestId && !this.isValidUUID(params.requestId)) return 'The provided requestId is not a valid UUID.';
    
    return null;
  }

  getApiEndpoint(environment: 'prod' | 'staging' = 'staging'): string {
    return environment === 'prod'
      ? 'https://cloudaicompanion.googleapis.com'
      : 'https://staging-cloudaicompanion.sandbox.googleapis.com';
  }

  private async makeRequest<T>(options: GaxiosOptions): Promise<GaxiosResponse<T>> {
    try {
      return await this.client.request<T>(options);
    } catch (error: any) {
      const errorMessage = getErrorMessage(error);
      const statusCode = error.code || error.response?.status;
      throw new Error(`API call failed: ${statusCode} - ${errorMessage}`);
    }
  }

  private async getCurrentGroup(groupName: string, headers: Record<string, string>, endpoint: string): Promise<RepositoryGroup> {
    const apiUrl = `${endpoint}/v1/${groupName}?alt=json`;
    const response = await this.makeRequest<RepositoryGroup>({ url: apiUrl, method: 'GET', headers });
    return response.data;
  }

  async execute(params: UpdateRepositoryGroupParams): Promise<UpdateRepositoryGroupResult> {
    const validationError = this.validateParams(params);
    if (validationError) {
      return { llmContent: `Invalid Parameters: ${validationError}`, returnDisplay: validationError };
    }

    const env = params.environment || 'staging';
    const endpoint = this.getApiEndpoint(env);
    const groupName = `projects/${params.projectId}/locations/${params.location}/codeRepositoryIndexes/${params.indexId}/repositoryGroups/${params.repositoryGroupId}`;
    
    try {
      const authClient = await this.auth.getClient();
      const token = await authClient.getAccessToken();
      if (!token.token) throw new Error('Failed to retrieve access token.');

      const headers = {
        Authorization: `Bearer ${token.token}`,
        'Content-Type': 'application/json',
        'X-Goog-User-Project': params.projectId,
      };

      // READ: Get the current state
      const currentGroup = await this.getCurrentGroup(groupName, headers, endpoint);
      
      let newLabels = { ...(currentGroup.labels || {}) };
      let newRepositories = [...(currentGroup.repositories || [])];
      const updateMask: string[] = [];

      // MODIFY: Apply label changes
      if (params.setLabels !== undefined) {
        newLabels = params.setLabels;
        updateMask.push('labels');
      } else if (params.updateLabels) {
        newLabels = { ...newLabels, ...params.updateLabels };
        updateMask.push('labels');
      } else if (params.clearLabels) {
        newLabels = {};
        updateMask.push('labels');
      } else if (params.removeLabels) {
        params.removeLabels.forEach(key => delete newLabels[key]);
        updateMask.push('labels');
      }

      // MODIFY: Apply repository changes
      if (params.setRepositories !== undefined) {
        newRepositories = params.setRepositories;
        updateMask.push('repositories');
      } else if (params.addRepositories) {
        newRepositories.push(...params.addRepositories);
        updateMask.push('repositories');
      } else if (params.clearRepositories) {
        newRepositories = [];
        updateMask.push('repositories');
      } else if (params.removeRepositories) {
        const toRemove = new Set(params.removeRepositories.map(r => r.resource));
        newRepositories = newRepositories.filter(r => !toRemove.has(r.resource));
        updateMask.push('repositories');
      }

      // WRITE: Patch the resource
      const urlParams = new URLSearchParams({
        updateMask: updateMask.join(','),
        requestId: params.requestId || uuidv4(),
        alt: 'json',
      });
      const apiUrl = `${endpoint}/v1/${groupName}?${urlParams.toString()}`;
      
      const response = await this.makeRequest<LongRunningOperation>({
        url: apiUrl,
        method: 'PATCH',
        headers,
        data: { labels: newLabels, repositories: newRepositories },
      });

      const operation = response.data;
      return {
        llmContent: `Update request issued for RepositoryGroup "${params.repositoryGroupId}". Operation: ${operation.name}`,
        returnDisplay: `Successfully initiated update for RepositoryGroup "${params.repositoryGroupId}". Operation: ${operation.name}`,
        operation,
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      let displayError = 'Error updating repository group.';

      if (errorMessage.includes('403')) {
        displayError = 'Error: Permission denied. Ensure the caller has the correct IAM roles (cloudaicompanion.repositoryGroups.update).';
      } else if (errorMessage.includes('404')) {
        displayError = `Error: RepositoryGroup "${params.repositoryGroupId}" not found.`;
      } else if (errorMessage.includes('400')) {
        displayError = `Error: Bad request. Please check your parameters. Details: ${errorMessage}`;
      } else if (errorMessage.includes('Failed to retrieve access token')) {
        displayError = 'Error: Authentication failed. Please run `gcloud auth login`.';
      }
      
      return {
        llmContent: `Error updating repository group: ${errorMessage}`,
        returnDisplay: displayError,
      };
    }
  }
}