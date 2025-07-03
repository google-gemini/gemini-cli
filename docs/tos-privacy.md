# Gemini CLI: Terms of Service and Privacy Notice

Gemini CLI is an open-source tool that lets you interact with Google's powerful language models directly from your command-line interface. The Terms of Service and Privacy notices that apply to your usage of Gemini CLI depend on the type of account you use to authenticate with Google. See [quota and pricing](./quota-and-pricing.md) for details on the quota and pricing details that apply to your usage of Gemini CLI.

This article outlines the specific terms and privacy policies applicable for different auth methods.

## 1. Login with Google (Gemini Code Assist for [individuals](https://developers.google.com/gemini-code-assist/docs/overview#supported-features-gca))

For users who authenticate using their Google account to access Gemini Code Assist for individuals:

- Terms of Service: Your use of Gemini CLI is governed by the general [Google Terms of Service](https://policies.google.com/terms?hl=en-US).
- Privacy Notice: The collection and use of your data are described in the [Gemini Code Assist Privacy Notice for Individuals](https://developers.google.com/gemini-code-assist/resources/privacy-notice-gemini-code-assist-individuals).

## 2. Gemini API Key (Using Gemini Developer [API](https://ai.google.dev/gemini-api/docs) a: Unpaid Service, b: Paid Service)

If you are using a Gemini API key for authentication, the following terms apply:

- Terms of Service: Your use is subject to the [Gemini API Terms of Service](https://ai.google.dev/gemini-api/terms). For a. [Unpaid Service](https://ai.google.dev/gemini-api/terms#unpaid-services) or b. [Paid Service](https://ai.google.dev/gemini-api/terms#paid-services)
- Privacy Notice: Information regarding data handling and privacy is detailed in the general [Google Privacy Policy](https://policies.google.com/privacy).

## 3. Login with Google (for Workspace or Licensed Code Assist users)

For users of Standard or Enterprise [edition](https://cloud.google.com/gemini/docs/codeassist/overview#editions-overview) of Gemini Code Assist:

- Terms of Service: The [Google Cloud Platform Terms of Service](https://cloud.google.com/terms) govern your use of the service.
- Privacy Notice: The handling of your data is outlined in the [Gemini Code Assist Privacy Notices](https://developers.google.com/gemini-code-assist/resources/privacy-notices).

## 4. Vertex AI (Using Vertex AI Gen [API](https://cloud.google.com/vertex-ai/generative-ai/docs/reference/rest))

If you are using an API key with a Vertex AI Gen API backend:

- Terms of Service: Your usage is governed by the [Google Cloud Platform Service Terms](https://cloud.google.com/terms/service-terms/).
- Privacy Notice: The [Google Cloud Privacy Notice](https://cloud.google.com/terms/cloud-privacy-notice) describes how your data is collected and managed.

### Usage Statistics Opt-Out

You may opt-out from sending Usage Statistics to Google data by following the instructions available here: [Usage Statistics Configuration](./cli/configuration.md#usage-statistics).

## Frequently Asked Questions (FAQ) for Gemini CLI

### 1. Is my code, including prompts and answers, used to train Google's models?

This depends entirely on the type of auth method you use.

- **Auth method 1:** Yes. When you use your personal Google account, the Gemini Code Assist Privacy Notice for Individuals applies. Under this notice, your **prompts, answers, and related code are collected** and may be used to improve Google's products, which includes model training.
- **Auth method 2a:** Yes. When you use the Gemini API key Gemini API (Unpaid Service) terms apply. Under this notice , your **prompts, answers, and related code are collected** and may be used to improve Google's products, which includes model training.
- **Auth method 2b, 3 & 4:** No. For these accounts, your data is governed by the Google Cloud or Gemini API (Paid Service) terms, which treat your inputs as confidential. Your code, prompts, and other inputs are **not** used to train models.

### 2. What are "Usage Statistics" and what does the opt-out control?

The "Usage Statistics" setting is the single control for all optional data collection in the Gemini CLI. The data it collects depends on your account type:

- **Auth method 1:** When enabled, this setting allows Google to collect both anonymous telemetry (like commands run and performance metrics) and **your prompts and answers** for model improvement.
- **Auth method 2a:** When enabled, this setting allows Google to collect both anonymous telemetry (like commands run and performance metrics) and **your prompts and answers** for model improvement. When disabled we will use your data as described in the [How Google Uses Your Data](https://ai.google.dev/gemini-api/terms#data-use-unpaid).
- **Auth method 2b:** This setting only controls the collection of anonymous telemetry. Google logs prompts and responses for a limited period of time, solely for the purpose of detecting violations of the Prohibited Use Policy and any required legal or regulatory disclosures
- **Auth methods 3 & 4:** This setting only controls the collection of anonymous telemetry. Your prompts and answers are never collected, regardless of this setting.

You can disable Usage Statistics for any account type by following the instructions in the [Usage Statistics Configuration](./cli/configuration.md#usage-statistics) documentation.
