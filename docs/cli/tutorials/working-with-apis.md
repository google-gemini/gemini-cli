# Working with APIs

This tutorial shows you how to use Gemini CLI to work with APIs.

## 1. Fetch data from an API

You can use the `web_fetch` tool to fetch data from an API. For example, to fetch a list of users from the GitHub API, you could use the following command:

```
> @web_fetch https://api.github.com/users
```

Gemini will fetch the data from the API and display it in the terminal.

## 2. Generate code to work with an API

You can ask Gemini to generate code to work with an API. For example, you could ask:

```
> Generate a Python script that fetches a list of users from the GitHub API and prints their usernames to the console.
```

Gemini will generate a Python script that you can use to fetch the data from the API.

## 3. Create a custom tool to work with an API

You can create a custom tool to work with an API. This allows you to encapsulate the logic for working with the API in a single tool that you can reuse across your projects.

For more information on creating custom tools, see the [Extensions Guide](../extension.md).
