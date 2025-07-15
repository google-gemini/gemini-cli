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

// Interface for the Long Running Operation metadata
interface OperationMetadata {
  '@type': string;
  createTime?: string;
  target?: string;
  verb?: string;
  requestedCancellation?: boolean;
  apiVersion?: string;
}

// Interface for the Long Running Operation response
interface LongRunningOperation {
  name: string;
  metadata?: OperationMetadata;
  done: boolean;
  error?: { code: number; message: string; details?: any[] };
  response?: any;
}

/**
 * Parameters for the DeleteRepositoryGroupTool.
 */
export interface DeleteRepositoryGroupParams {
  /** The ID of the parent CodeRepositoryIndex. */
  indexId: string;
  /** The ID of the RepositoryGroup to delete. */
  repositoryGroupId: string;
  /** The Google Cloud location (region). */
  location: string;
  /** The Google Cloud project ID. */
  projectId: string;

  /** Optional. API environment. Defaults to 'staging'. */
  environment?: 'prod' | 'staging';
  /** Optional. Unique UUID for request idempotency. */
  requestId?: string;
}

/**
 * Result from the DeleteRepositoryGroupTool.
 */
export interface DeleteRepositoryGroupResult extends ToolResult {
  operation?: LongRunningOperation;
}

/**
 * A tool to delete a single Repository Group.
 */
export class DeleteRepositoryGroupTool extends BaseTool<
  DeleteRepositoryGroupParams,
  DeleteRepositoryGroupResult
> {
  static readonly Name: string = 'delete_repository_group';
  private auth: GoogleAuth;
  private client: Gaxios;

  constructor(private readonly config: Config) {
    super(
      DeleteRepositoryGroupTool.Name,
      'Delete Repository Group',
      'Deletes a specific Repository Group from a Code Repository Index.',
      {
        type: Type.OBJECT,
        properties: {
          indexId: {
            type: Type.STRING,
            description: 'The ID of the parent CodeRepositoryIndex.',
          },
          repositoryGroupId: {
            type: Type.STRING,
            description: 'The ID of the RepositoryGroup to delete.',
          },
          location: {
            type: Type.STRING,
            description: 'The Google Cloud location (region).',
          },
          projectId: {
            type: Type.STRING,
            description: 'The Google Cloud project ID.',
          },
          environment: {
            type: Type.STRING,
            description:
              "Optional. API environment ('prod' or 'staging'). Defaults to 'staging'.",
            enum: ['prod', 'staging'],
            default: 'staging',
          },
          requestId: {
            type: Type.STRING,
            description: 'Optional. UUID for idempotent requests.',
          },
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
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return (
      uuidRegex.test(uuid) && uuid !== '00000000-0000-0000-0000-000000000000'
    );
  }

  validateParams(params: DeleteRepositoryGroupParams): string | null {
    if (!params.indexId?.trim()) return "The 'indexId' parameter is required.";
    if (!params.repositoryGroupId?.trim())
      return "The 'repositoryGroupId' parameter is required.";
    if (!params.location?.trim())
      return "The 'location' parameter is required.";
    if (!params.projectId?.trim())
      return "The 'projectId' parameter is required.";
    if (params.requestId && !this.isValidUUID(params.requestId)) {
      return 'requestId must be a valid UUID.';
    }
    return null;
  }

  getDescription(params: DeleteRepositoryGroupParams): string {
    return `Deleting repository group "${params.repositoryGroupId}" under index "${params.indexId}" in project ${params.projectId}, location ${params.location} (env: ${params.environment || 'staging'})...`;
  }

  getApiEndpoint(environment: 'prod' | 'staging' = 'staging'): string {
    return environment === 'prod'
      ? 'https://cloudaicompanion.googleapis.com'
      : 'https://staging-cloudaicompanion.sandbox.googleapis.com';
  }

  private async makeRequest<T>(
    options: GaxiosOptions,
  ): Promise<GaxiosResponse<T>> {
    try {
      return await this.client.request<T>(options);
    } catch (error: any) {
      const errorMessage = getErrorMessage(error);
      const statusCode = error.code || error.response?.status;
      throw new Error(
        `API call to ${options.url} failed: ${statusCode} - ${errorMessage} ${JSON.stringify(error.response?.data)}`,
      );
    }
  }

  async execute(
    params: DeleteRepositoryGroupParams,
  ): Promise<DeleteRepositoryGroupResult> {
    const validationError = this.validateParams(params);
    if (validationError) {
      return {
        llmContent: `Invalid Parameters: ${validationError}`,
        returnDisplay: validationError,
      };
    }

    const env = params.environment || 'staging';
    const projectId = params.projectId;

    try {
      const authClient = await this.auth.getClient();
      const token = await authClient.getAccessToken();
      if (!token.token) {
        throw new Error('Failed to retrieve access token.');
      }

      const headers = {
        Authorization: `Bearer ${token.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Goog-User-Project': projectId,
      };

      const endpoint = this.getApiEndpoint(env);
      const groupName = `projects/${projectId}/locations/${params.location}/codeRepositoryIndexes/${params.indexId}/repositoryGroups/${params.repositoryGroupId}`;

      const urlParams = new URLSearchParams();
      urlParams.append('alt', 'json');
      if (params.requestId) {
        urlParams.append('requestId', params.requestId);
      } else {
        urlParams.append('requestId', uuidv4());
      }

      const apiUrl = `${endpoint}/v1/${groupName}?${urlParams.toString()}`;

      console.log(`Calling API: DELETE ${apiUrl}`);

      const response: GaxiosResponse<LongRunningOperation> =
        await this.makeRequest<LongRunningOperation>({
          url: apiUrl,
          method: 'DELETE',
          headers,
        });

      const operation = response.data;
      return {
        llmContent: `Delete request issued for RepositoryGroup "${params.repositoryGroupId}". Operation: ${operation.name}`,
        returnDisplay: `Successfully initiated deletion for RepositoryGroup "${params.repositoryGroupId}". Operation: ${operation.name}`,
        operation,
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      console.error(`Error in DeleteRepositoryGroupTool: ${errorMessage}`);
      let displayError = 'Error deleting repository group.';
      if (
        errorMessage.includes('PERMISSION_DENIED') ||
        errorMessage.includes('403')
      ) {
        displayError =
          'Error: Permission denied. Ensure the caller has the necessary IAM roles (cloudaicompanion.repositoryGroups.delete) on the project.';
      } else if (
        errorMessage.includes('NOT_FOUND') ||
        errorMessage.includes('404')
      ) {
        displayError = `Error: RepositoryGroup "${params.repositoryGroupId}" not found under index "${params.indexId}" in ${env}.`;
      } else if (errorMessage.includes('enable the API')) {
        displayError = `Error: Cloud AI Companion API (Staging) is not enabled. Please enable ${this.getApiEndpoint(env).replace('https://', '')} in the Google Cloud Console for project ${projectId}.`;
      } else if (errorMessage.includes('Failed to retrieve access token')) {
        displayError =
          'Error: Authentication failed. Please run `gcloud auth login` and `gcloud auth application-default login`.';
      } else if (errorMessage.includes('API call to')) {
        displayError = errorMessage;
      } else {
        displayError = `Error deleting resource: ${errorMessage}`;
      }
      return {
        llmContent: `Error deleting repository group: ${errorMessage}`,
        returnDisplay: displayError,
      };
    }
  }
}
