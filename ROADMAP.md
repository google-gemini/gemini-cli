# Gemini CLI Roadmap

The [Official Gemini CLI Roadmap](https://github.com/orgs/google-gemini/projects/11/)

Gemini CLI is an open-source AI agent that brings the power of Gemini directly into your terminal. It provides lightweight access to Gemini, giving you the most direct path from your prompt to our model.

This document outlines our approach to the Gemini CLI roadmap. Here, you'll find our guiding principles and a breakdown of the key areas we are
focused on for development. Our roadmap is not a static list but a dynamic set of priorities that are tracked live in our GitHub Issues.

As an [Apache 2.0 open source project](https://github.com/google-gemini/gemini-cli?tab=Apache-2.0-1-ov-file#readme), we appreciate and welcome [public contributions](https://github.com/google-gemini/gemini-cli/blob/main/CONTRIBUTING.md), and will give first priority to those contributions aligned with our roadmap. If you want to propose a new feature or change to our roadmap, please start by [opening an issue for discussion](https://github.com/google-gemini/gemini-cli/issues/new/choose).

## Disclaimer

This roadmap represents our current thinking and is for informational purposes only. It is not a commitment or a guarantee of future delivery. The development, release, and timing of any features are subject to change, and we may update the roadmap based on community discussions as well as when our priorities evolve.

## Guiding Principles

Our development is guided by the following principles:

- **Power & Simplicity:** Deliver access to state-of-the-art Gemini models with an intuitive and easy-to-use lightweight command-line interface.
- **Extensibility:** An adaptable agent to help you with a variety of use cases and environments along with the ability to run these agents anywhere.
- **Intelligent:** Gemini CLI should be reliably ranked among the best agentic tools as measured by benchmarks like SWE Bench, Terminal Bench, and CSAT.
- **Free and Open Source:** Foster a thriving open source community where cost isn’t a barrier to personal use, and PRs get merged quickly. This means resolving and closing issues, pull requests, and discussion posts quickly.

## How the Roadmap Works

Our roadmap is managed directly through Github Issues. See our entry point Roadmap Issue [here](https://github.com/google-gemini/gemini-cli/issues/4191). This approach allows for transparency and gives you a direct way to learn more or get involved with any specific initiative. All our roadmap items will be tagged as Type:`Feature` and Label:`maintainer` for features we are actively working on, or Type:`Task` and Label:`maintainer` for a more detailed list of tasks.

Issues are organized to provide key information at a glance:

- **Target Quarter:** `Milestone` denotes the anticipated delivery timeline.
- **Feature Area:** Labels such as `area/model` or `area/tooling` categorizes the work.
- **Issue Type:** _Workstream_ => _Epics_ => _Features_ => _Tasks|Bugs_

To see what we're working on, you can filter our issues by these dimensions. See all our items [here](https://github.com/orgs/google-gemini/projects/11/views/19)

## Focus Areas

To better organize our efforts, we categorize our work into several key feature areas. These labels are used on our GitHub Issues to help you filter and
find initiatives that interest you.

- **Authentication:** Secure user access via API keys, Gemini Code Assist login etc.
- **Model:** Support new Gemini models, multi-modality, local execution, and performance tuning.
- **User Experience:** Improve the CLI's usability, performance, interactive features, and documentation.
- **Tooling:** Built-in tools and the MCP ecosystem.
- **Core:** Core functionality of the CLI
- **Extensibility:** Bringing Gemini CLI to other surfaces e.g. GitHub.
- **Contribution:** Improve the contribution process via test automation and CI/CD pipeline enhancements.
- **Platform:** Manage installation, OS support, and the underlying CLI framework.
- **Quality:** Focus on testing, reliability, performance, and overall product quality.
- **Background Agents:** Enable long-running, autonomous tasks and proactive assistance.
- **Security and Privacy:** For all things related to security and privacy

## How to Contribute

Gemini CLI is an open-source project, and we welcome contributions from the community! Whether you're a developer, a designer, or just an enthusiastic user you can find our [Community Guidelines here](https://github.com/google-gemini/gemini-cli/blob/main/CONTRIBUTING.md) to learn how to get started. There are many ways to get involved:

- **Roadmap:** Please review and find areas in our [roadmap](https://github.com/google-gemini/gemini-cli/issues/4191) that you would like to contribute to. Contributions based on this will be easiest to integrate with.
- **Report Bugs:** If you find an issue, please create a bug(https://github.com/google-gemini/gemini-cli/issues/new?template=bug_report.yml) with as much detail as possible. If you believe it is a critical breaking issue preventing direct CLI usage, please tag it as `priorty/p0`.
- **Suggest Features:** Have a great idea? We'd love to hear it! Open a [feature request](https://github.com/google-gemini/gemini-cli/issues/new?template=feature_request.yml).
- **Contribute Code:** Check out our [CONTRIBUTING.md](https://github.com/google-gemini/gemini-cli/blob/main/CONTRIBUTING.md) file for guidelines on how to submit pull requests. We have a list of "good first issues" for new contributors.
- **Write Documentation:** Help us improve our documentation, tutorials, and examples.
  We are excited about the future of Gemini CLI and look forward to building it with you!
