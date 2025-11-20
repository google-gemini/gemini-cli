# Gemini 3 Pro on Gemini CLI (Join the Waitlist)

We’re excited to bring Gemini 3 Pro to Gemini CLI. For Google AI Ultra users
(Google AI Ultra for Business is not currently supported) and paid Gemini and
Vertex API key holders, Gemini 3 Pro is already available and ready to enable.
For everyone else, we're gradually expanding access
[through a waitlist](https://goo.gle/geminicli-waitlist-signup). Sign up for the
waitlist now to access Gemini 3 Pro once approved.

**Note:** Please wait until you have been approved to use Gemini 3 Pro to enable
**Preview Features**. If enabled early, the CLI will fallback to Gemini 2.5 Pro.

## Do I need to join the waitlist?

The following users will be **automatically granted access** to Gemini 3 Pro on
Gemini CLI:

- Google AI Ultra subscribers (excluding Google AI Ultra for Business, which is
  on the roadmap).
- Gemini API key users
  [with access to Gemini 3](https://ai.google.dev/gemini-api/docs/rate-limits).
- Vertex API key users
  [with access to Gemini 3](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/quotas).

For **Gemini Code Assist Enterprise users**, access is coming soon.

Users not automatically granted access through one of these account types will
need to join the waitlist. This includes Google AI Pro, Gemini Code Assist
standard, and free tier users.

Note: Whether you’re automatically granted access or accepted from the waitlist,
you’ll still need to enable Gemini 3 Pro
[using the `/settings` command](../cli/settings.md).

## How to join the waitlist

Users not automatically granted access will need to join the waitlist. Follow
these instructions to sign up:

- Install Gemini CLI.
- Authenticate using the **Login with Google** option. You’ll see a banner that
  says “Gemini 3 is now available.” If you do not see this banner, update your
  installation of Gemini CLI to the most recent version.
- Fill out this Google form:
  [Access Gemini 3 in Gemini CLI](https://goo.gle/geminicli-waitlist-signup).
  Provide the email address of the account you used to authenticate with Gemini
  CLI.

Users will be onboarded in batches, subject to availability. When you’ve been
granted access to Gemini 3 Pro, you’ll receive an acceptance email to your
submitted email address.

## How to use Gemini 3 Pro with Gemini CLI

Once you receive your acceptance email–or if you are automatically granted
access–you still need to enable Gemini 3 Pro within Gemini CLI.

To enable Gemini 3 Pro, use the `/settings` command in Gemini CLI and set
**Preview Features** to `true`.

For more information, see [Gemini CLI Settings](../cli/settings.md).

### Usage limits and fallback

Gemini CLI will tell you when you reach your Gemini 3 Pro daily usage limit.
When you encounter that limit, you’ll be given the option to switch to Gemini
2.5 Pro, upgrade for higher limits, or stop. You’ll also be told when your usage
limit resets and Gemini 3 Pro can be used again.

Similarly, when you reach your daily usage limit for Gemini 2.5 Pro, you’ll see
a message prompting fallback to Gemini 2.5 Flash.

### Capacity errors

There may be times when the Gemini 3 Pro model is overloaded. When that happens,
Gemini CLI will ask you to decide whether you want to keep trying Gemini 3 Pro
or fallback to Gemini 2.5 Pro.

**Note:** The **Keep trying** option uses exponential backoff, in which Gemini
CLI waits longer between each retry, when the system is busy. If the retry
doesn't happen immediately, please wait a few minutes for the request to
process.

## Model selection & routing types

When using Gemini CLI, you may want to control how your requests are routed
between models. By default, Gemini CLI uses **Auto** routing.

When using Gemini 3 Pro, you may want to use Auto routing or Pro routing to
manage your usage limits:

- **Auto routing:** Auto routing first determines whether a prompt involves a
  complex or simple operation. For simple prompts, it will automatically use
  Gemini 2.5 Flash. For complex prompts, if Gemini 3 Pro is enabled, it will use
  Gemini 3 Pro; otherwise, it will use Gemini 2.5 Pro.
- **Pro routing:** If you want to ensure your task is processed by the most
  capable model, use `/model` and select **Pro**. Gemini CLI will prioritize the
  most capable model available, including Gemini 3 Pro if it has been enabled.

To learn more about selecting a model and routing, refer to
[Gemini CLI Model Selection](../cli/model.md).

## Troubleshooting Gemini 3 Pro on Gemini CLI

Having trouble? Answers for common issues.

### How can I access Gemini 3 Pro today?

New
[Google AI Ultra subscribers](https://one.google.com/intl/en/about/google-ai-plans/)
will receive access to Gemini 3 Pro, **excluding** Google AI Ultra for Business
accounts. Other users are invited to
[sign up for the waitlist](https://goo.gle/geminicli-waitlist-signup), which is
being processed in batches as availability opens.

### I should have access to Gemini 3 Pro but I don’t.

Gemini 3 Pro access is currently available to users with the following accounts:

- Google AI Ultra (**excluding** Google AI Ultra for Business).
- **Paid** Gemini API keys.
- **Paid** Vertex API keys.

If you’re certain your account has one of the required subscriptions and you’re
still unable to access Gemini 3 Pro, you might just need to update your settings
or reauthenticate.

Perform the following steps to troubleshoot your access:

1. **Turn on Preview Features**. Run the `/setting` command in the CLI and
   ensure that **Preview Features** is set to `true`. You can’t use Gemini 3 Pro
   if the Preview Features setting is turned off.
2. **Restart the CLI.** Use `/quit` to exit the CLI and reopen it with the
   `gemini` command.
3. **Reauthenticate.** Run the `/auth` command in the CLI to re-establish your
   credentials.

### I am receiving a 400 / 404 / 500 error when trying to access Gemini 3 Pro.

Gemini CLI may return a 400, 404, or 500 error if it can’t access Gemini 3 Pro.
This could happen if you don’t have access to the model under the current
account you’re using — or during times of high capacity.

If you’ve received one of these error codes when trying to use Gemini 3 Pro,
first try the following:

1. **Confirm your access.** Review the eligibility requirements listed above to
   confirm that your account type should have access to Gemini 3 Pro.
2. **Wait a few minutes.** During times of high use, you may hit a rate limit.
   Wait a few minutes before submitting your prompt again.
3. **Restart and reauthenticate**. If this issue persists, close Gemini CLI,
   reopen the CLI, and reauthenticate using the `/auth` command.

**Note:** If you are using Gemini CLI with Google Cloud, be aware that Gemini 3
Pro is currently only available in the Global region for Google Cloud.

If you’re still receiving the error, you can
[search GitHub issues](https://github.com/google-gemini/gemini-cli/issues) for
currently active issues..

### I upgraded my account from Google AI Pro to Google AI Ultra but I’m still having trouble accessing Gemini 3 Pro.

If you’ve upgraded your account, you may still need to restart Gemini CLI and
log in again to activate your new quota in your current session.

1. **Restart the CLI.** Use `/quit` to exit the CLI and reopen it with the
   `gemini` command.
2. **Reauthenticate.** Run the `/auth` command in the CLI to re-establish your
   credentials.

You should now be able to resume working with your extra quota.

If you’re still having issues after logging in again, let us know by
[filing a GitHub issue](https://github.com/google-gemini/gemini-cli/issues).

## Still need help?

If you need help, we recommend searching for an existing
[GitHub issue](https://github.com/google-gemini/gemini-cli/issues). If you
cannot find a GitHub issue that matches your concern, you can
[create a new issue](https://github.com/google-gemini/gemini-cli/issues/new/choose).
For comments and feedback, consider opening a
[GitHub discussion](https://github.com/google-gemini/gemini-cli/discussions).
