import { SchemaValidator } from '../utils/schemaValidator.js';
import { BaseTool, ToolResult } from './tools.js';
import { ToolCallConfirmationDetails } from '../ui/types.js'; // Added for shouldConfirmExecute
import { getErrorMessage } from '../utils/errors.js';

/**
 * Parameters for the WebFetch tool
 */
export interface WebFetchToolParams {
  /**
   * The URL to fetch content from.
   */
  url: string;
}

/**
 * Implementation of the WebFetch tool that reads content from a URL.
 */
export class WebFetchTool extends BaseTool<WebFetchToolParams, ToolResult> {
  static readonly Name: string = 'web_fetch';

  /**
   * Creates a new instance of the WebFetchTool
   */
  constructor() {
    super(
      WebFetchTool.Name,
      'WebFetch',
      'Fetches text content from a given URL. Handles potential network errors and non-success HTTP status codes.',
      {
        properties: {
          url: {
            description:
              "The URL to fetch. Must be an absolute URL (e.g., 'https://example.com/file.txt').",
            type: 'string',
          },
        },
        required: ['url'],
        type: 'object',
      },
    );
    // No rootDirectory needed for web fetching
  }

  /**
   * Validates the parameters for the WebFetch tool
   * @param params Parameters to validate
   * @returns An error message string if invalid, null otherwise
   */
  invalidParams(params: WebFetchToolParams): string | null {
    // 1. Validate against the basic schema first
    if (
      this.schema.parameters &&
      !SchemaValidator.validate(
        this.schema.parameters as Record<string, unknown>,
        params,
      )
    ) {
      return 'Parameters failed schema validation.';
    }

    // 2. Validate the URL format and protocol
    try {
      const parsedUrl = new URL(params.url);
      // Ensure it's an HTTP or HTTPS URL
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return `Invalid URL protocol: "${parsedUrl.protocol}". Only 'http:' and 'https:' are supported.`;
      }
    } catch {
      // The URL constructor throws if the format is invalid
      return `Invalid URL format: "${params.url}". Please provide a valid absolute URL (e.g., 'https://example.com').`;
    }

    // If all checks pass, the parameters are valid
    return null;
  }

  /**
   * Gets a description of the web fetch operation.
   * @param params Parameters for the web fetch.
   * @returns A string describing the operation.
   */
  getDescription(params: WebFetchToolParams): string {
    // Shorten long URLs for display
    const displayUrl =
      params.url.length > 80 ? params.url.substring(0, 77) + '...' : params.url;
    return `Fetching content from ${displayUrl}`;
  }

  /**
   * Determines if the tool should prompt for confirmation before execution.
   * Web fetches are generally safe, so default to false.
   * @param params Parameters for the tool execution
   * @returns Whether execute should be confirmed.
   */
  async shouldConfirmExecute(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    params: WebFetchToolParams,
  ): Promise<ToolCallConfirmationDetails | false> {
    // Could add logic here to confirm based on domain, etc. if needed
    return Promise.resolve(false);
  }

  /**
   * Fetches content from the specified URL.
   * @param params Parameters for the web fetch operation.
   * @returns Result with the fetched content or an error message.
   */
  async execute(params: WebFetchToolParams): Promise<ToolResult> {
    const validationError = this.invalidParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: `**Error:** Invalid parameters. ${validationError}`,
      };
    }

    const url = params.url;

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'GeminiCode-CLI/1.0',
        },
        signal: AbortSignal.timeout(15000), // 15 seconds timeout
      });

      if (!response.ok) {
        // fetch doesn't throw on bad HTTP status codes (4xx, 5xx)
        const errorText = `Failed to fetch data from ${url}. Status: ${response.status} ${response.statusText}`;
        return {
          llmContent: `Error: ${errorText}`,
          returnDisplay: `**Error:** ${errorText}`,
        };
      }

      // Assuming the response is text. Add checks for content-type if needed.
      const data = await response.text();
      let llmContent = '';
      // Truncate very large responses for the LLM context
      const MAX_LLM_CONTENT_LENGTH = 200000;
      if (data) {
        llmContent = `Fetched data from ${url}:\n\n${
          data.length > MAX_LLM_CONTENT_LENGTH
            ? data.substring(0, MAX_LLM_CONTENT_LENGTH) +
              '\n... [Content truncated]'
            : data
        }`;
      } else {
        llmContent = `No data fetched from ${url}. Status: ${response.status}`;
      }
      return {
        llmContent,
        returnDisplay: `Fetched content from ${url}`, // Simple display message
      };
    } catch (error: unknown) {
      // This catches network errors (DNS resolution, connection refused, etc.)
      // and errors from the URL constructor if somehow bypassed validation (unlikely)
      const errorMessage = `Failed to fetch data from ${url}. Error: ${getErrorMessage(error)}`;
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `**Error:** ${errorMessage}`,
      };
    }
  }
}
