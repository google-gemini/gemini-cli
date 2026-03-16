# Gemini CLI: Quotas and pricing

Gemini CLI offers a generous free tier that covers many individual developers'
use cases. For enterprise or professional usage, or if you need increased quota,
several options are available depending on your authentication account type.

For a high-level comparison of available subscriptions and to select the right
quota for your needs, see the [Plans page](https://geminicli.com/plans/).

## Overview

This article outlines the specific quotas and pricing applicable to Gemini CLI
when using different authentication methods.

Generally, there are three categories to choose from:

- Free Usage: Ideal for experimentation and light use.
- Paid Tier (fixed price): For individual developers or enterprises who need
  more generous daily quotas and predictable costs.
- Pay-As-You-Go: The most flexible option for professional use, long-running
  tasks, or when you need full control over your usage.

## Additional Gemini Code Assist feature quotas

Gemini Code Assist enforces quotas for certain features that may also affect
Gemini CLI workflows.

- Local codebase awareness: **1,000,000 token context window**
- Code customization repositories: **20,000**

These quotas apply to the underlying Gemini Code Assist infrastructure used by
Gemini CLI and related tools.

## Free usage

Access to Gemini CLI begins with a generous free tier, perfect for
experimentation and light use.

Your free usage depends on the **authentication method** you use to access
Gemini CLI.

### Log in with Google (Gemini Code Assist for individuals)

For users who authenticate by using their Google account to access Gemini Code
Assist for individuals. This includes:

- 1000 requests per user per day
- 60 requests per user per minute
- Requests may be distributed across the Gemini model family as determined by
  Gemini CLI.

Learn more at
[Gemini Code Assist for Individuals Limits](https://developers.google.com/gemini-code-assist/resources/quotas#quotas-for-agent-mode-gemini-cli).

### Log in with Gemini API Key (unpaid)

If you are using a Gemini API key, you can also benefit from a free tier. This
includes:

- 250 requests per user per day
- 10 requests per user per minute
- Requests are limited to **Gemini Flash models only**

Learn more at
[Gemini API Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits).

### Log in with Vertex AI (Express Mode)

Vertex AI offers an Express Mode without the need to enable billing. This
includes:

- 90 days before you need to enable billing.
- Quotas and models are variable and specific to your account.

Learn more at
[Vertex AI Express Mode Limits](https://cloud.google.com/vertex-ai/generative-ai/docs/start/express-mode/overview#quotas).

## Paid tier: Higher limits for a fixed cost

If you use up your initial number of requests, you can continue to benefit from
Gemini CLI by upgrading to one of the following subscriptions:

### Individuals

These tiers apply when you sign in with a personal account. To verify whether
you're on a personal account, visit
[Google One](https://one.google.com/about/plans?hl=en-US&g1_landing_page=0):

- If you are on a personal account, you will see your personal dashboard.
- If you are not on a personal account, you will see: "You're currently signed
  in to your Google Workspace Account."

**Supported tiers:** _Only the tiers listed below are currently supported. Other
tiers (for example Google AI Plus) are not currently supported._

- [Google AI Pro and AI Ultra](https://gemini.google/subscriptions/). These
  subscriptions are recommended for individual developers. Quotas and pricing
  are based on a fixed price subscription.

  Learn more at
  [Gemini Code Assist Quotas and Limits](https://developers.google.com/gemini-code-assist/resources/quotas)

### Through your organization

These tiers are applicable when signing in with a Google Workspace account.

- To verify your account type, visit
  [the Google One page](https://one.google.com/about/plans?hl=en-US&g1_landing_page=0).
- You are on a workspace account if you see the message "You're currently signed
  in to your Google Workspace Account".

**Supported tiers:** _Only the tiers listed below are currently supported. Other
tiers (for example Workspace AI Standard/Plus and AI Expanded) are not
supported._

- [Workspace AI Ultra Access](https://workspace.google.com/products/ai-ultra/).
- [Purchase a Gemini Code Assist Subscription through Google Cloud](https://cloud.google.com/gemini/docs/codeassist/overview).

  Quotas and pricing are based on a fixed price subscription with assigned
  license seats.

  This includes the following request limits:
  - Gemini Code Assist Standard edition:
    - 1500 requests per user per day
    - 120 requests per user per minute

  - Gemini Code Assist Enterprise edition:
    - 2000 requests per user per day
    - 120 requests per user per minute

  - Requests may be made across the Gemini model family as determined by Gemini
    CLI.

  [Learn more about Gemini Code Assist license limits](https://developers.google.com/gemini-code-assist/resources/quotas#quotas-for-agent-mode-gemini-cli).

  **Note:** Quotas for requests from **Gemini Code Assist agent mode and Gemini
  CLI are shared**. A single prompt may trigger multiple requests.

  For detailed quota information, see the official Gemini Code Assist quotas
  documentation:
  [Gemini Code Assist quotas documentation](https://developers.google.com/gemini-code-assist/resources/quotas)

## Additional quotas for Gemini Code Assist on GitHub

Usage of Gemini Code Assist on GitHub is not counted as part of the general
quotas for Gemini Code Assist.

- Consumer version: 33 pull request reviews per day
- Enterprise version (Preview): at least 100 pull request reviews per day

The exact number of pull request reviews may vary depending on the number of
model calls required per review.

## Pay as you go

If you hit your daily request limits or require **higher throughput than the
free or subscription tiers provide**, the most flexible solution is to switch to
a pay-as-you-go model, where you pay for the specific amount of processing you
use. This is the recommended path for uninterrupted access.

To do this, log in using a Gemini API key or Vertex AI.

### Vertex AI (regular mode)

An enterprise-grade platform for building, deploying, and managing AI models,
including Gemini. It offers enhanced security, data governance, and integration
with other Google Cloud services.

- Quota: Governed by a dynamic shared quota system or pre-purchased provisioned
  throughput.
- Cost: Based on model and token usage.

Learn more at
[Vertex AI Dynamic Shared Quota](https://cloud.google.com/vertex-ai/generative-ai/docs/resources/dynamic-shared-quota)
and [Vertex AI Pricing](https://cloud.google.com/vertex-ai/pricing).

### Gemini API key

Ideal for developers who want to quickly build applications with the Gemini
models.

- Quota: Varies by pricing tier.
- Cost: Varies by pricing tier and model/token usage.

When using an API key, billing is based on token usage and API calls.

Learn more at
[Gemini API Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits),
[Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)

## Gemini for workspace plans

These plans currently apply only to the use of Gemini web-based products
provided by Google-based experiences (for example, the Gemini web app or the
Flow video editor). These plans do not apply to the API usage which powers the
Gemini CLI. Supporting these plans is under active consideration for future
support.

## Check usage and limits

You can check your current token usage and applicable limits using the
`/stats model` command. This command provides a snapshot of your current
session's token usage, as well as information about the limits associated with
your current quota.

For more information on the `/stats` command and its subcommands, see the
[Command Reference](../reference/commands.md#stats).

A summary of model usage is also presented on exit at the end of a session.

## Tips to avoid high costs

When using a pay-as-you-go plan, be mindful of your usage to avoid unexpected
costs.

- **Be selective with suggestions**: Before accepting a suggestion, especially
  for a computationally intensive task like refactoring a large codebase,
  consider if it's the most cost-effective approach.
- **Use precise prompts**: You are paying per call, so think about the most
  efficient way to get your desired result. A well-crafted prompt can often get
  you the answer you need in a single call, rather than multiple back-and-forth
  interactions.
- **Monitor your usage**: Use the `/stats model` command to track your token
  usage during a session. This can help you stay aware of your spending in real
  time.
