/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Centralized utility for validating Google Cloud Project ID configuration.
 * This ensures consistent validation logic across the codebase.
 */

/**
 * Validates if a string is a valid Google Cloud Project ID format.
 *
 * Valid project IDs must:
 * - Be 6-30 characters long
 * - Start with a lowercase letter
 * - Contain only lowercase letters, digits, and hyphens
 * - Not end with a hyphen
 *
 * @param projectId The project ID to validate
 * @returns true if the format is valid, false otherwise
 */
export function isValidProjectIdFormat(projectId: string): boolean {
  if (typeof projectId !== 'string') {
    return false;
  }

  // GCP project ID rules:
  // - 6-30 characters
  // - Must start with a lowercase letter
  // - Can contain lowercase letters, digits, and hyphens
  // - Cannot end with a hyphen
  const projectIdRegex = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
  return projectIdRegex.test(projectId);
}

/**
 * Checks if a valid Google Cloud Project ID is configured in the environment.
 *
 * A project ID is considered valid if:
 * 1. Either GOOGLE_CLOUD_PROJECT or GOOGLE_CLOUD_PROJECT_ID is set
 * 2. The value is a non-empty string after trimming
 * 3. The value is a string type (not null, undefined, or other types)
 *
 * Note: This function does NOT validate the project ID format, only that it exists.
 * Use isValidProjectIdFormat() to validate the format.
 *
 * @returns The project ID if valid, undefined otherwise
 */
export function getConfiguredProjectId(): string | undefined {
  const projectId =
    process.env['GOOGLE_CLOUD_PROJECT'] ||
    process.env['GOOGLE_CLOUD_PROJECT_ID'];

  // Validate that projectId is a string and not empty after trimming
  if (typeof projectId === 'string' && projectId.trim().length > 0) {
    return projectId.trim();
  }

  return undefined;
}

/**
 * Checks if a Google Cloud Project ID is configured.
 *
 * @returns true if a valid project ID is configured, false otherwise
 */
export function hasConfiguredProjectId(): boolean {
  return getConfiguredProjectId() !== undefined;
}

/**
 * Gets a standardized error message for missing project ID.
 *
 * @param context Additional context about where/why the project ID is needed
 * @returns A formatted error message with actionable steps
 */
export function getMissingProjectIdMessage(context?: string): string {
  const contextPrefix = context ? `${context}\n\n` : '';

  return (
    contextPrefix +
    'GOOGLE_CLOUD_PROJECT environment variable is not set.\n\n' +
    'To fix this:\n' +
    '1. Set the environment variable: export GOOGLE_CLOUD_PROJECT="your-project-id"\n' +
    '2. Or add it to your .env file: GOOGLE_CLOUD_PROJECT=your-project-id\n' +
    '3. Get your project ID from: https://console.cloud.google.com/\n\n' +
    'This associates your Gemini CLI requests with your Google Cloud project.\n' +
    'Learn more: https://goo.gle/gemini-cli-auth-docs#workspace-gca'
  );
}

/**
 * Gets a standardized error message for invalid project ID.
 *
 * @param projectId The invalid project ID that was provided
 * @returns A formatted error message with actionable steps
 */
export function getInvalidProjectIdMessage(projectId: string): string {
  // Sanitize the project ID for display to prevent any potential issues
  // Only allow alphanumeric, hyphens, and underscores (valid GCP project ID chars)
  const sanitizedProjectId = String(projectId)
    .replace(/[^a-zA-Z0-9-_]/g, '')
    .slice(0, 100); // Limit length for display

  return (
    `Invalid Google Cloud project: "${sanitizedProjectId}"\n\n` +
    'The project ID you specified does not exist or you do not have access to it.\n\n' +
    'To fix this:\n' +
    '1. Verify your project ID at: https://console.cloud.google.com/\n' +
    '2. Update GOOGLE_CLOUD_PROJECT with the correct project ID\n' +
    '3. Ensure you have the necessary permissions for this project\n\n' +
    'Learn more: https://goo.gle/gemini-cli-auth-docs#workspace-gca'
  );
}
