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
 * Parameters for the DeleteCodeRepositoryIndexTool.
 */
export interface DeleteCodeRepositoryIndexParams {
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
 * Result from the DeleteCodeRepositoryIndexTool.
 */
export interface DeleteCodeRepositoryIndexResult extends ToolResult {
  operation?: LongRunningOperation;
}

/**
 * A tool to delete a single Code Repository Index using the REST API.
 */
export class DeleteCRITool extends BaseTool<
  DeleteCodeRepositoryIndexParams,
  DeleteCodeRepositoryIndexResult
> {
  static readonly Name: string = 'delete_code_repository_index';
  private auth: GoogleAuth;
  private client: Gaxios;

  constructor(private readonly config: Config) {
    super(
      DeleteCRITool.Name,
      'Delete Code Repository Index',
      'Deletes a specific Code Repository Index using the API. This starts a long running operation.',
      {
        type: Type.OBJECT,
        properties: {
          indexId: {
            type: Type.STRING,
            description:
              'The ID of the Code Repository Index to delete (e.g., "my-instance").',
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

  validateParams(params: DeleteCodeRepositoryIndexParams): string | null {
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

  getDescription(params: DeleteCodeRepositoryIndexParams): string {
    return `Deleting code repository index "${params.indexId}" in project ${params.projectId}, location ${params.location} (env: ${params.environment || 'staging'})...`;
  }

  getApiEndpoint(environment: 'prod' | 'staging' = 'staging'): string {
    if (environment === 'prod') {
      return 'https://cloudaicompanion.googleapis.com';
    }
    return 'https://staging-cloudaicompanion.sandbox.googleapis.com';
  }

  async execute(
    params: DeleteCodeRepositoryIndexParams,
  ): Promise<DeleteCodeRepositoryIndexResult> {
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

      // 2. Construct the API URL for DELETE
      const endpoint = this.getApiEndpoint(env);
      const indexName = `projects/${projectId}/locations/${location}/codeRepositoryIndexes/${indexId}`;
      const apiUrl = `${endpoint}/v1/${indexName}?alt=json`;

      console.log(`Calling API: DELETE ${apiUrl}`);

      // 3. Make the DELETE API call
      const response: GaxiosResponse<LongRunningOperation> =
        await this.client.request<LongRunningOperation>({
          url: apiUrl,
          method: 'DELETE',
          headers,
        });

      if (response.status !== 200) {
        throw new Error(
          `API request failed with status ${response.status}: ${response.statusText} ${JSON.stringify(response.data)}`,
        );
      }

      const operation = response.data;

      // 4. Format the output for the LLM
      const formattedOutput = `Delete request issued for index "${indexId}".
Operation Name: ${operation.name}
Status: ${operation.done ? 'Completed' : 'In Progress'}
To check the status of this operation, you can use a tool to get operation details using the name above.`;

      return {
        llmContent: formattedOutput,
        returnDisplay: `Successfully initiated deletion for index "${indexId}". Operation: ${operation.name}`,
        operation,
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      console.error(
        `Error calling Delete Code Repository Index API: ${errorMessage}`,
      );

      let displayError = 'Error deleting code repository index.';
      if (
        errorMessage.includes('PERMISSION_DENIED') ||
        errorMessage.includes('403')
      ) {
        displayError =
          'Error: Permission denied. Ensure the caller has the necessary IAM roles (e.g., cloudaicompanion.codeRepositoryIndexes.delete) on the project.';
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
        llmContent: `Error deleting index "${indexId}": ${errorMessage}`,
        returnDisplay: displayError,
      };
    }
  }
}
