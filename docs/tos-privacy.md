# Gemini CLI: Terms of Service and Privacy Notice

Gemini CLI is an open-source tool that lets you interact with Google's powerful language models directly from your command-line interface. The Terms of Service and Privacy Notices that apply to your use of the Gemini CLI depend on how you authenticate with Google.

This article outlines the specific terms and privacy policies applicable for different account types and authentication methods. Note: See [quotas and pricing](./quota-and-pricing.md) for the quota and pricing details that apply to your usage of the Gemini CLI.

## How to determine your authentication method

Your authentication method refers to the method you use to log into and access the Gemini CLI. The specific Terms of Service that apply depend on your authentication method and subscription type, as summarized below.

| Authentication | Subscription | Eligible Accounts | Terms of Service |
| :--- | :--- | :--- | :--- |
| **Login with Google** | Free Tier (for individuals) | @gmail.com<br>@yourdomain.com (Workspace accounts) | [Google Terms of Service](https://policies.google.com/terms?hl=en-US) |
| | Standard or Enterprise (for business) | @gmail.com<br>@yourdomain.com (Workspace accounts) | [Google Cloud Platform Terms of Service](https://cloud.google.com/terms) |
| **Use Gemini API Key** | Free Tier | @gmail.com<br>@yourdomain.com (Workspace accounts)  | [Gemini API Terms of Service (Free)](https://ai.google.dev/gemini-api/terms#unpaid-services) |
| | Pay as you go | @gmail.com<br>@yourdomain.com (Workspace accounts)  | [Gemini API Terms of Service (Paid)](https://ai.google.dev/gemini-api/terms#paid-services) |
| **Vertex AI** | Pay as you go | @gmail.com<br>@yourdomain.com (Workspace accounts)  | [Google Cloud Platform Service Terms](https://cloud.google.com/terms/service-terms/) |

***

## 1. Login with Google: Free Tier (for individuals)

For users who authenticate with their Google account on the free tier, these documents apply:

* **Terms of Service:** Your use of the Gemini CLI is governed by the [Google Terms of Service](https://policies.google.com/terms?hl=en-US).
* **Privacy Notice:** The collection and use of your data is described in the [Gemini Code Assist Privacy Notice for Individuals](https://developers.google.com/gemini-code-assist/resources/privacy-notice-gemini-code-assist-individuals).

***

## 2. Login with Google: Standard or Enterprise (for business)

For business users who authenticate with their Google account on a Standard or Enterprise plan, these documents apply:

* **Terms of Service:** Your use of the Gemini CLI is governed by the [Google Cloud Platform Terms of Service](https://cloud.google.com/terms).
* **Privacy Notice:** The collection and use of your data is described in the [Gemini Code Assist Privacy Notices for Standard and Enterprise Users](https://cloud.google.com/gemini/docs/codeassist/security-privacy-compliance#standard_and_enterprise_data_protection_and_privacy).

***

## 3. Use Gemini API Key

If you are using a Gemini API key for authentication, these documents apply:

* **Terms of Service:** Your use of the Gemini CLI is governed by the [Gemini API Terms of Service](https://ai.google.dev/gemini-api/terms). These terms differ depending on your subscription:
    * **Free Tier:** Refer to the [Gemini API Terms of Service - Unpaid Services](https://ai.google.dev/gemini-api/terms#unpaid-services).
    * **Pay as you go:** Refer to the [Gemini API Terms of Service - Paid Services](https://ai.google.dev/gemini-api/terms#paid-services).
* **Privacy Notice:** The collection and use of your data is described in the [Google Privacy Policy](https://policies.google.com/privacy).

***

## 4. Vertex AI

If you are authenticating with Vertex AI, these documents apply:

* **Terms of Service:** Your use of the Gemini CLI is governed by the [Google Cloud Platform Service Terms](https://cloud.google.com/terms/service-terms/).
* **Privacy Notice:** The collection and use of your data is described in the [Google Cloud Privacy Notice](https://cloud.google.com/terms/cloud-privacy-notice).

***

### Usage Statistics Opt-Out

You may opt out of sending Usage Statistics to Google by following the instructions available here: [Usage Statistics Configuration](./cli/configuration.md#usage-statistics).

***

## Frequently Asked Questions (FAQ) for the Gemini CLI

### 1. Is my code, including prompts and answers, used to train Google's models?

This depends on your authentication method and subscription. By default (if you have not opted out):

* **Login with Google (Free Tier):** Yes. The [Gemini Code Assist Privacy Notice for Individuals](https://developers.google.com/gemini-code-assist/resources/privacy-notice-gemini-code-assist-individuals) applies, and your **prompts, answers, and related code are collected** and may be used to improve Google's products, including for model training.
* **Login with Google (Standard or Enterprise):** No. Your data is governed by the [Gemini Code Assist Privacy Notices](https://cloud.google.com/gemini/docs/codeassist/security-privacy-compliance#standard_and_enterprise_data_protection_and_privacy), which treat your inputs as confidential. Your **prompts, answers, and related code are not collected** or used to train models.
* **Use Gemini API Key:** This depends on your subscription.
    * **Free Tier:** Yes. The [Gemini API Terms of Service - Unpaid Services](https://ai.google.dev/gemini-api/terms#unpaid-services) apply. Your **prompts, answers, and related code are collected** and may be used for model training.
    * **Pay as you go:** No. The [Gemini API Terms of Service - Paid Services](https://ai.google.dev/gemini-api/terms#paid-services) apply, which treats your inputs as confidential. Your data is **not collected** or used to train models.
* **Vertex AI:** No. Your data is governed by the [Google Cloud Privacy Notice](https://cloud.google.com/terms/cloud-privacy-notice), which treats your inputs as confidential. Your data is **not collected** or used to train models.

### 2. What are Usage Statistics and what does the opt-out control?

The **Usage Statistics** setting is the single control for all optional data collection in the Gemini CLI. What it controls depends on your account and authentication type:

* **Login with Google (Free Tier):** When enabled, this allows Google to collect both anonymous telemetry (e.g., commands run) and **your prompts and answers, including code,** for model improvement.
* **Login with Google (Standard or Enterprise):** This setting only controls the collection of anonymous telemetry. Your prompts and answers are never collected, regardless of this setting.
* **Use Gemini API Key:**
    * **Free Tier:** When enabled, this setting allows Google to collect both anonymous telemetry and **your prompts and answers, including code,** for model improvement. When disabled, we will use your data as described in [How Google Uses Your Data](https://ai.google.dev/gemini-api/terms#data-use-unpaid).
    * **Pay as you go:** This setting only controls the collection of anonymous telemetry.
* **Vertex AI:** This setting only controls the collection of anonymous telemetry. Your prompts and answers are never collected, regardless of this setting.

Please refer to the Privacy Notice for your authentication method for more details. You can disable Usage Statistics by following the instructions in the [Usage Statistics Configuration](./cli/configuration.md#usage-statistics) documentation.
