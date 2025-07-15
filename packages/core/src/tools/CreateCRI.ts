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

// Interface for the fields settable during creation
interface CreateCodeRepositoryIndexRequest {
  displayName?: string;
  // Add other mutable fields if known for creation
}

/**
 * Parameters for the CreateCodeRepositoryIndexTool.
 */
export interface CreateCodeRepositoryIndexParams {
  /**
   * The ID to assign to the new Code Repository Index.
   */
  indexId: string;

  /**
   * The Google Cloud location (region) for the new index.
   */
  location: string;

  /**
   * The Google Cloud project ID.
   */
  projectId: string;

  /**
   * Optional display name for the new index.
   */
  displayName?: string;

  /**
   * Optional. API environment to use ('prod' or 'staging'). Defaults to 'staging'.
   */
  environment?: 'prod' | 'staging';
}

/**
 * Result from the CreateCodeRepositoryIndexTool.
 */
export interface CreateCodeRepositoryIndexResult extends ToolResult {
  operation?: LongRunningOperation;
}

/**
 * A tool to create a Code Repository Index using the REST API.
 */
export class CreateCRITool extends BaseTool<
  CreateCodeRepositoryIndexParams,
  CreateCodeRepositoryIndexResult
> {
  static readonly Name: string = 'create_code_repository_index';
  private auth: GoogleAuth;
  private client: Gaxios;

  constructor(private readonly config: Config) {
    super(
      CreateCRITool.Name,
      'Create Code Repository Index',
      'Creates a specific Code Repository Index using the API. This starts a long running operation.',
      {
        type: Type.OBJECT,
        properties: {
          indexId: {
            type: Type.STRING,
            description:
              'The ID for the new Code Repository Index (e.g., "my-new-instance").',
          },
          location: {
            type: Type.STRING,
            description: 'The Google Cloud location (region).',
          },
          projectId: {
            type: Type.STRING,
            description: 'The Google Cloud project ID.',
          },
          displayName: {
            type: Type.STRING,
            description: 'Optional display name for the index.',
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

  validateParams(params: CreateCodeRepositoryIndexParams): string | null {
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

  getDescription(params: CreateCodeRepositoryIndexParams): string {
    return `Creating code repository index "${params.indexId}" in project ${params.projectId}, location ${params.location} (env: ${params.environment || 'staging'})...`;
  }

  getApiEndpoint(environment: 'prod' | 'staging' = 'staging'): string {
    if (environment === 'prod') {
      return 'https://cloudaicompanion.googleapis.com';
    }
    return 'https://staging-cloudaicompanion.sandbox.googleapis.com';
  }

  async execute(
    params: CreateCodeRepositoryIndexParams,
  ): Promise<CreateCodeRepositoryIndexResult> {
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

      // 2. Construct the API URL for POST
      const endpoint = this.getApiEndpoint(env);
      const parent = `projects/${projectId}/locations/${location}`;
      const apiUrl = `${endpoint}/v1/${parent}/codeRepositoryIndexes?codeRepositoryIndexId=${indexId}&alt=json`;

      // 3. Prepare the request body
      const requestBody: CreateCodeRepositoryIndexRequest = {};
      if (params.displayName) {
        requestBody.displayName = params.displayName;
      }

      console.log(`Calling API: POST ${apiUrl}`);
      console.log(`Request Body: ${JSON.stringify(requestBody)}`);

      // 4. Make the POST API call
      const response: GaxiosResponse<LongRunningOperation> =
        await this.client.request<LongRunningOperation>({
          url: apiUrl,
          method: 'POST',
          headers,
          data: requestBody, // Use data for POST body in Gaxios
        });

      if (response.status !== 200) {
        // Successful initiation of LRO usually returns 200
        throw new Error(
          `API request failed with status ${response.status}: ${response.statusText} ${JSON.stringify(response.data)}`,
        );
      }

      const operation = response.data;

      // 5. Format the output for the LLM
      const formattedOutput = `Create request issued for index "${indexId}".
Operation Name: ${operation.name}
Status: ${operation.done ? 'Completed' : 'In Progress'}
To check the status, use a tool to get operation details with the name above.`;

      return {
        llmContent: formattedOutput,
        returnDisplay: `Successfully initiated creation for index "${indexId}". Operation: ${operation.name}`,
        operation,
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      console.error(
        `Error calling Create Code Repository Index API: ${errorMessage}`,
      );

      let displayError = 'Error creating code repository index.';
      if (
        errorMessage.includes('PERMISSION_DENIED') ||
        errorMessage.includes('403')
      ) {
        displayError =
          'Error: Permission denied. Ensure the caller has the necessary IAM roles (e.g., cloudaicompanion.codeRepositoryIndexes.create) on the project.';
      } else if (
        errorMessage.includes('ALREADY_EXISTS') ||
        errorMessage.includes('409')
      ) {
        displayError = `Error: Index "${indexId}" already exists in project "${projectId}" location "${location}" on ${env} environment.`;
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
        llmContent: `Error creating index "${indexId}": ${errorMessage}`,
        returnDisplay: displayError,
      };
    }
  }
}
