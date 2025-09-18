# Gemini CLI - GCP IAP Fork

This fork of the Gemini CLI is modified to support authentication to a self-hosted LiteLLM instance running on Google Cloud Platform (GCP) and protected by Identity-Aware Proxy (IAP).

## Purpose

The primary goal of this fork is to enable seamless authentication with a LiteLLM backend that is secured using GCP's IAP. It extends the default authentication mechanism to include fetching a Google-signed ID token and passing it as a `Proxy-Authorization` header in requests to the LiteLLM service.

## How it Works

The changes are made in `packages/core/src/core/contentGenerator.ts`. The modified code checks for the presence of two environment variables:

-   `IAP_CLIENT_ID`: The client ID of the IAP-secured application.
-   `GOOGLE_APPLICATION_CREDENTIALS`: The path to the GCP service account key file.

If both variables are set, the CLI uses the `google-auth-library` to generate an ID token for the specified IAP client ID. This token is then added as a `Bearer` token in the `Proxy-Authorization` header of all outgoing requests to the Gemini/LiteLLM endpoint.

## Configuration

To use this fork, you need to set the following environment variables:

| Variable | Description |
| --- | --- |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to your GCP service account JSON key file. The service account needs the "IAP-secured Web App User" role on the IAP-protected resource. |
| `IAP_CLIENT_ID` | The OAuth 2.0 client ID of the IAP-secured application. You can find this in the GCP console under "APIs & Services" -> "Credentials". |
| `GOOGLE_GEMINI_BASE_URL` | The URL of your self-hosted LiteLLM instance. |
| `GEMINI_API_KEY` | Your LiteLLM API key. |

### Example

Here is an example of how to set the environment variables:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/gcp-credentials.json
export IAP_CLIENT_ID=YOUR_IAP_CLIENT_ID.apps.googleusercontent.com
export GOOGLE_GEMINI_BASE_URL=https://your-litellm-instance.com
export GEMINI_API_KEY=your-litellm-api-key
```

With these variables set, you can run the Gemini CLI as usual, and it will automatically handle the IAP authentication.
