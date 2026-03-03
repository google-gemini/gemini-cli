# Style Guide: Quota vs. Limit

This guide defines the usage of "quota," "limit," and related terms in user-facing interfaces.

## TL;DR

- **`quota`**: The administrative "bucket." Use for settings, billing, and requesting increases. (e.g., "Adjust your storage **quota**.")
- **`limit`**: The real-time numerical "ceiling." Use for error messages when a user is blocked. (e.g., "You've reached your request **limit**.")
- **When blocked, combine them:** Explain the **limit** that was hit and the **quota** that is the remedy. (e.g., "You've reached the request **limit** for your developer **quota**.")
- **Related terms:** Use `usage` for consumption tracking, `restriction` for fixed rules, and `reset` for when a limit refreshes.

---

## Detailed Guidelines

### Definitions

- **Quota is the "what":** It identifies the category of resource being managed (e.g., storage quota, GPU quota, request/prompt quota).
- **Limit is the "how much":** It defines the numerical boundary.

Use **quota** when referring to the administrative concept or the request for more. Use **limit** when discussing the specific point of exhaustion.

### When to use "quota"

Use this term for **account management, billing, and settings.** It describes the entitlement the user has purchased or been assigned.

**Examples:**
- **Navigation label:** Quota and usage
- **Contextual help:** Your **usage quota** is managed by your organization. To request an increase, contact your administrator.

### When to use "limit"

Use this term for **real-time feedback, notifications, and error messages.** It identifies the specific wall the user just hit.

**Examples:**
- **Error message:** You’ve reached the 50-request-per-minute **limit**.
- **Inline warning:** Input exceeds the 32k token **limit**.

### How to use both together

When a user is blocked, combine both terms to explain the **event** (limit) and the **remedy** (quota).

**Example:**
- **Heading:** Daily usage limit reached
- **Body:** You've reached the maximum daily capacity for your developer quota. To continue working today, upgrade your quota.
