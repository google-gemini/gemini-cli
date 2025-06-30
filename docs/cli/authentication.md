# Authentication Setup

The Gemini CLI requires you to authenticate with Google's AI services. On initial startup you'll need to configure **one** of the following authentication methods:

1.  **Login with Google (Gemini Code Assist):**
    - Use this option to log in with your google account.
    - During initial startup, Gemini CLI will direct you to a webpage for authentication. Once authenticated, your credentials will be cached locally so the web login can be skipped on subsequent runs.
    - Note that the web login must be done in a browser that can communicate with the machine Gemini CLI is being run from. (Specifically, the browser will be redirected to a localhost url that Gemini CLI will be listening on).
    - <a id="workspace-gca">Users may have to specify a GOOGLE_CLOUD_PROJECT if:</a>
      1. You have a Google Workspace account. Google Workspace is a paid service for businesses and organizations that provides a suite of productivity tools, including a custom email domain (e.g. your-name@your-company.com), enhanced security features, and administrative controls. These accounts are often managed by an employer or school.
      1. You have received a free Code Assist license through the [Google Developer Program](https://developers.google.com/program/plans-and-pricing) (including qualified Google Developer Experts)
      1. You have been assigned a license to a current Gemini Code Assist standard or enterprise subscription.
      1. You are using the product outside the [supported regions](https://developers.google.com/gemini-code-assist/resources/available-locations) for free individual usage.>
      1. You are a Google account holder under the age of 18
      - If you fall into one of these categories, you must first configure a Google Cloud Project Id to use, [enable the Gemini for Cloud API](https://cloud.google.com/gemini/docs/discover/set-up-gemini#enable-api) and [configure access permissions](https://cloud.google.com/gemini/docs/discover/set-up-gemini#grant-iam).

      You can set the environment variable in your current shell session using the following command:

      ```bash
      export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"
      ```

2.  **<a id="gemini-api-key"></a>Gemini API key:**
    - Obtain your API key from Google AI Studio: [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
    - Set the `GEMINI_API_KEY` environment variable. In the following methods, replace `YOUR_GEMINI_API_KEY` with the API key you obtained from Google AI Studio:
      - You can set the environment variable in your current shell session using the following command:
        ```bash
        export GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
        ```

3.  **Vertex AI:**
    The access method for Vertex AI depends on whether you are using Google Cloud express mode or not. To check if you are using Express mode, log into the console. At the upper left, if you are in express mode, you will not have a project name in the upper right. It will look something like this: <img width="839" alt="image" src="https://github.com/user-attachments/assets/6472d11b-61a4-4353-a1bd-48ef54dc6e44" />

    - If *using* express mode:
      - Set the `GOOGLE_API_KEY` environment variable. In the following methods, replace `YOUR_GOOGLE_API_KEY` with your Vertex AI API key provided by express mode:
        - You can set these environment variables in your current shell session using the following commands:
          ```bash
          export GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY"
          export GOOGLE_GENAI_USE_VERTEXAI=true
          ```
          
    - If *not using* express mode:
      - Ensure you have a Google Cloud project and have enabled the Vertex AI API.
      - Set up Application Default Credentials (ADC), using the following command:
        ```bash
        gcloud auth application-default login
        ```
        For more information, see [Set up Application Default Credentials for Google Cloud](https://cloud.google.com/docs/authentication/provide-credentials-adc).
      - Set the `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, and `GOOGLE_GENAI_USE_VERTEXAI` environment variables. In the following methods, replace `YOUR_PROJECT_ID` and `YOUR_PROJECT_LOCATION` with the relevant values for your project:
        - You can set these environment variables in your current shell session using the following commands:
          ```bash
          export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"
          export GOOGLE_CLOUD_LOCATION="YOUR_PROJECT_LOCATION" # e.g., us-central1
          export GOOGLE_GENAI_USE_VERTEXAI=true
          ```
