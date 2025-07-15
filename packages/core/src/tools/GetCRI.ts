/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { Config } from '../config/config.js';
import { getErrorMessage } from '../utils/errors.js';
import { GoogleAuth } from 'google-auth-library';
import { GaxiosResponse, Gaxios } from 'gaxios';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { Type } from '@google/genai';
import { T } from 'vitest/dist/chunks/reporters.d.BFLkQcL6.js';

// Interface for the expected JSON output item
interface CodeRepositoryIndex {
  name: string;
  displayName?: string;
  createTime?: string;
  updateTime?: string;
  state?: string;
  etag?: string;
  labels?: Record<string, string>; // Added labels property
  kmsKey?: string;
}

/**
 * Parameters for the GetCodeRepositoryIndexTool.
 */
export interface GetCodeRepositoryIndexParams {
  /**
   * The ID (the last part of the name) of the Code Repository Index.
   */
  indexId: string;

  /**
   * The Google Cloud location (region) of the index.
   */
  location: string;

  /**
   * The Google Cloud project ID.
   */
  projectId: string;

  /**
   * Optional. API environment to use ('prod' or 'staging'). Defaults to 'staging'.
   */
  environment?: 'prod' | 'staging';
}

/**
 * Result from the GetCodeRepositoryIndexTool.
 */
export interface GetCodeRepositoryIndexResult extends ToolResult {
  index?: CodeRepositoryIndex;
}

/**
 * A tool to get details of a single Code Repository Index using the REST API.
 */
export class GetCRITool extends BaseTool<
  GetCodeRepositoryIndexParams,
  GetCodeRepositoryIndexResult
> {
  static readonly Name: string = 'get_code_repository_index';
  private auth: GoogleAuth;
  private client: Gaxios;

  constructor(private readonly config: Config) {
    super(
      GetCRITool.Name,
      'Get Code Repository Index',
      'Gets details of a specific Code Repository Index using the API.',
      {
        type: Type.OBJECT,
        properties: {
          indexId: {
            type: Type.STRING,
            description:
              'The ID of the Code Repository Index (e.g., "my-instance").',
          },
          location: {
            type: Type.STRING,
            description: 'The Google Cloud location (region) of the index.',
          },
          projectId: {
            type: Type.STRING,
            description: 'The Google Cloud project ID.',
          },
          environment: {
            type: Type.STRING,
            description:
              "Optional. API environment to use ('prod' or 'staging'). Defaults to 'staging'.",
            enum: ['prod', 'staging'],
            default: 'staging',
          },
        },
        required: ['indexId', 'location', 'projectId'],
      },
    );

    // Initialize GoogleAuth
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    this.client = new Gaxios();
  }

  validateParams(params: GetCodeRepositoryIndexParams): string | null {
    if (!params.indexId || params.indexId.trim() === '') {
      return "The 'indexId' parameter cannot be empty.";
    }
    if (!params.location || params.location.trim() === '') {
      return "The 'location' parameter cannot be empty.";
    }
    if (!params.projectId || params.projectId.trim() === '') {
      return "The 'projectId' parameter cannot be empty.";
    }
    return null;
  }

  getDescription(params: GetCodeRepositoryIndexParams): string {
    return `Getting details for code repository index "${params.indexId}" in project ${params.projectId}, location ${params.location} (env: ${params.environment || 'staging'})...`;
  }

  getApiEndpoint(environment: 'prod' | 'staging' = 'staging'): string {
    if (environment === 'prod') {
      return 'https://cloudaicompanion.googleapis.com';
    }
    return 'https://staging-cloudaicompanion.sandbox.googleapis.com';
  }

  private formatLabels(labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return 'N/A';
    }
    return (
      '\n' +
      Object.entries(labels)
        .map(([key, value]) => `    ${key}: ${value}`)
        .join('\n')
    );
  }

  async execute(
    params: GetCodeRepositoryIndexParams,
  ): Promise<GetCodeRepositoryIndexResult> {
    const validationError = this.validateParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: validationError,
      };
    }

    const env = params.environment || 'staging';
    const projectId = params.projectId;
    const location = params.location;
    const indexId = params.indexId;

    try {
      // 1. Get Auth Client and Token
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

      // 2. Construct the API URL
      const endpoint = this.getApiEndpoint(env);
      const indexName = `projects/${projectId}/locations/${location}/codeRepositoryIndexes/${indexId}`;
      const apiUrl = `${endpoint}/v1/${indexName}?alt=json`;

      console.log(`Calling API: ${apiUrl}`);

      // 3. Make the API call
      const response: GaxiosResponse<CodeRepositoryIndex> =
        await this.client.request<CodeRepositoryIndex>({
          url: apiUrl,
          method: 'GET',
          headers,
        });

      if (response.status !== 200) {
        throw new Error(
          `API request failed with status ${response.status}: ${response.statusText} ${JSON.stringify(response.data)}`,
        );
      }

      const index = response.data;

      // 4. Format the output for the LLM
      const formattedOutput = `Index Details for "${indexId}":
  Name: ${index.name}
  State: ${index.state || 'N/A'}
  Created: ${index.createTime || 'N/A'}
  Updated: ${index.updateTime || 'N/A'}
  Labels: ${this.formatLabels(index.labels)}
  KMS Key: ${index.kmsKey || 'N/A'}
  Etag: ${index.etag || 'N/A'}`;

      return {
        llmContent: formattedOutput,
        returnDisplay: `Successfully retrieved details for index "${indexId}".`,
        index,
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      console.error(
        `Error calling Get Code Repository Index API: ${errorMessage}`,
      );

      let displayError = 'Error getting code repository index.';
      if (
        errorMessage.includes('PERMISSION_DENIED') ||
        errorMessage.includes('403')
      ) {
        displayError =
          'Error: Permission denied. Ensure the caller has the necessary IAM roles (e.g., cloudaicompanion.codeRepositoryIndexes.get) on the project.';
      } else if (
        errorMessage.includes('NOT_FOUND') ||
        errorMessage.includes('404')
      ) {
        displayError = `Error: Index "${indexId}" not found in project "${projectId}" location "${location}" on ${env} environment.`;
      } else if (errorMessage.includes('enable the API')) {
        displayError = `Error: The API is not enabled. Please enable ${this.getApiEndpoint(env).replace('https://', '')} in project ${projectId}.`;
      } else if (
        errorMessage.includes('Failed to retrieve access token') ||
        errorMessage.includes('Could not refresh access token')
      ) {
        displayError =
          'Error: Authentication failed. Please run `gcloud auth login` and `gcloud auth application-default login`.';
      } else if (errorMessage.includes('API request failed')) {
        displayError = `Error: ${errorMessage}`;
      }

      return {
        llmContent: `Error getting index "${indexId}": ${errorMessage}`,
        returnDisplay: displayError,
      };
    }
  }
}
