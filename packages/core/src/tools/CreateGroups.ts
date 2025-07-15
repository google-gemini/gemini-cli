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
import { T } from 'vitest/dist/chunks/reporters.d.BFLkQcL6.js';

// Interface for a single repository within a group
interface RepositoryRef {
  resource: string;
  branchPattern?: string;
}

// Interface for the RepositoryGroup resource (for request body)
interface RepositoryGroupRequestBody {
  labels?: Record<string, string>;
  repositories?: RepositoryRef[];
}

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
 * Parameters for the CreateRepositoryGroupTool.
 */
export interface CreateRepositoryGroupParams {
  /** The ID of the parent CodeRepositoryIndex. */
  indexId: string;
  /** The Google Cloud location (region). */
  location: string;
  /** The Google Cloud project ID. */
  projectId: string;
  /** The ID for the new RepositoryGroup. */
  repositoryGroupId: string;

  /** Optional. Labels to apply to the new group. */
  labels?: Record<string, string>;
  /** Required. List of repositories to include in the group. */
  repositories: RepositoryRef[];

  /** Optional. API environment. Defaults to 'staging'. */
  environment?: 'prod' | 'staging';
  /** Optional. Unique UUID for request idempotency. */
  requestId?: string;
}

/**
 * Result from the CreateRepositoryGroupTool.
 */
export interface CreateRepositoryGroupResult extends ToolResult {
  operation?: LongRunningOperation;
}

/**
 * A tool to create a Repository Group within a Code Repository Index.
 */
export class CreateRepositoryGroupTool extends BaseTool<
  CreateRepositoryGroupParams,
  CreateRepositoryGroupResult
> {
  static readonly Name: string = 'create_repository_group';
  private auth: GoogleAuth;
  private client: Gaxios;

  constructor(private readonly config: Config) {
    super(
      CreateRepositoryGroupTool.Name,
      'Create Repository Group',
      'Creates a new Repository Group within a specific Code Repository Index.',
      {
        type: Type.OBJECT,
        properties: {
          indexId: {
            type: Type.STRING,
            description: 'The ID of the parent CodeRepositoryIndex.',
          },
          location: {
            type: Type.STRING,
            description: 'The Google Cloud location (region).',
          },
          projectId: {
            type: Type.STRING,
            description: 'The Google Cloud project ID.',
          },
          repositoryGroupId: {
            type: Type.STRING,
            description: 'The ID for the new RepositoryGroup.',
          },
          labels: {
            type: Type.OBJECT,
            description: 'Optional. Labels for the new group.',      
          },
          repositories: {
            type: Type.ARRAY,
            description: 'Required. List of repositories to include.',
            items: {
              type: Type.OBJECT,
              properties: {
                resource: {
                  type: Type.STRING,
                  description: 'DeveloperConnect repository resource name/URL.',
                },
                branchPattern: {
                  type: Type.STRING,
                  description: 'RE2 Git branch pattern (e.g., "main", ".*").',
                },
              },
              required: ['resource', 'branchPattern'],
            },
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
        required: [
          'indexId',
          'location',
          'projectId',
          'repositoryGroupId',
          'repositories',
        ],
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

  validateParams(params: CreateRepositoryGroupParams): string | null {
    if (!params.indexId?.trim()) return "The 'indexId' parameter is required.";
    if (!params.location?.trim())
      return "The 'location' parameter is required.";
    if (!params.projectId?.trim())
      return "The 'projectId' parameter is required.";
    if (!params.repositoryGroupId?.trim())
      return "The 'repositoryGroupId' parameter is required.";
    if (!params.repositories || params.repositories.length === 0) {
      return "The 'repositories' array cannot be empty.";
    }
    for (const repo of params.repositories) {
      if (!repo.resource?.trim() || !repo.branchPattern?.trim()) {
        return "Each repository must have a 'resource' and 'branchPattern'.";
      }
    }
    if (params.requestId && !this.isValidUUID(params.requestId)) {
      return 'requestId must be a valid UUID.';
    }
    return null;
  }

  getDescription(params: CreateRepositoryGroupParams): string {
    return `Creating repository group "${params.repositoryGroupId}" under index "${params.indexId}" in project ${params.projectId}, location ${params.location}...`;
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
    params: CreateRepositoryGroupParams,
  ): Promise<CreateRepositoryGroupResult> {
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
      const parentName = `projects/${projectId}/locations/${params.location}/codeRepositoryIndexes/${params.indexId}`;
      const baseApiUrl = `${endpoint}/v1/${parentName}/repositoryGroups`;

      const urlParams = new URLSearchParams();
      urlParams.append('repositoryGroupId', params.repositoryGroupId);
      if (params.requestId) {
        urlParams.append('requestId', params.requestId);
      } else {
        urlParams.append('requestId', uuidv4());
      }
      urlParams.append('alt', 'json');

      const apiUrl = `${baseApiUrl}?${urlParams.toString()}`;

      const requestBody: RepositoryGroupRequestBody = {
        repositories: params.repositories,
      };
      if (params.labels) {
        requestBody.labels = params.labels;
      }

      console.log(`Calling API: POST ${apiUrl}`);
      console.log(`Request Body: ${JSON.stringify(requestBody)}`);

      const response: GaxiosResponse<LongRunningOperation> =
        await this.makeRequest<LongRunningOperation>({
          url: apiUrl,
          method: 'POST',
          headers,
          data: requestBody,
        });

      const operation = response.data;
      return {
        llmContent: `Create RepositoryGroup request issued for "${params.repositoryGroupId}". Operation: ${operation.name}`,
        returnDisplay: `Successfully initiated creation for RepositoryGroup "${params.repositoryGroupId}". Operation: ${operation.name}`,
        operation,
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      console.error(`Error in CreateRepositoryGroupTool: ${errorMessage}`);
      let displayError = 'Error creating repository group.';
      if (
        errorMessage.includes('PERMISSION_DENIED') ||
        errorMessage.includes('403')
      ) {
        displayError =
          'Error: Permission denied. Ensure the caller has the necessary IAM roles (cloudaicompanion.repositoryGroups.create) on the project.';
      } else if (
        errorMessage.includes('NOT_FOUND') ||
        errorMessage.includes('404')
      ) {
        displayError = `Error: Parent Index "${params.indexId}" not found or API endpoint issue in ${env}.`;
      } else if (
        errorMessage.includes('ALREADY_EXISTS') ||
        errorMessage.includes('409')
      ) {
        displayError = `Error: RepositoryGroup "${params.repositoryGroupId}" already exists.`;
      } else if (errorMessage.includes('enable the API')) {
        displayError = `Error: Cloud AI Companion API (Staging) is not enabled. Please enable ${this.getApiEndpoint(env).replace('https://', '')} in the Google Cloud Console for project ${projectId}.`;
      } else if (errorMessage.includes('Failed to retrieve access token')) {
        displayError =
          'Error: Authentication failed. Please run `gcloud auth login` and `gcloud auth application-default login`.';
      } else if (errorMessage.includes('API call to')) {
        displayError = errorMessage;
      } else {
        displayError = `Error creating resource: ${errorMessage}`;
      }
      return {
        llmContent: `Error creating repository group: ${errorMessage}`,
        returnDisplay: displayError,
      };
    }
  }
}
