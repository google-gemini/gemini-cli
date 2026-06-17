# Gemini CLI: Quotas and pricing

Gemini CLI is designed for professional and enterprise usage. Several options
are available depending on your authentication account type and project needs.

For a high-level comparison of available subscriptions and to select the right
quota for your needs, see the [Plans page](https://geminicli.com/plans/).

## Overview

This article outlines the specific quotas and pricing applicable to Gemini CLI
when using different authentication methods.

The following table summarizes the available quotas and their respective limits:

| Authentication method | Tier / Subscription    | Maximum requests per user per day |
| :-------------------- | :--------------------- | :-------------------------------- |
| **Gemini API key**    | Pay-as-you-go (Paid)   | Varies                            |
| **Vertex AI**         | Pay-as-you-go (Paid)   | Varies                            |
| **Google Workspace**  | Code Assist Standard   | 1,500 requests                    |
|                       | Code Assist Enterprise | 2,000 requests                    |
|                       | Workspace AI Ultra     | 2,000 requests                    |

Generally, there are two categories to choose from:

- Paid Tier (fixed price): For teams who need generous daily quotas and
  predictable costs.
- Pay-As-You-Go: The most flexible option for professional use, long-running
  tasks, or when you need full control over your usage.

Requests are limited per user per minute and are subject to the availability of
the service in times of high demand.

## Paid tier: Higher limits for a fixed cost

Several fixed-price subscriptions are available for teams and organizations:

### Through your organization

These tiers are applicable when you are signing in with a Google Workspace
account.

- You are on a workspace account if you see the message "You're currently signed
  in to your Google Workspace Account" when accessing Google services.

**Supported tiers:** _- Tiers not listed above, including Workspace AI
Standard/Plus and AI Expanded, are not supported._

- [Workspace AI Ultra Access](https://workspace.google.com/products/ai-ultra/).
- [Purchase a Gemini Code Assist Subscription through Google Cloud](https://cloud.google.com/gemini/docs/codeassist/overview).

  Quotas and pricing are based on a fixed price subscription with assigned
  license seats. For predictable costs, you can sign in with Google.

  This includes the following request limits:
  - Gemini Code Assist Standard edition:
    - 1500 maximum model requests / user / day
  - Gemini Code Assist Enterprise edition:
    - 2000 maximum model requests / user / day
  - Model requests will be made across the Gemini model family as determined by
    Gemini CLI.

  [Learn more about Gemini Code Assist license limits](https://developers.google.com/gemini-code-assist/resources/quotas#quotas-for-agent-mode-gemini-cli).

## Pay as you go

If you hit your daily request limits or exhaust your Gemini Pro quota even after
upgrading, the most flexible solution is to switch to a pay-as-you-go model,
where you pay for the specific amount of processing you use. This is the
recommended path for uninterrupted access.

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
models. This is the most direct way to use the models.

- Quota: Varies by pricing tier.
- Cost: Varies by pricing tier and model/token usage.

Learn more at
[Gemini API Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits),
[Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)

It’s important to highlight that when using an API key, you pay per token/call.
This can be more expensive for many small calls with few tokens, but it's the
only way to ensure your workflow isn't interrupted by reaching a limit on your
quota.

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
