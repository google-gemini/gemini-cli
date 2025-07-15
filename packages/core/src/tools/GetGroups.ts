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
import { Type } from '@google/genai';

// Interface for a single repository within a group
interface RepositoryRef {
  resource: string;
  branchPattern?: string;
  // Fields from the log, potentially output-only
  repositoryUri?: string;
  connectionConfig?: string;
}

// Interface for a single Code Repository Group
interface RepositoryGroup {
  name: string;
  createTime?: string;
  updateTime?: string;
  labels?: Record<string, string>;
  repositories?: RepositoryRef[];
}

/**
 * Parameters for the GetRepositoryGroupTool.
 */
export interface GetRepositoryGroupParams {
  /** The ID of the parent CodeRepositoryIndex. */
  indexId: string;
  /** The ID of the RepositoryGroup. */
  repositoryGroupId: string;
  /** The Google Cloud location (region). */
  location: string;
  /** The Google Cloud project ID. */
  projectId: string;

  /** Optional. API environment. Defaults to 'staging'. */
  environment?: 'prod' | 'staging';
}

/**
 * Result from the GetRepositoryGroupTool.
 */
export interface GetRepositoryGroupResult extends ToolResult {
  repositoryGroup?: RepositoryGroup;
}

/**
 * A tool to get details of a single Repository Group.
 */
export class GetRepositoryGroupTool extends BaseTool<
  GetRepositoryGroupParams,
  GetRepositoryGroupResult
> {
  static readonly Name: string = 'get_repository_group';
  private auth: GoogleAuth;
  private client: Gaxios;

  constructor(private readonly config: Config) {
    super(
      GetRepositoryGroupTool.Name,
      'Get Repository Group',
      'Gets details of a specific Repository Group within a Code Repository Index.',
      {
        type: Type.OBJECT,
        properties: {
          indexId: {
            type: Type.STRING,
            description: 'The ID of the parent CodeRepositoryIndex.',
          },
          repositoryGroupId: {
            type: Type.STRING,
            description: 'The ID of the RepositoryGroup to retrieve.',
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
        },
        required: ['indexId', 'repositoryGroupId', 'location', 'projectId'],
      },
    );

    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    this.client = new Gaxios();
  }

  validateParams(params: GetRepositoryGroupParams): string | null {
    if (!params.indexId?.trim()) return "The 'indexId' parameter is required.";
    if (!params.repositoryGroupId?.trim())
      return "The 'repositoryGroupId' parameter is required.";
    if (!params.location?.trim())
      return "The 'location' parameter is required.";
    if (!params.projectId?.trim())
      return "The 'projectId' parameter is required.";
    return null;
  }

  getDescription(params: GetRepositoryGroupParams): string {
    return `Getting details for repository group "${params.repositoryGroupId}" under index "${params.indexId}" in project ${params.projectId}, location ${params.location} (env: ${params.environment || 'staging'})...`;
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
  private formatLabels(labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
        return 'N/A';
    }
    return ('\n' + Object.entries(labels)
        .map(([key, value]) => `    ${key}: ${value}`) // Corrected indentation
        .join('\n')
    );
}

  async execute(
    params: GetRepositoryGroupParams,
  ): Promise<GetRepositoryGroupResult> {
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
      const apiUrl = `${endpoint}/v1/${groupName}?alt=json`;

      console.log(`Calling API: GET ${apiUrl}`);

      const response: GaxiosResponse<RepositoryGroup> =
        await this.makeRequest<RepositoryGroup>({
          url: apiUrl,
          method: 'GET',
          headers,
        });

      const repositoryGroup = response.data;

      let formattedOutput = `Repository Group Details:
  Name: ${repositoryGroup.name}
  Created: ${repositoryGroup.createTime || 'N/A'}
  Updated: ${repositoryGroup.updateTime || 'N/A'}
  Labels: ${this.formatLabels(repositoryGroup.labels)}`;

      if (
        repositoryGroup.repositories &&
        repositoryGroup.repositories.length > 0
      ) {
        formattedOutput += `\n  Repositories:`;
        formattedOutput +=
          '\n' +
          repositoryGroup.repositories
            .map(
              (r) =>
                `    - Resource: ${r.resource}\n      Branch Pattern: ${r.branchPattern || '.*'}\n      Repo URI: ${r.repositoryUri || 'N/A'}\n      Connection: ${r.connectionConfig || 'N/A'}`,
            )
            .join('\n');
      } else {
        formattedOutput += `\n  Repositories: None`;
      }

      return {
        llmContent: formattedOutput,
        returnDisplay: `Successfully retrieved details for Repository Group "${params.repositoryGroupId}".`,
        repositoryGroup,
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      console.error(`Error in GetRepositoryGroupTool: ${errorMessage}`);
      let displayError = 'Error getting repository group.';
      if (
        errorMessage.includes('PERMISSION_DENIED') ||
        errorMessage.includes('403')
      ) {
        displayError =
          'Error: Permission denied. Ensure the caller has the necessary IAM roles (cloudaicompanion.repositoryGroups.get) on the project.';
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
        displayError = `Error getting resource: ${errorMessage}`;
      }
      return {
        llmContent: `Error getting repository group: ${errorMessage}`,
        returnDisplay: displayError,
      };
    }
  }
}
