# Gemini CLI Changelog

Wondering what's new in Gemini CLI? This document provides key highlights and notable changes to Gemini CLI.

## v0.8.0 - Gemini CLI weekly update - 2025-09-29

- 🎉**Introducing Gemini CLI Extensions**🎉:
  - Build, manage, and customize your Gemini CLI experience with extensions.
  - Manage your extensions at the command line with:
    - `gemini extensions install|uninstall|link`
    - `gemini extensions enable|disable`
    - `gemini extensions list|upgrade`
- 🎉 **Interactive shell:** Run interactive commands like `vim`, `rebase -i`, or even `gemini` 😎 directly in Gemini CLI. ([pr](https://github.com/google-gemini/gemini-cli/pull/6694) by [@galz10](https://github.com/galz10))
- **Model selection:** Choose the Gemini model for your session with /model. ([pr](https://github.com/google-gemini/gemini-cli/pull/8940) by [@abhipatel12](https://github.com/abhipatel12))
- **Model routing:** Gemini CLI will now intelligently pick the best model for the task. Simple queries will be sent to Flash while complex analytical or creative tasks will still use the power of Pro. This ensures your quota will last for a longer period of time. You can always opt-out of this via `/model`. ([pr](https://github.com/google-gemini/gemini-cli/pull/9262) by [@abhipatel12](https://github.com/abhipatel12))
- **Folder trust:**
  - Opening Gemini CLI in a folder for the first time will now surface a trust dialog. ([pr](https://github.com/google-gemini/gemini-cli/pull/5815) by [@shrutip90](https://github.com/shrutip90))
  - Enable or disable checking folder trust holistically with `folderTrust` in your settings.json. ([pr](https://github.com/google-gemini/gemini-cli/pull/5798) by [@shrutip90](https://github.com/shrutip90))
- **Small features, polish, reliability & bug fixes:** A large amount of changes, smaller features, UI updates, reliability and bug fixes + general polish made it in this week!

## v0.7.0 - Gemini CLI weekly update - 2025-09-22

- 🎉**Build your own Gemini CLI IDE plugin:** We've published a spec for creating IDE plugins to enable rich context-aware experiences and native in-editor diffing in your IDE of choice. ([pr](https://github.com/google-gemini/gemini-cli/pull/8479) by [@skeshive](https://github.com/skeshive))
- 🎉 **Gemini CLI extensions**
  - **Flutter:** An early version to help you create, build, test, and run Flutter apps with Gemini CLI ([extension](https://github.com/flutter/gemini-cli-extension))
  - **nanobanana:** Integrate nanobanana into Gemini CLI ([extension](https://github.com/gemini-cli-extensions/nanobanana))
- **Telemetry config via environment:** Manage telemetry settings using environment variables for a more flexible setup. ([docs](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/telemetry.md#configuration), [pr](https://github.com/google-gemini/gemini-cli/pull/9113) by [@jerop](https://github.com/jerop))
- **​​Experimental todos:** Track and display progress on complex tasks with a managed checklist. Off by default but can be enabled via `"useWriteTodos": true` ([pr](https://github.com/google-gemini/gemini-cli/pull/8761) by [@anj-s](https://github.com/anj-s))
- **Share chat support for tools:** Using `/chat share` will now also render function calls and responses in the final markdown file. ([pr](https://github.com/google-gemini/gemini-cli/pull/8693) by [@rramkumar1](https://github.com/rramkumar1))
- **Citations:** Now enabled for all users ([pr](https://github.com/google-gemini/gemini-cli/pull/8570) by [@scidomino](https://github.com/scidomino))
- **Custom commands in Headless Mode:** Run custom slash commands directly from the command line in non-interactive mode: `gemini "/joke Chuck Norris"` ([pr](https://github.com/google-gemini/gemini-cli/pull/8305) by [@capachino](https://github.com/capachino))
- **Small features, polish, reliability & bug fixes:** A large amount of changes, smaller features, UI updates, reliability and bug fixes + general polish made it in this week!

## v0.6.0 - Gemini CLI weekly update - 2025-09-15

- 🎉 **Higher limits for Google AI Pro and Ultra subscribers:** We’re psyched to finally announce that Google AI Pro and AI Ultra subscribers now get access to significantly higher 2.5 quota limits for Gemini CLI!
  - **Announcement:** [https://blog.google/technology/developers/gemini-cli-code-assist-higher-limits/](https://blog.google/technology/developers/gemini-cli-code-assist-higher-limits/)
- 🎉**Gemini CLI Databases and BigQuery Extensions:** Connect Gemini CLI to all of your cloud data with Gemini CLI.
  - Announcement and how to get started with each of the below extensions: [https://cloud.google.com/blog/products/databases/gemini-cli-extensions-for-google-data-cloud?e=48754805](https://cloud.google.com/blog/products/databases/gemini-cli-extensions-for-google-data-cloud?e=48754805)
  - **AlloyDB:** Interact, manage and observe AlloyDB for PostgreSQL databases ([manage](https://github.com/gemini-cli-extensions/alloydb#configuration), [observe](https://github.com/gemini-cli-extensions/alloydb-observability#configuration))
  - **BigQuery:** Connect and query your BigQuery datasets or utilize a sub-agent for contextual insights ([query](https://github.com/gemini-cli-extensions/bigquery-data-analytics#configuration), [sub-agent](https://github.com/gemini-cli-extensions/bigquery-conversational-analytics))
  - **Cloud SQL:** Interact, manage and observe Cloud SQL for PostgreSQL ([manage](https://github.com/gemini-cli-extensions/cloud-sql-postgresql#configuration),[ observe](https://github.com/gemini-cli-extensions/cloud-sql-postgresql-observability#configuration)), Cloud SQL for MySQL ([manage](https://github.com/gemini-cli-extensions/cloud-sql-mysql#configuration),[ observe](https://github.com/gemini-cli-extensions/cloud-sql-mysql-observability#configuration)) and Cloud SQL for SQL Server ([manage](https://github.com/gemini-cli-extensions/cloud-sql-sqlserver#configuration),[ observe](https://github.com/gemini-cli-extensions/cloud-sql-sqlserver-observability#configuration)) databases.
  - **Dataplex:** Discover, manage, and govern data and AI artifacts ([extension](https://github.com/gemini-cli-extensions/dataplex#configuration))
  - **Firestore:** Interact with Firestore databases, collections and documents ([extension](https://github.com/gemini-cli-extensions/firestore-native#configuration))
  - **Looker:** Query data, run Looks and create dashboards ([extension](https://github.com/gemini-cli-extensions/looker#configuration))
  - **MySQL:** Interact with MySQL databases ([extension](https://github.com/gemini-cli-extensions/mysql#configuration))
  - **Postgres:** Interact with PostgreSQL databases ([extension](https://github.com/gemini-cli-extensions/postgres#configuration))
  - **Spanner:** Interact with Spanner databases ([extension](https://github.com/gemini-cli-extensions/spanner#configuration))
  - **SQL Server:** Interact with SQL Server databases ([extension](https://github.com/gemini-cli-extensions/sql-server#configuration))
  - **MCP Toolbox:** Configure and load custom tools for more than 30+ data sources ([extension](https://github.com/gemini-cli-extensions/mcp-toolbox#configuration))
- **JSON output mode:** Have Gemini CLI output JSON with `--output-format json` when invoked headlessly for easy parsing and post-processing. Includes response, stats and errors. ([pr](https://github.com/google-gemini/gemini-cli/pull/8119) by [@jerop](https://github.com/jerop))
- **Keybinding triggered approvals:** When you use shortcuts (`shift+y` or `shift+tab`) to activate YOLO/auto-edit modes any pending confirmation dialogs will now approve. ([pr](https://github.com/google-gemini/gemini-cli/pull/6665) by [@bulkypanda](https://github.com/bulkypanda))
- **Chat sharing:** Convert the current conversation to a Markdown or JSON file with _/chat share &lt;file.md|file.json>_ ([pr](https://github.com/google-gemini/gemini-cli/pull/8139) by [@rramkumar1](https://github.com/rramkumar1))
- **Prompt search:** Search your prompt history using `ctrl+r`. ([pr](https://github.com/google-gemini/gemini-cli/pull/5539) by [@Aisha630](https://github.com/Aisha630))
- **Input undo/redo:** Recover accidentally deleted text in the input prompt using `ctrl+z` (undo) and `ctrl+shift+z` (redo). ([pr](https://github.com/google-gemini/gemini-cli/pull/4625) by [@masiafrest](https://github.com/masiafrest))
- **Loop detection confirmation:** When loops are detected you are now presented with a dialog to disable detection for the current session. ([pr](https://github.com/google-gemini/gemini-cli/pull/8231) by [@SandyTao520](https://github.com/SandyTao520))
- **Direct to Google Cloud Telemetry:** Directly send telemetry to Google Cloud for a simpler and more streamlined setup. ([pr](https://github.com/google-gemini/gemini-cli/pull/8541) by [@jerop](https://github.com/jerop))
- **Visual Mode Indicator Revamp:** ‘shell’, 'accept edits' and 'yolo' modes now have colors to match their impact / usage. Input box now also updates. ([shell](https://imgur.com/a/DovpVF1), [accept-edits](https://imgur.com/a/33KDz3J), [yolo](https://imgur.com/a/tbFwIWp), [pr](https://github.com/google-gemini/gemini-cli/pull/8200) by [@miguelsolorio](https://github.com/miguelsolorio))
- **Small features, polish, reliability & bug fixes:** A large amount of changes, smaller features, UI updates, reliability and bug fixes + general polish made it in this week!

## v0.5.0 - Gemini CLI weekly update - 2025-09-08

- 🎉**FastMCP + Gemini CLI**🎉: Quickly install and manage your Gemini CLI MCP servers with FastMCP ([video](https://imgur.com/a/m8QdCPh), [pr](https://github.com/jlowin/fastmcp/pull/1709) by [@jackwotherspoon](https://github.com/jackwotherspoon)**)**
  - Getting started: [https://gofastmcp.com/integrations/gemini-cli](https://gofastmcp.com/integrations/gemini-cli)
- **Positional Prompt for Non-Interactive:** Seamlessly invoke Gemini CLI headlessly via `gemini "Hello"`. Synonymous with passing `-p`. ([gif](https://imgur.com/a/hcBznpB), [pr](https://github.com/google-gemini/gemini-cli/pull/7668) by [@allenhutchison](https://github.com/allenhutchison))
- **Experimental Tool output truncation:** Enable truncating shell tool outputs and saving full output to a file by setting `"enableToolOutputTruncation": true `([pr](https://github.com/google-gemini/gemini-cli/pull/8039) by [@SandyTao520](https://github.com/SandyTao520))
- **Edit Tool improvements:** Gemini CLI’s ability to edit files should now be far more capable. ([pr](https://github.com/google-gemini/gemini-cli/pull/7679) by [@silviojr](https://github.com/silviojr))
- **Custom witty messages:** The feature you’ve all been waiting for… Personalized witty loading messages via `"ui": { "customWittyPhrases": ["YOLO"]}` in `settings.json`. ([pr](https://github.com/google-gemini/gemini-cli/pull/7641) by [@JayadityaGit](https://github.com/JayadityaGit))
- **Nested .gitignore File Handling:** Nested `.gitignore` files are now respected. ([pr](https://github.com/google-gemini/gemini-cli/pull/7645) by [@gsquared94](https://github.com/gsquared94))
- **Enforced authentication:** System administrators can now mandate a specific authentication method via `"enforcedAuthType": "oauth-personal|gemini-api-key|…"`in `settings.json`. ([pr](https://github.com/google-gemini/gemini-cli/pull/6564) by [@chrstnb](https://github.com/chrstnb))
- **A2A development-tool extension:** An RFC for an Agent2Agent ([A2A](https://a2a-protocol.org/latest/)) powered extension for developer tool use cases. ([feedback](https://github.com/google-gemini/gemini-cli/discussions/7822), [pr](https://github.com/google-gemini/gemini-cli/pull/7817) by [@skeshive](https://github.com/skeshive))
- **Hands on Codelab: **[https://codelabs.developers.google.com/gemini-cli-hands-on](https://codelabs.developers.google.com/gemini-cli-hands-on)
- **Small features, polish, reliability & bug fixes:** A large amount of changes, smaller features, UI updates, reliability and bug fixes + general polish made it in this week!

## v0.4.0 - Gemini CLI weekly update - 2025-09-01

- 🎉**Gemini CLI CloudRun and Security Integrations**🎉: Automate app deployment and security analysis with CloudRun and Security extension integrations. Once installed deploy your app to the cloud with `/deploy` and find and fix security vulnerabilities with `/security:analyze`.
  - Announcement and how to get started: [https://cloud.google.com/blog/products/ai-machine-learning/automate-app-deployment-and-security-analysis-with-new-gemini-cli-extensions](https://cloud.google.com/blog/products/ai-machine-learning/automate-app-deployment-and-security-analysis-with-new-gemini-cli-extensions)
- **Experimental**
  - **Edit Tool:** Give our new edit tool a try by setting `"useSmartEdit": true` in `settings.json`! ([feedback](https://github.com/google-gemini/gemini-cli/discussions/7758), [pr](https://github.com/google-gemini/gemini-cli/pull/6823) by [@silviojr](https://github.com/silviojr))
  - **Model talking to itself fix:** We’ve removed a model workaround that would encourage Gemini CLI to continue conversations on your behalf. This may be disruptive and can be disabled via `"skipNextSpeakerCheck": false` in your `settings.json` ([feedback](https://github.com/google-gemini/gemini-cli/discussions/6666), [pr](https://github.com/google-gemini/gemini-cli/pull/7614) by [@SandyTao520](https://github.com/SandyTao520))
  - **Prompt completion:** Get real-time AI suggestions to complete your prompts as you type. Enable it with `"general": { "enablePromptCompletion": true }` and share your feedback! ([gif](https://miro.medium.com/v2/resize:fit:2000/format:webp/1*hvegW7YXOg6N_beUWhTdxA.gif), [pr](https://github.com/google-gemini/gemini-cli/pull/4691) by [@3ks](https://github.com/3ks))
- **Footer visibility configuration:** Customize the CLI's footer look and feel in `settings.json` ([pr](https://github.com/google-gemini/gemini-cli/pull/7419) by [@miguelsolorio](https://github.com/miguelsolorio))
  - `hideCWD`: hide current working directory.
  - `hideSandboxStatus`: hide sandbox status.
  - `hideModelInfo`: hide current model information.
  - `hideContextSummary`: hide request context summary.
- **Citations:** For enterprise Code Assist licenses users will now see citations in their responses by default. Enable this yourself with `"showCitations": true` ([pr](https://github.com/google-gemini/gemini-cli/pull/7350) by [@scidomino](https://github.com/scidomino))
- **Pro Quota Ddalog:** Handle daily Pro model usage limits with an interactive dialog that lets you immediately switch auth or fallback. ([pr](https://github.com/google-gemini/gemini-cli/pull/7094) by [@JayadityaGit](https://github.com/JayadityaGit))
- **Custom commands @:** Embed local file or directory content directly into your custom command prompts using `@{path}` syntax ([gif](https://miro.medium.com/v2/resize:fit:2000/format:webp/1*GosBAo2SjMfFffAnzT7ZMg.gif), [pr](https://github.com/google-gemini/gemini-cli/pull/6716) by [@abhipatel12](https://github.com/abhipatel12))
- **2.5 Flash Lite support:** You can now use the `gemini-2.5-flash-lite` model for Gemini CLI via `gemini -m …`. ([gif](https://miro.medium.com/v2/resize:fit:2000/format:webp/1*P4SKwnrsyBuULoHrFqsFKQ.gif), [pr](https://github.com/google-gemini/gemini-cli/pull/4652) by [@psinha40898](https://github.com/psinha40898))
- **CLI streamlining:** We have deprecated a number of command line arguments in favor of `settings.json` alternatives. We will remove these arguments in a future release. See the PR for the full list of deprecations. ([pr](https://github.com/google-gemini/gemini-cli/pull/7360) by [@allenhutchison](https://github.com/allenhutchison))
- **JSON session summary:** Track and save detailed CLI session statistics to a JSON file for performance analysis with `--session-summary <path>` ([pr](https://github.com/google-gemini/gemini-cli/pull/7347) by [@leehagoodjames](https://github.com/leehagoodjames))
- **Robust keyboard handling:** More reliable and consistent behavior for arrow keys, special keys (Home, End, etc.), and modifier combinations across various terminals. ([pr](https://github.com/google-gemini/gemini-cli/pull/7118) by [@deepankarsharma](https://github.com/deepankarsharma))
- **MCP loading indicator:** Provides visual feedback during CLI initialization when connecting to multiple servers. ([pr](https://github.com/google-gemini/gemini-cli/pull/6923) by [@swissspidy](https://github.com/swissspidy))
- **Small features, polish, reliability & bug fixes:** A large amount of changes, smaller features, UI updates, reliability and bug fixes + general polish made it in this week!
