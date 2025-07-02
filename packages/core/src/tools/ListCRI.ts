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

// Interface for a single repository within a group
interface RepositoryRef {
  resource: string;
  branchPattern?: string;
}

// Interface for a single Code Repository Group
interface CodeRepositoryGroup {
  name: string;
  createTime?: string;
  updateTime?: string;
  repositories?: RepositoryRef[];
}

// Interface for the list groups API response
interface ListCodeRepositoryGroupsResponse {
  repositoryGroups?: CodeRepositoryGroup[]; // Corrected key
  nextPageToken?: string;
}

// Interface matching the fields from the CodeRepositoryIndex proto
interface CRI {
  name: string;
  createTime?: string;
  updateTime?: string;
  etag?: string;
  state: string;
  labels?: Record<string, string>;
  kmsKey?: string;
}

// Interface to hold an index and its associated groups
interface CRIWithGroups extends CRI {
  groups: CodeRepositoryGroup[];
  groupsError?: string; // To capture errors fetching groups for this index
}

// Interface for the list indexes API response structure
interface ListCodeRepositoryIndexesResponse {
  codeRepositoryIndexes?: CRI[];
  nextPageToken?: string;
}

/**
 * Parameters for the ListCRITool.
 */
export interface ListCRIParams {
  projectId: string;
  location: string;
  pageSize?: number; // Optional page size for both index and group listing
  environment?: 'prod' | 'staging';
  listGroups?: boolean; // Option to control fetching groups
}

/**
 * Result from the ListCRITool.
 */
export interface ListCRIResult extends ToolResult {
  indexesWithGroups?: CRIWithGroups[];
}

/**
 * A tool to list Code Repository Indexes and their associated Code Repository Groups.
 */
export class ListCRITool extends BaseTool<ListCRIParams, ListCRIResult> {
  static readonly Name: string = 'list_code_repository_indexes_and_groups';
  private auth: GoogleAuth;
  private client: Gaxios;

  constructor(private readonly config: Config) {
    super(
      ListCRITool.Name,
      'List Code Repository Indexes',
      'Lists Code Repository Indexes for a project and location, and optionally lists the Code Repository Groups within each index.',
      {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
            description: 'The Google Cloud project ID.',
          },
          location: {
            type: 'string',
            description: 'The Google Cloud location (region).',
          },
          pageSize: {
            type: 'integer',
            description:
              'Optional. Number of items to fetch per page for both indexes and groups.',
            default: 50,
          },
          environment: {
            type: 'string',
            description:
              "Optional. API environment to use ('prod' or 'staging'). Defaults to 'staging'.",
            enum: ['prod', 'staging'],
            default: 'staging',
          },
          listGroups: {
            type: 'boolean',
            description:
              'Optional. Whether to fetch the Code Repository Groups for each index. Defaults to true.',
            default: true,
          },
        },
        required: ['projectId', 'location'],
      },
    );

    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    this.client = new Gaxios();
  }

  getDescription(params: ListCRIParams): string {
    return `Listing code repository indexes ${params.listGroups !== false ? 'and their groups ' : ''}for project ${params.projectId} in ${params.location} (env: ${params.environment || 'staging'})...`;
  }

  getApiEndpoint(environment: 'prod' | 'staging' = 'staging'): string {
    if (environment === 'prod') {
      return 'https://cloudaicompanion.googleapis.com';
    }
    return 'https://staging-cloudaicompanion.sandbox.googleapis.com';
  }

  private async makeRequest<T>(
    options: GaxiosOptions,
  ): Promise<GaxiosResponse<T>> {
    try {
      return await this.client.request<T>(options);
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      const gaxiosError = error as {
        code?: string | number;
        response?: { status: number; data: unknown };
      };
      const statusCode = gaxiosError.code || gaxiosError.response?.status;
      throw new Error(
        `API call to ${options.url} failed: ${statusCode} - ${errorMessage} ${JSON.stringify(gaxiosError.response?.data)}`,
      );
    }
  }

  // Helper function to list all groups for a single index
  private async listAllGroupsForIndex(
    indexName: string,
    headers: Record<string, string>,
    endpoint: string,
    pageSize: number,
  ): Promise<CodeRepositoryGroup[]> {
    let allGroups: CodeRepositoryGroup[] = [];
    let pageToken: string | undefined = undefined;
    const baseApiUrl = `${endpoint}/v1/${indexName}/repositoryGroups`; // Corrected URL part

    console.log(`   Fetching groups for index: ${indexName}`);

    do {
      const urlParams = new URLSearchParams();
      urlParams.append('pageSize', pageSize.toString());
      if (pageToken) {
        urlParams.append('pageToken', pageToken);
      }
      urlParams.append('alt', 'json');

      const apiUrl = `${baseApiUrl}?${urlParams.toString()}`;

      const response: GaxiosResponse<ListCodeRepositoryGroupsResponse> =
        await this.makeRequest<ListCodeRepositoryGroupsResponse>({
          url: apiUrl,
          method: 'GET',
          headers,
        });

      if (response.status !== 200) {
        throw new Error(
          `Failed to list groups for ${indexName}: ${response.status} ${response.statusText}`,
        );
      }

      const data = response.data;
      if (data.repositoryGroups) {
        // Corrected key
        allGroups = allGroups.concat(data.repositoryGroups);
      }
      pageToken = data.nextPageToken;
    } while (pageToken);

    console.log(`     Found ${allGroups.length} groups for ${indexName}.`);
    return allGroups;
  }

  async execute(params: ListCRIParams): Promise<ListCRIResult> {
    if (!params.projectId || !params.location) {
      return {
        llmContent: 'Project ID and Location are required.',
        returnDisplay: 'Error: Project ID and Location must be provided.',
      };
    }

    const env = params.environment || 'staging';
    const projectId = params.projectId;
    const listGroups = params.listGroups !== false;

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
      const baseIndexesUrl = `${endpoint}/v1/projects/${projectId}/locations/${params.location}/codeRepositoryIndexes`;
      const pageSize = params.pageSize || 50;

      let allIndexes: CRI[] = [];
      let pageToken: string | undefined = undefined;

      console.log(`Listing Indexes from: ${baseIndexesUrl}`);
      do {
        const urlParams = new URLSearchParams();
        urlParams.append('pageSize', pageSize.toString());
        if (pageToken) urlParams.append('pageToken', pageToken);
        urlParams.append('alt', 'json');

        const apiUrl = `${baseIndexesUrl}?${urlParams.toString()}`;
        const response: GaxiosResponse<ListCodeRepositoryIndexesResponse> =
          await this.makeRequest<ListCodeRepositoryIndexesResponse>({
            url: apiUrl,
            method: 'GET',
            headers,
          });
        if (response.data.codeRepositoryIndexes) {
          allIndexes = allIndexes.concat(response.data.codeRepositoryIndexes);
        }
        pageToken = response.data.nextPageToken;
      } while (pageToken);

      console.log(`Total indexes fetched: ${allIndexes.length}`);

      const indexesWithGroups: CRIWithGroups[] = [];
      for (const index of allIndexes) {
        const indexWithGroups: CRIWithGroups = { ...index, groups: [] };
        if (listGroups) {
          try {
            indexWithGroups.groups = await this.listAllGroupsForIndex(
              index.name,
              headers,
              endpoint,
              pageSize,
            );
          } catch (groupError: unknown) {
            const message = getErrorMessage(groupError);
            console.error(
              `Error fetching groups for ${index.name}: ${message}`,
            );
            indexWithGroups.groupsError = message;
          }
        }
        indexesWithGroups.push(indexWithGroups);
      }

      // Format the output for the LLM
      const formattedOutput = indexesWithGroups
        .map((iwg, i) => {
          let indexStr = `Index ${i + 1}:
  Name: ${iwg.name}
  State: ${iwg.state}`;
          if (listGroups) {
            if (iwg.groupsError) {
              indexStr += `\n  Groups Error: ${iwg.groupsError}`;
            } else {
              indexStr += `\n  Groups (${iwg.groups.length}):`;
              if (iwg.groups.length > 0) {
                indexStr +=
                  '\n' +
                  iwg.groups
                    .map((g, j) => {
                      let groupStr = `    Group ${j + 1}: ${g.name}`;
                      if (g.repositories && g.repositories.length > 0) {
                        groupStr += `\n      Repositories:`;
                        groupStr +=
                          '\n' +
                          g.repositories
                            .map(
                              (r) =>
                                `        - ${r.resource} (Branch: ${r.branchPattern || 'N/A'})`,
                            )
                            .join('\n');
                      } else {
                        groupStr += `\n      Repositories: None`;
                      }
                      return groupStr;
                    })
                    .join('\n');
              } else {
                indexStr += ' None';
              }
            }
          }
          return indexStr;
        })
        .join('\n\n');

      const finalLLMContent =
        indexesWithGroups.length > 0
          ? `Code Repository Indexes Found:\n\n${formattedOutput}`
          : 'No code repository indexes found.';

      return {
        llmContent: finalLLMContent,
        returnDisplay: `Successfully listed ${allIndexes.length} index(es) from ${env}.${listGroups ? ' Fetched group details.' : ''}`,
        indexesWithGroups,
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      console.error(`Error in ListCRITool: ${errorMessage}`);
      let displayError = 'Error listing code repository indexes.';
      if (
        errorMessage.includes('PERMISSION_DENIED') ||
        errorMessage.includes('403')
      ) {
        displayError =
          'Error: Permission denied. Ensure the caller has the necessary IAM roles (cloudaicompanion.codeRepositoryIndexes.list and cloudaicompanion.repositoryGroups.list) on the project.';
      } else if (
        errorMessage.includes('NOT_FOUND') ||
        errorMessage.includes('404')
      ) {
        displayError = `Error: API endpoint not found or resource not found in ${env}. Check project, location, and API enablement for the *staging* API.`;
      } else if (errorMessage.includes('enable the API')) {
        displayError = `Error: Cloud AI Companion API (Staging) is not enabled. Please enable ${this.getApiEndpoint(env).replace('https://', '')} in the Google Cloud Console for project ${params.projectId}.`;
      } else if (
        errorMessage.includes('Failed to retrieve access token') ||
        errorMessage.includes('Could not refresh access token')
      ) {
        displayError =
          'Error: Authentication failed. Please run `gcloud auth login` and `gcloud auth application-default login`.';
      } else if (errorMessage.includes('API call to')) {
        displayError = errorMessage;
      } else {
        displayError = `Error listing resources: ${errorMessage}`;
      }
      return {
        llmContent: `Error listing resources: ${errorMessage}`,
        returnDisplay: displayError,
      };
    }
  }
}
