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

// Interface for the CodeRepositoryIndex resource
interface CodeRepositoryIndex {
  name: string;
  createTime?: string;
  updateTime?: string;
  state?: string;
  labels?: Record<string, string>;
  kmsKey?: string;
  etag?: string;
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

// Interface for the fields within CodeRepositoryIndex that can be included in the PATCH body
interface CodeRepositoryIndexUpdateBody {
  labels?: Record<string, string>;
}

/**
 * Parameters for the UpdateCodeRepositoryIndexTool.
 */
export interface UpdateCodeRepositoryIndexParams {
  /** The ID of the Code Repository Index. */
  indexId: string;
  /** The Google Cloud location (region). */
  location: string;
  /** The Google Cloud project ID. */
  projectId: string;

  /** Optional. API environment. Defaults to 'staging'. */
  environment?: 'prod' | 'staging';
  /** Optional. for request idempotency. */
  requestId?: string;

  // Label operations (At most one of these can be specified)
  /** Replace all existing labels with this set. */
  setLabels?: Record<string, string>;
  /** Add these labels or update existing ones. */
  updateLabels?: Record<string, string>;
  /** Remove all labels. */
  clearLabels?: boolean;
  /** Remove labels with these keys. */
  removeLabels?: string[];
}

/**
 * Result from the UpdateCodeRepositoryIndexTool.
 */
export interface UpdateCodeRepositoryIndexResult extends ToolResult {
  operation?: LongRunningOperation;
}

/**
 * A tool to update a Code Repository Index, primarily for managing labels.
 */
export class UpdateCRITool extends BaseTool<
  UpdateCodeRepositoryIndexParams,
  UpdateCodeRepositoryIndexResult
> {
  static readonly Name: string = 'update_code_repository_index';
  private auth: GoogleAuth;
  private client: Gaxios;

  constructor(private readonly config: Config) {
    super(
      UpdateCRITool.Name,
      'Update Code Repository Index Labels',
      'Updates labels on a specific Code Repository Index. Supports set, update, clear, or remove operations for labels. This starts a long running operation.',
      {
        type: Type.OBJECT,
        properties: {
          indexId: { type: Type.STRING, description: 'The ID of the index.' },
          location: {
            type: Type.STRING,
            description: 'The Google Cloud location.',
          },
          projectId: {
            type: Type.STRING,
            description: 'The Google Cloud project ID.',
          },
          environment: {
            type: Type.STRING,
            enum: ['prod', 'staging'],
            default: 'staging',
          },
          requestId: {
            type: Type.STRING,
            description: 'Optional UUID for idempotency.',
          },
          setLabels: {
            type: Type.OBJECT,
            //items: { type: Type.STRING },
            description: 'Replace all labels with this set.',
          },
          updateLabels: {
            type: Type.OBJECT,
            //items: { type: Type.STRING },
            description: 'Add or update these labels.',
          },
          clearLabels: { type: Type.BOOLEAN, description: 'Remove all labels.' },
          removeLabels: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'List of label keys to remove.',
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

  private isValidUUID(uuid: string): boolean {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return (
      uuidRegex.test(uuid) && uuid !== '00000000-0000-0000-0000-000000000000'
    );
  }

  validateParams(params: UpdateCodeRepositoryIndexParams): string | null {
    if (!params.indexId?.trim()) return "The 'indexId' parameter is required.";
    if (!params.location?.trim())
      return "The 'location' parameter is required.";
    if (!params.projectId?.trim())
      return "The 'projectId' parameter is required.";

    const labelOps = [
      params.setLabels,
      params.updateLabels,
      params.clearLabels,
      params.removeLabels,
    ].filter((op) => op !== undefined).length;

    if (labelOps > 1) {
      return 'At most one of setLabels, updateLabels, clearLabels, or removeLabels can be specified.';
    }
    if (labelOps === 0) {
      return 'One of setLabels, updateLabels, clearLabels, or removeLabels must be specified to perform an update.';
    }

    if (params.requestId && !this.isValidUUID(params.requestId)) {
      return 'requestId must be a valid UUID.';
    }
    return null;
  }

  getDescription(params: UpdateCodeRepositoryIndexParams): string {
    return `Updating labels for index "${params.indexId}" in project ${params.projectId}, location ${params.location}...`;
  }

  getApiEndpoint(environment: 'prod' | 'staging' = 'staging'): string {
    return environment === 'prod'
      ? 'https://cloudaicompanion.googleapis.com'
      : 'https://staging-cloudaicompanion.sandbox.googleapis.com';
  }

  private async executeGaxios<T>(
    options: GaxiosOptions,
  ): Promise<GaxiosResponse<T>> {
    try {
      return await this.client.request<T>(options);
    } catch (error: any) {
      const msg = getErrorMessage(error);
      const details = error.response?.data
        ? JSON.stringify(error.response.data)
        : 'No details';
      console.error(
        `Gaxios request to ${options.url} failed: ${msg} - ${details}`,
      );
      throw error; // Re-throw to be caught in execute
    }
  }

  // GET the current state of the index
  private async getCurrentIndex(
    indexName: string,
    headers: Record<string, string>,
    endpoint: string,
  ): Promise<CodeRepositoryIndex> {
    const apiUrl = `${endpoint}/v1/${indexName}?alt=json`;
    console.log(`Getting current index: GET ${apiUrl}`);
    const response = await this.executeGaxios<CodeRepositoryIndex>({
      url: apiUrl,
      method: 'GET',
      headers,
    });
    return response.data;
  }

  async execute(
    params: UpdateCodeRepositoryIndexParams,
  ): Promise<UpdateCodeRepositoryIndexResult> {
    const validationError = this.validateParams(params);
    if (validationError) {
      return {
        llmContent: `Invalid Parameters: ${validationError}`,
        returnDisplay: validationError,
      };
    }

    const env = params.environment || 'staging';
    const projectId = params.projectId;
    const location = params.location;
    const indexId = params.indexId;
    const endpoint = this.getApiEndpoint(env);
    const indexName = `projects/${projectId}/locations/${location}/codeRepositoryIndexes/${indexId}`;

    try {
      const authClient = await this.auth.getClient();
      const token = await authClient.getAccessToken();
      if (!token.token) throw new Error('Failed to retrieve access token.');

      const headers = {
        Authorization: `Bearer ${token.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Goog-User-Project': projectId,
      };

      // 1. Get current labels (Read)
      const currentIndex = await this.getCurrentIndex(
        indexName,
        headers,
        endpoint,
      );
      let newLabels: Record<string, string> = {
        ...(currentIndex.labels || {}),
      };

      // 2. Modify labels based on params
      if (params.setLabels !== undefined) {
        newLabels = params.setLabels;
      } else if (params.updateLabels !== undefined) {
        newLabels = { ...newLabels, ...params.updateLabels };
      } else if (params.clearLabels === true) {
        newLabels = {};
      } else if (params.removeLabels !== undefined) {
        params.removeLabels.forEach((key) => {
          delete newLabels[key];
        });
      }

      // 3. PATCH the index with updated labels (Write)
      const urlParams = new URLSearchParams();
      urlParams.append('updateMask', 'labels');
      urlParams.append('requestId', params.requestId || uuidv4());
      urlParams.append('alt', 'json');

      const apiUrl = `${endpoint}/v1/${indexName}?${urlParams.toString()}`;
      const requestBody: CodeRepositoryIndexUpdateBody = { labels: newLabels };

      console.log(`Calling API: PATCH ${apiUrl}`);
      console.log(`Request Body: ${JSON.stringify(requestBody)}`);

      const response = await this.executeGaxios<LongRunningOperation>({
        url: apiUrl,
        method: 'PATCH',
        headers,
        data: requestBody,
      });

      const operation = response.data;
      return {
        llmContent: `Label update request issued for index "${indexId}". Operation: ${operation.name}`,
        returnDisplay: `Successfully initiated label update for index "${indexId}". Operation: ${operation.name}`,
        operation,
      };
    } catch (error: any) {
      const errorMessage = getErrorMessage(error);
      const errorDetails = error.response?.data
        ? JSON.stringify(error.response.data)
        : '';
      console.error(
        `Error updating index labels: ${errorMessage} - Details: ${errorDetails}`,
      );

      let displayError = 'Error updating code repository index labels.';
      const apiErrorMsg = error.response?.data?.error?.message;

      if (error.response?.status === 403) {
        displayError =
          'Error: Permission denied (403). Ensure role cloudaicompanion.codeRepositoryIndexes.update.';
      } else if (error.response?.status === 404) {
        displayError = `Error: Index "${indexId}" not found (404).`;
      } else if (error.response?.status === 400) {
        displayError = `Error: Bad Request (400). API Message: ${apiErrorMsg || errorMessage}`;
      } else {
        displayError = `Error: ${apiErrorMsg || errorMessage} - Details: ${errorDetails}`;
      }

      return {
        llmContent: `Error updating index "${indexId}": ${errorMessage} - ${errorDetails}`,
        returnDisplay: displayError,
      };
    }
  }
}
