# Authentication Setup

The Gemini CLI requires you to authenticate with Google's AI services. On initial startup you'll need to configure **one** of the following authentication methods:

1.  **Login with Google (Gemini Code Assist):**
    - Use this option to log in with your Google account.
    - During initial startup, Gemini CLI will direct you to a webpage for authentication. Once authenticated, your credentials will be cached locally so the web login can be skipped on subsequent runs.
    - Note that the web login must be done in a browser that can communicate with the machine Gemini CLI is being run from. (Specifically, the browser will be redirected to a localhost url that Gemini CLI will be listening on).
    - <a id="workspace-gca">Users may have to specify a GOOGLE_CLOUD_PROJECT if:</a>
      1. You have a Google Workspace account. Google Workspace is a paid service for businesses and organizations that provides a suite of productivity tools, including a custom email domain (e.g. your-name@your-company.com), enhanced security features, and administrative controls. These accounts are often managed by an employer or school.
      1. You have received a Gemini Code Assist license through the [Google Developer Program](https://developers.google.com/program/plans-and-pricing) (including qualified Google Developer Experts)
      1. You have been assigned a license to a current Gemini Code Assist standard or enterprise subscription.
      1. You are using the product outside the [supported regions](https://developers.google.com/gemini-code-assist/resources/available-locations) for free individual usage.
      1. You are a Google account holder under the age of 18
      - If you fall into one of these categories, you must first configure a Google Cloud Project ID to use, [enable the Gemini for Cloud API](https://cloud.google.com/gemini/docs/discover/set-up-gemini#enable-api) and [configure access permissions](https://cloud.google.com/gemini/docs/discover/set-up-gemini#grant-iam).

      You can temporarily set the environment variable in your current shell session using the following command:

      ```bash
      export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"
      ```

      - For repeated use, you can add the environment variable to your [.env file](#persisting-environment-variables-with-env-files) or your shell's configuration file (like `~/.bashrc`, `~/.zshrc`, or `~/.profile`). For example, the following command adds the environment variable to a `~/.bashrc` file:

      ```bash
      echo 'export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"' >> ~/.bashrc
      source ~/.bashrc
      ```

2.  **<a id="gemini-api-key"></a>Gemini API key:**
    - Obtain your API key from Google AI Studio: [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
    - Set the `GEMINI_API_KEY` environment variable. In the following methods, replace `YOUR_GEMINI_API_KEY` with the API key you obtained from Google AI Studio:
      - You can temporarily set the environment variable in your current shell session using the following command:
        ```bash
        export GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
        ```
      - For repeated use, you can add the environment variable to your [.env file](#persisting-environment-variables-with-env-files).

      - Alternatively you can export the API key from your shell's configuration file (like `~/.bashrc`, `~/.zshrc`, or `~/.profile`). For example, the following command adds the environment variable to a `~/.bashrc` file:

        ```bash
        echo 'export GEMINI_API_KEY="YOUR_GEMINI_API_KEY"' >> ~/.bashrc
        source ~/.bashrc
        ```

        :warning: Be advised that when you export your API key inside your shell configuration file, any other process executed from the shell can read it.

3.  **Vertex AI:**
    - **API Key:**
      - Obtain your Google Cloud API key: [Get an API Key](https://cloud.google.com/vertex-ai/generative-ai/docs/start/api-keys?usertype=newuser)
      - Set the `GOOGLE_API_KEY` environment variable. In the following methods, replace `YOUR_GOOGLE_API_KEY` with your Vertex AI API key:
        - You can temporarily set the environment variable in your current shell session using the following command:
          ```bash
          export GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY"
          ```
        - For repeated use, you can add the environment variable to your [.env file](#persisting-environment-variables-with-env-files) or your shell's configuration file (like `~/.bashrc`, `~/.zshrc`, or `~/.profile`). For example, the following command adds the environment variable to a `~/.bashrc` file:

          ```bash
          echo 'export GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY"' >> ~/.bashrc
          source ~/.bashrc
          ```

          :warning: Be advised that when you export your API key inside your shell configuration file, any other process executed from the shell can read it.

          > **Note:**
          > If you encounter an error like `"API keys are not supported by this API - Expected OAuth2 access token or other authentication credentials that assert a principal"`, it is likely that your organization has restricted the creation of service account API keys. In this case, please try the [service account JSON key](#service-account-json-key) method described below.

    - **Application Default Credentials (ADC):**

      > **Note:**
      > If you have previously set the `GOOGLE_API_KEY` or `GEMINI_API_KEY` environment variables, you must unset them to use Application Default Credentials.
      >
      > ```bash
      > unset GOOGLE_API_KEY GEMINI_API_KEY
      > ```
      - **Using `gcloud` (for local development):**
        - Ensure you have a Google Cloud project and have enabled the Vertex AI API.
        - Log in with your user credentials:
          ```bash
          gcloud auth application-default login
          ```
          For more information, see [Set up Application Default Credentials for Google Cloud](https://cloud.google.com/docs/authentication/provide-credentials-adc).
      - **<a id="service-account-json-key"></a>Using a Service Account (for applications or when service account API keys are restricted):**
        - If you are unable to create an API key due to [organization policies](https://cloud.google.com/vertex-ai/generative-ai/docs/start/api-keys?usertype=existinguser#expandable-2), or if you are running in a non-interactive environment, you can authenticate using a service account key.
        - [Create a service account and key](https://cloud.google.com/iam/docs/keys-create-delete), and download the JSON key file. The service account will need to be assigned the "Vertex AI User" role.
        - Set the `GOOGLE_APPLICATION_CREDENTIALS` environment variable to the absolute path of the JSON file.
          - You can temporarily set the environment variable in your current shell session:
            ```bash
            export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/keyfile.json"
            ```
          - For repeated use, you can add the command to your shell's configuration file (e.g., `~/.bashrc`).
            ```bash
            echo 'export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/keyfile.json"' >> ~/.bashrc
            source ~/.bashrc
            ```
            :warning: Be advised that when you export service account credentials inside your shell configuration file, any other process executed from the shell can read it.

      - **Required Environment Variables for ADC:**
        - When using ADC (either with `gcloud` or a service account), you must also set the `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION` environment variables. In the following methods, replace `YOUR_PROJECT_ID` and `YOUR_PROJECT_LOCATION` with the relevant values for your project:
          - You can temporarily set these environment variables in your current shell session using the following commands:
            ```bash
            export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"
            export GOOGLE_CLOUD_LOCATION="YOUR_PROJECT_LOCATION" # e.g., us-central1
            ```
          - For repeated use, you can add the environment variables to your [.env file](#persisting-environment-variables-with-env-files) or your shell's configuration file (like `~/.bashrc`, `~/.zshrc`, or `~/.profile`). For example, the following commands add the environment variables to a `~/.bashrc` file:
            ```bash
            echo 'export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"' >> ~/.bashrc
            echo 'export GOOGLE_CLOUD_LOCATION="YOUR_PROJECT_LOCATION"' >> ~/.bashrc
            source ~/.bashrc
            ```

4.  **Cloud Shell:**
    - This option is only available when running in a Google Cloud Shell environment.
    - It automatically uses the credentials of the logged-in user in the Cloud Shell environment.
    - This is the default authentication method when running in Cloud Shell and no other method is configured.

          :warning: Be advised that when you export your API key inside your shell configuration file, any other process executed from the shell can read it.

### Persisting Environment Variables with `.env` Files

You can create a **`.gemini/.env`** file in your project directory or in your home directory. Creating a plain **`.env`** file also works, but `.gemini/.env` is recommended to keep Gemini variables isolated from other tools.

**Important:** Some environment variables (like `DEBUG` and `DEBUG_MODE`) are automatically excluded from project `.env` files to prevent interference with gemini-cli behavior. Use `.gemini/.env` files for gemini-cli specific variables.

Gemini CLI automatically loads environment variables from the **first** `.env` file it finds, using the following search order:

1. Starting in the **current directory** and moving upward toward `/`, for each directory it checks:
   1. `.gemini/.env`
   2. `.env`
2. If no file is found, it falls back to your **home directory**:
   - `~/.gemini/.env`
   - `~/.env`

> **Important:** The search stops at the **first** file encountered—variables are **not merged** across multiple files.

#### Examples

**Project-specific overrides** (take precedence when you are inside the project):

```bash
mkdir -p .gemini
echo 'GOOGLE_CLOUD_PROJECT="your-project-id"' >> .gemini/.env
```

**User-wide settings** (available in every directory):

```bash
mkdir -p ~/.gemini
cat >> ~/.gemini/.env <<'EOF'
GOOGLE_CLOUD_PROJECT="your-project-id"
GEMINI_API_KEY="your-gemini-api-key"
EOF
```

## Non-Interactive Mode / Headless Environments

When running the Gemini CLI in a non-interactive environment, you cannot use the interactive login flow.
Instead, you must configure authentication using environment variables.

The CLI will automatically detect if it is running in a non-interactive terminal and will use one of the
following authentication methods if available:

1.  **Gemini API Key:**
    - Set the `GEMINI_API_KEY` environment variable.
    - The CLI will use this key to authenticate with the Gemini API.

2.  **Vertex AI:**
    - Set the `GOOGLE_GENAI_USE_VERTEXAI=true` environment variable.
    - **Using an API Key:** Set the `GOOGLE_API_KEY` environment variable.
    - **Using Application Default Credentials (ADC):**
      - Run `gcloud auth application-default login` in your environment to configure ADC.
      - Ensure the `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION` environment variables are set.

If none of these environment variables are set in a non-interactive session, the CLI will exit with an error.
