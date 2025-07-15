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
}

// Interface for a single Code Repository Group
interface RepositoryGroup {
  name: string;
  createTime?: string;
  updateTime?: string;
  labels?: Record<string, string>;
  repositories?: RepositoryRef[];
}

// Interface for the list groups API response
interface ListRepositoryGroupsResponse {
  repositoryGroups?: RepositoryGroup[];
  nextPageToken?: string;
}

/**
 * Parameters for the ListRepositoryGroupsTool.
 */
export interface ListRepositoryGroupsParams {
  /** The ID of the parent CodeRepositoryIndex. */
  indexId: string;
  /** The Google Cloud location (region). */
  location: string;
  /** The Google Cloud project ID. */
  projectId: string;

  /** Optional. Number of items to fetch per page. */
  pageSize?: number;
  /** Optional. API environment. Defaults to 'staging'. */
  environment?: 'prod' | 'staging';
  /** Optional. Filter string (AIP-160). */
  filter?: string;
  /** Optional. Order by string (AIP-132). */
  orderBy?: string;
}

/**
 * Result from the ListRepositoryGroupsTool.
 */
export interface ListRepositoryGroupsResult extends ToolResult {
  repositoryGroups?: RepositoryGroup[];
}

/**
 * A tool to list Repository Groups for a given Code Repository Index.
 */
export class ListRepositoryGroupsTool extends BaseTool<
  ListRepositoryGroupsParams,
  ListRepositoryGroupsResult
> {
  static readonly Name: string = 'list_repository_groups';
  private auth: GoogleAuth;
  private client: Gaxios;

  constructor(private readonly config: Config) {
    super(
      ListRepositoryGroupsTool.Name,
      'List Repository Groups',
      'Lists Repository Groups for a specific Code Repository Index.',
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
          pageSize: {
            type: Type.INTEGER,
            description: 'Optional. Number of groups to fetch per page.',
            default: 50,
          },
          environment: {
            type: Type.STRING,
            description:
              "Optional. API environment ('prod' or 'staging'). Defaults to 'staging'.",
            enum: ['prod', 'staging'],
            default: 'staging',
          },
          filter: {
            type: Type.STRING,
            description: 'Optional. Filter expression (AIP-160).',
          },
          orderBy: {
            type: Type.STRING,
            description: 'Optional. Order by expression (AIP-132).',
          },
        },
        required: ['indexId', 'location', 'projectId'],
      },
    );

    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    this.client = new Gaxios();
  }

  getDescription(params: ListRepositoryGroupsParams): string {
    return `Listing repository groups for index "${params.indexId}" in project ${params.projectId}, location ${params.location} (env: ${params.environment || 'staging'})...`;
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
    params: ListRepositoryGroupsParams,
  ): Promise<ListRepositoryGroupsResult> {
    if (!params.projectId?.trim() || !params.location?.trim() || !params.indexId?.trim()) {
  return {
    llmContent: 'Project ID, Location, and Index ID are required.',
    returnDisplay:
      'Error: Project ID, Location, and Index ID must be provided.',
  };
}

    const env = params.environment || 'staging';
    const projectId = params.projectId;
    const pageSize = params.pageSize || 50;

    try {
      const authClient = await this.auth.getClient();
      const token = await authClient.getAccessToken();
      if (!token.token) {
        throw new Error('Failed to retrieve access token.');
      }

      const headers = {
        Authorization: `Bearer ${token.token}`,
        'Content-Type': 'application/json',
        'X-Goog-User-Project': projectId,
      };

      const endpoint = this.getApiEndpoint(env);
      const parentName = `projects/${projectId}/locations/${params.location}/codeRepositoryIndexes/${params.indexId}`;
      const baseApiUrl = `${endpoint}/v1/${parentName}/repositoryGroups`;

      let allGroups: RepositoryGroup[] = [];
      let pageToken: string | undefined = undefined;

      console.log(`Listing Repository Groups from: ${baseApiUrl}`);
      do {
        const urlParams = new URLSearchParams();
        urlParams.append('pageSize', pageSize.toString());
        if (pageToken) urlParams.append('pageToken', pageToken);
        if (params.filter) urlParams.append('filter', params.filter);
        if (params.orderBy) urlParams.append('orderBy', params.orderBy);
        urlParams.append('alt', 'json');

        const apiUrl = `${baseApiUrl}?${urlParams.toString()}`;
        const response: GaxiosResponse<ListRepositoryGroupsResponse> =
          await this.makeRequest<ListRepositoryGroupsResponse>({
            url: apiUrl,
            method: 'GET',
            headers,
          });

        if (response.data.repositoryGroups) {
          allGroups = allGroups.concat(response.data.repositoryGroups);
        }
        pageToken = response.data.nextPageToken;
      } while (pageToken);

      console.log(`Total repository groups fetched: ${allGroups.length}`);

      const formattedOutput =
        allGroups.length > 0
          ? allGroups
              .map((group, i) => {
                let groupStr = `Group ${i + 1}:
  Name: ${group.name}
  Created: ${group.createTime || 'N/A'}
  Updated: ${group.updateTime || 'N/A'}
  Labels: ${group.labels ? JSON.stringify(group.labels) : 'N/A'}`;
                if (group.repositories && group.repositories.length > 0) {
                  groupStr += `\n  Repositories:`;
                  groupStr +=
                    '\n' +
                    group.repositories
                      .map(
                        (r) =>
                          `    - Resource: ${r.resource}\n      Branch Pattern: ${r.branchPattern || '.*'}`,
                      )
                      .join('\n');
                } else {
                  groupStr += `\n  Repositories: None`;
                }
                return groupStr;
              })
              .join('\n\n')
          : 'No repository groups found.';

      return {
        llmContent: `Repository Groups Found:\n\n${formattedOutput}`,
        returnDisplay: `Successfully listed ${allGroups.length} repository group(s) from ${env}.`,
        repositoryGroups: allGroups,
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      console.error(`Error in ListRepositoryGroupsTool: ${errorMessage}`);
      let displayError = 'Error listing repository groups.';
      if (
        errorMessage.includes('PERMISSION_DENIED') ||
        errorMessage.includes('403')
      ) {
        displayError =
          'Error: Permission denied. Ensure the caller has the necessary IAM roles (cloudaicompanion.repositoryGroups.list) on the project.';
      } else if (
        errorMessage.includes('NOT_FOUND') ||
        errorMessage.includes('404')
      ) {
        displayError = `Error: Parent Index "${params.indexId}" not found or API endpoint issue in ${env}.`;
      } else if (errorMessage.includes('enable the API')) {
        displayError = `Error: Cloud AI Companion API (Staging) is not enabled. Please enable ${this.getApiEndpoint(env).replace('https://', '')} in the Google Cloud Console for project ${projectId}.`;
      } else if (
        errorMessage.includes('Failed to retrieve access token') ||
        errorMessage.includes('Could not refresh access token')
      ) {
        displayError =
          'Error: Authentication failed. Please run `gcloud auth login` and `gcloud auth application-default login` to authenticate.';
      } else if (errorMessage.includes('Invalid filter')) {
        displayError = `Error: Invalid filter string provided: ${params.filter}`;
      } else if (errorMessage.includes('API call to')) {
        displayError = errorMessage;
      } else {
        displayError = `Error listing resources: ${errorMessage}`;
      }
      return {
        llmContent: `Error listing repository groups: ${errorMessage}`,
        returnDisplay: displayError,
      };
    }
  }
}
