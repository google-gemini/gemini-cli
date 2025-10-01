# Gemini CLI Authentication Setup

Gemini CLI requires authentication using Google's services. Before using Gemini CLI, configure **one** of the following authentication methods:

- Interactive mode:
  - Recommended: Login with Google
  - Use Gemini API key
  - Use Vertex AI
- Headless (non-interactive) mode
- Google Cloud Shell

## Quick Check: Running in Google Cloud Shell?

If you are running the Gemini CLI within a Google Cloud Shell environment, authentication is typically automatic using your Cloud Shell credentials.

## Authenticate in Interactive mode

When you run Gemini CLI through the command-line, Gemini CLI will provide the following options:

```bash
> 1. Login with Google
> 2. Use Gemini API key
> 3. Vertex AI
```

The following sections provide instructions for each of these authentication options.

### Recommended: Login with Google

If you are running Gemini CLI on your local machine, the simplest method is logging in with your Google account.

> **Important:** Use this method if you are a **Google AI Pro** or **Google AI Ultra** subscriber.

1. Select **Login with Google**. Gemini CLI will open a login prompt using your web browser.

   If you are a **Google AI Pro** or **Google AI Ultra** subscriber, login with the Google account associated with your subscription.

2. Follow the on-screen instructions. Your credentials will be cached locally for future sessions.

   > **Note:** This method requires a web browser on a machine that can communicate with the terminal running the CLI (e.g., your local machine). The browser will be redirected to a `localhost` URL that the CLI listens on during setup.

#### (Optional) Set your GOOGLE_CLOUD_PROJECT

When you log in using a Google account, you may be prompted to select a `GOOGLE_CLOUD_PROJECT`.

This can be necessary if you are:

- Using a Google Workspace account.
- Using a Gemini Code Assist license from the Google Developer Program.
- Using a license from a Gemini Code Assist subscription.
- Using the product outside the [supported regions](https://developers.google.com/gemini-code-assist/resources/available-locations) for free individual usage.
- A Google account holder under the age of 18.

If you fall into one of these categories, you must:

1.  Have a Google Cloud Project ID.
2.  [Enable the Gemini for Cloud API](https://cloud.google.com/gemini/docs/discover/set-up-gemini#enable-api).
3.  [Configure necessary IAM access permissions](https://cloud.google.com/gemini/docs/discover/set-up-gemini#grant-iam).

To set the project ID, export the `GOOGLE_CLOUD_PROJECT` environment variable:

```bash
# Replace YOUR_PROJECT_ID with your actual Google Cloud Project ID
export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"
```

To make this setting persistent, see [Persisting Environment Variables](#persisting-environment-variables).

### Use Gemini API Key

If you don't want to authenticate using your Google account, you can use an API key from Google AI Studio.

1.  Obtain your API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
2.  Set the `GEMINI_API_KEY` environment variable:

    ```bash
    # Replace YOUR_GEMINI_API_KEY with the key from AI Studio
    export GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
    ```

To make this setting persistent, see [Persisting Environment Variables](#persisting-environment-variables).

> **Warning:** Treat API keys, especially for services like Gemini, as sensitive credentials. Protect them to prevent unauthorized access and potential misuse of the service under your account.

### Use Vertex AI

If you intend to use Google Cloud's Vertex AI platform, you have several authentication options:

- Application Default Credentials (ADC) and `gcloud`.
- A Service Account JSON key.
- A Google Cloud API key.

#### First: Set required environment variables

Regardless of your method of authentication, you'll typically need to set the following variables: `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION`.

To set these variables:

```bash
# Replace with your project ID and desired location (e.g., us-central1)
export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"
export GOOGLE_CLOUD_LOCATION="YOUR_PROJECT_LOCATION"
```

#### A. Vertex AI - Application Default Credentials (ADC) using `gcloud`

Consider this method of authentication if you have Google Cloud CLI installed.

> **Note:** If you have previously set `GOOGLE_API_KEY` or `GEMINI_API_KEY`, you must unset them to use ADC:

```bash
unset GOOGLE_API_KEY GEMINI_API_KEY
```

1.  Ensure you have a Google Cloud project and Vertex AI API is enabled.
2.  Log in to Google Cloud:

    ```bash
    gcloud auth application-default login
    ```

    See [Set up Application Default Credentials](https://cloud.google.com/docs/authentication/provide-credentials-adc) for details.

3.  Ensure `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION` are set.

#### B. Vertex AI - Service Account JSON key

Consider this method of authentication in non-interactive environments, CI/CD, or if your organization restricts user-based ADC or API key creation.

> **Note:** If you have previously set `GOOGLE_API_KEY` or `GEMINI_API_KEY`, you must unset them:

```bash
unset GOOGLE_API_KEY GEMINI_API_KEY
```

1.  [Create a service account and key](https://cloud.google.com/iam/docs/keys-create-delete) and download the provided JSON file. Assign the "Vertex AI User" role to the service account.
2.  Set the `GOOGLE_APPLICATION_CREDENTIALS` environment variable to the JSON file's absolute path:

    ```bash
    # Replace /path/to/your/keyfile.json with the actual path
    export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/keyfile.json"
    ```

3.  Ensure `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION` are set.

> **Warning:** Protect your service account key file as it provides access to your resources.

#### C. Vertex AI - Google Cloud API key

1.  Obtain a Google Cloud API key: [Get an API Key](https://cloud.google.com/vertex-ai/generative-ai/docs/start/api-keys?usertype=newuser).
2.  Set the `GOOGLE_API_KEY` environment variable:

    ```bash
    # Replace YOUR_GOOGLE_API_KEY with your Vertex AI API key
    export GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY"
    ```

    > **Note:** If you see errors like `"API keys are not supported by this API..."`, your organization might restrict API key usage for this service. Try the [Service Account JSON Key](#b-vertex-ai-service-account-json-key) or [ADC](#a-vertex-ai-application-default-credentials-adc-using-gcloud) methods instead.

To make any of these Vertex AI environment variable settings persistent, see [Persisting Environment Variables](#persisting-environment-variables).

## Persisting Environment Variables

To avoid setting environment variables in every terminal session, you can:

1.  **Add your environment variables to your shell configuration file:** Append the `export ...` commands to your shell's startup file (e.g., `~/.bashrc`, `~/.zshrc`, or `~/.profile`) and reload your shell (e.g., `source ~/.bashrc`).

    ```bash
    # Example for .bashrc
    echo 'export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"' >> ~/.bashrc
    source ~/.bashrc
    ```

    > **Warning:** Be advised that when you export API keys or service account paths in your shell configuration file, any process executed from the shell can potentially read them.

2.  **Use a `.env` file:** Create a `.gemini/.env` file in your project directory or home directory. Gemini CLI automatically loads variables from the first `.env` file it finds, searching up from the current directory, then in `~/.gemini/.env` or `~/.env`. `.gemini/.env` is recommended.

    Example for user-wide settings:

    ```bash
    mkdir -p ~/.gemini
    cat >> ~/.gemini/.env <<'EOF'
    GOOGLE_CLOUD_PROJECT="your-project-id"
    # Add other variables like GEMINI_API_KEY as needed
    EOF
    ```

    Variables are loaded from the first file found, not merged.

## Non-interactive mode / headless environments

Non-interative mode / headless environments will use your existing authentication method, if an existing authentication credential is cached.

If you have not already logged in with an authentication credential (such as a Google account), you **must** configure authentication using environment variables:

1.  **Gemini API Key:** Set `GEMINI_API_KEY`.
2.  **Vertex AI:**
    - Set `GOOGLE_GENAI_USE_VERTEXAI=true`.
    - **With Google Cloud API Key:** Set `GOOGLE_API_KEY`.
    - **With ADC:** Ensure ADC is configured (e.g., via a service account with `GOOGLE_APPLICATION_CREDENTIALS`) and set `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION`.

The CLI will exit with an error in non-interactive mode if no suitable environment variables are found.

## What's next?

Your authentication method affects your quotas, pricing, Terms of Service, and privacy notices. Review the following pages to learn more:

- [Gemini CLI: Quotas and Pricing](../quota-and-pricing.md).
- [Gemini CLI: Terms of Service and Privacy Notice](../tos-privacy.md).
