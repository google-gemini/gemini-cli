How AuthType is selecter?

Available Authentication Methods

From packages/core/src/core/contentGenerator.ts:50-56, there are 5 auth types:

export enum AuthType { LOGIN_WITH_GOOGLE = 'oauth-personal', USE_GEMINI =
'gemini-api-key', USE_VERTEX_AI = 'vertex-ai', LEGACY_CLOUD_SHELL =
'cloud-shell', COMPUTE_ADC = 'compute-default-credentials', }

Configuration Methods

1. Interactive Selection (UI)

When you run the CLI, you'll see an auth dialog
(packages/cli/src/ui/auth/AuthDialog.tsx:44-77) with these options:

- Login with Google (oauth)
- Use Gemini API Key
- Vertex AI
- Use Cloud Shell user credentials (if in Cloud Shell)

The selected value is saved to settings.merged.security.auth.selectedType.

2. Use Gemini API Key

Environment Variable: export GEMINI_API_KEY="your-api-key-here"

Code Logic (contentGenerator.ts:91-96):

- When AuthType.USE_GEMINI is selected AND GEMINI_API_KEY is set:
  - Sets vertexai: false
  - Uses the Gemini API directly

3. Use Vertex AI

Environment Variables:

# Option 1: Using API key

export GOOGLE_API_KEY="your-google-api-key"

# Option 2: Using GCP project + location (ADC)

export GOOGLE_CLOUD_PROJECT="your-project-id" export
GOOGLE_CLOUD_LOCATION="us-central1" # or your region

Code Logic (contentGenerator.ts:98-106):

- When AuthType.USE_VERTEX_AI is selected AND either:
  - GOOGLE_API_KEY is set, OR
  - Both GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION are set
- Then sets vertexai: true

4. Set Default Auth Type

export GEMINI_DEFAULT_AUTH_TYPE="vertex-ai"

# or

export GEMINI_DEFAULT_AUTH_TYPE="gemini-api-key"

# or

export GEMINI_DEFAULT_AUTH_TYPE="oauth-personal"

This pre-selects the auth method in the dialog (AuthDialog.tsx:86-92).

How selectedType Gets Set

The value is set through:

1. User selection in UI → AuthDialog.tsx:121
2. App container → AppContainer.tsx:515
3. Logout command → authCommand.ts:36 (sets to undefined)

Summary

To use Vertex AI for login:

1. Set environment variables: export GOOGLE_CLOUD_PROJECT="your-project" export
   GOOGLE_CLOUD_LOCATION="us-central1" export
   GEMINI_DEFAULT_AUTH_TYPE="vertex-ai"
2. Select "Vertex AI" in the auth dialog

To use Gemini API:

1. Set environment variable: export GEMINI_API_KEY="your-key" export
   GEMINI_DEFAULT_AUTH_TYPE="gemini-api-key"
2. Select "Use Gemini API Key" in the dialog
