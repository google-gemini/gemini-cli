# Gemini CLI: Quotas and Pricing

Gemini CLI offers a generous free tier that covers the use cases for many individual developers. For enterprise / professional usage, or if you need higher limits, there are multiple possible avenues depending on what type of account you use to authenticate.

See [privacy and terms](./tos-privacy.md) for details on Privacy policy and Terms of Service.

Note: published prices are list price; additional negotiated commercial discounting may apply.

This article outlines the specific quotas and pricing applicable to the Gemini CLI when using different authentication methods.

Generally, there are three categories to choose from:

- Free Usage: Ideal for experimentation and light use.
- Paid Tier (fixed price): For individual developers or enterprises who need more generous daily quotas and predictable costs.
- Pay-As-You-Go: The most flexible option for professional use, long-running tasks, or when you need full control over your usage.

## Free Usage

Your journey begins with a generous free tier, perfect for experimentation and light use.

Your free usage limits depend on your authorization type.

### Log in with Google (Gemini Code Assist for Individuals)

For users who authenticate by using their Google account to access Gemini Code Assist for individuals. This includes:

- 1000 model requests / user / day
- 60 model requests / user / minute
- Model requests will be made across the Gemini model family as determined by Gemini CLI.

Learn more at [Gemini Code Assist for Individuals Limits](https://developers.google.com/gemini-code-assist/resources/quotas#quotas-for-agent-mode-gemini-cli).

### Log in with Gemini API Key (Unpaid)

If you are using a Gemini API key, you can also benefit from a free tier. This includes:

- 250 model requests / user / day
- 10 model requests / user / minute
- Model requests to Flash model only.

Learn more at [Gemini API Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits).

### Log in with Vertex AI (Express Mode)

Vertex AI offers an Express Mode without the need to enable billing. This includes:

- 90 days before you need to enable billing.
- Quotas and models are variable and specific to your account.

Learn more at [Vertex AI Express Mode Limits](https://cloud.google.com/vertex-ai/generative-ai/docs/start/express-mode/overview#quotas).

## Paid tier: Higher limits for a fixed cost

If you use up your initial number of requests, you can upgrade your plan to continue to benefit from Gemini CLI by using the [Standard or Enterprise editions of Gemini Code Assist](https://cloud.google.com/products/gemini/pricing) by signing up [here](https://goo.gle/set-up-gemini-code-assist). Quotas and pricing are based on a fixed price subscription with assigned license seats. For predictable costs, you can log in with Google. This includes:

- Standard:
  - 1500 model requests / user / day
  - 120 model requests / user / minute
- Enterprise:
  - 2000 model requests / user / day
  - 120 model requests / user / minute
- Model requests will be made across the Gemini model family as determined by Gemini CLI.

Learn more at [Gemini Code Assist Standard and Enterprise license Limits](https://developers.google.com/gemini-code-assist/resources/quotas#quotas-for-agent-mode-gemini-cli).

## Pay As You Go

If you hit your daily request limits or exhaust your Gemini Pro quota even after upgrading, the most flexible solution is to switch to a pay-as-you-go model, where you pay for the specific amount of processing you use. This is the recommended path for uninterrupted access.

To do this, log in using a Gemini API key or Vertex AI.

- Vertex AI (Regular Mode):
  - Quota: Governed by a dynamic shared quota system or pre-purchased provisioned throughput.
  - Cost: Based on model and token usage.

Learn more at [Vertex AI Dynamic Shared Quota](https://cloud.google.com/vertex-ai/generative-ai/docs/resources/dynamic-shared-quota) and [Vertex AI Pricing](https://cloud.google.com/vertex-ai/pricing).

- Gemini API key:
  - Quota: Varies by pricing tier.
  - Cost: Varies by pricing tier and model/token usage.

Learn more at [Gemini API Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits), [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)

It’s important to highlight that when using an API key, you pay per token/call. This can be more expensive for many small calls with few tokens, but it's the only way to ensure your workflow isn't interrupted by quota limits.

## Google One and Ultra plans, Gemini for Workspace plans

These plans currently apply only to the use of Gemini web-based products provided by Google-based experiences (for example, the Gemini web app or the Flow video editor). These plans do not apply to the API usage which powers the Gemini CLI. Supporting these plans is under active consideration for future support.

## Tips to Avoid High Costs

When using a Pay as you Go API key, be mindful of your usage to avoid unexpected costs.

- Don't blindly accept every suggestion, especially for computationally intensive tasks like refactoring large codebases.
- Be intentional with your prompts and commands. You are paying per call, so think about the most efficient way to get the job done.

## Gemini API vs. Vertex

- Gemini API (gemini developer api): This is the fastest way to use the Gemini models directly.
- Vertex AI: This is the enterprise-grade platform for building, deploying, and managing Gemini models with specific security and control requirements.

## Understanding your usage

A summary of model usage is available through the `/stats` command and presented on exit at the end of a session.
