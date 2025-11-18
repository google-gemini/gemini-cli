# Gemini CLI Integration Guide

Complete guide for connecting Gemini CLI to your repositories with code
completions, error handling, and high-quality media generation.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Features](#features)
  - [Code Completions](#code-completions)
  - [Error Handling](#error-handling)
  - [Image Generation](#image-generation)
  - [Video Generation](#video-generation)
- [Setup](#setup)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Configuration](#configuration)
- [Usage](#usage)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

## Overview

This integration enables four powerful AI-driven features for your repositories:

1. **Code Completions** - Context-aware code suggestions using Gemini
2. **Error Handling** - Intelligent error analysis and fix suggestions
3. **Image Generation** - High-quality images using Imagen
4. **Video Generation** - Professional videos using Veo

## Quick Start

```bash
# 1. Navigate to your repository
cd /path/to/your/repo

# 2. Initialize Gemini CLI
gemini init

# 3. Copy the extended configuration
cp .gemini/config-extended.yaml .gemini/config.yaml

# 4. Configure your Google Cloud project ID
# Edit .gemini/config.yaml and update:
# - image_generation.vertex_ai.project_id
# - video_generation.vertex_ai.project_id

# 5. Start using Gemini CLI
gemini
```

## Features

### Code Completions

Get intelligent, context-aware code completions for any programming language.

**Key Features:**

- Multi-language support (TypeScript, Python, Java, Go, Rust, C++, etc.)
- Context-aware suggestions based on surrounding code
- Fast responses using Gemini Flash
- Respects your coding style and patterns

**Example Usage:**

```typescript
// In Gemini CLI chat:
> Use code_completion tool to complete this function:
> File: src/utils.ts
> Prefix: "function calculateTotal(items: Item[]) {"
```

**Tool Parameters:**

- `file_path` (required): Path to the file
- `prefix` (required): Code before cursor
- `suffix` (optional): Code after cursor
- `language` (optional): Programming language
- `context` (optional): Additional instructions

### Error Handling

Automatically analyze errors and get intelligent fix suggestions.

**Key Features:**

- Root cause analysis
- Detailed explanations
- Suggested fixes with code examples
- Best practices to prevent similar errors
- Support for all major programming languages

**Example Usage:**

```typescript
// In Gemini CLI chat:
> Use handle_error tool to analyze this error:
> Error: TypeError: Cannot read property 'name' of undefined
> File: src/app.ts
> Line: 42
```

**Tool Parameters:**

- `error_message` (required): Error message or stack trace
- `file_path` (optional): File where error occurred
- `line_number` (optional): Line number
- `language` (optional): Programming language
- `code_context` (optional): Surrounding code
- `error_type` (optional): Specific error type
- `suggest_fix` (optional): Whether to suggest fixes (default: true)

### Image Generation

Generate high-quality images using Google's Imagen model.

**Key Features:**

- Multiple quality presets (standard, high, ultra)
- Customizable aspect ratios (1:1, 16:9, 9:16, 4:3, 3:4)
- Negative prompts to avoid unwanted content
- High-resolution output (up to 1080p)
- Professional-grade results

**Example Usage:**

```typescript
// In Gemini CLI chat:
> Use generate_image tool to create:
> Prompt: "A modern web application dashboard with dark theme,
>          showing analytics charts and user metrics, professional UI design"
> Quality: ultra
> Aspect ratio: 16:9
```

**Tool Parameters:**

- `prompt` (required): Detailed description of the image
- `output_path` (optional): Where to save the image
- `quality` (optional): 'standard', 'high', or 'ultra'
- `aspect_ratio` (optional): '1:1', '16:9', '9:16', '4:3', '3:4'
- `negative_prompt` (optional): What to avoid in the image

### Video Generation

Create professional videos using Google's Veo model.

**Key Features:**

- Cinematic quality output
- Customizable duration (1-30 seconds)
- Multiple frame rates (24, 30, 60 fps)
- Camera movement control
- Reference image support for consistency
- High-definition output (up to 1080p)

**Example Usage:**

```typescript
// In Gemini CLI chat:
> Use generate_video tool to create:
> Prompt: "A smooth camera pan across a modern office workspace,
>          showing developers working on computers, natural lighting,
>          professional atmosphere"
> Duration: 8
> Quality: cinematic
> Camera movement: slow pan right
```

**Tool Parameters:**

- `prompt` (required): Detailed description of the video
- `output_path` (optional): Where to save the video
- `duration` (optional): Length in seconds (1-30)
- `quality` (optional): 'standard', 'high', or 'cinematic'
- `aspect_ratio` (optional): '16:9', '9:16', '1:1', '4:3'
- `fps` (optional): 24, 30, or 60
- `camera_movement` (optional): Camera movement instructions
- `reference_image` (optional): Path to reference image

## Setup

### Prerequisites

1. **Google Cloud Account** with billing enabled
2. **Vertex AI API** enabled
3. **Authentication** configured:
   ```bash
   gcloud auth application-default login
   ```

### Installation

1. **Install Gemini CLI** (if not already installed):

   ```bash
   npm install -g @google/gemini-cli
   ```

2. **Enable Vertex AI APIs**:

   ```bash
   gcloud services enable aiplatform.googleapis.com
   ```

3. **Set up IAM permissions**: Your account needs these roles:
   - `roles/aiplatform.user` - For Vertex AI access
   - `roles/storage.objectCreator` - For storing generated media

### Configuration

1. **Initialize in your repository**:

   ```bash
   cd /path/to/your/repo
   gemini init
   ```

2. **Copy the extended configuration**:

   ```bash
   cp .gemini/config-extended.yaml .gemini/config.yaml
   ```

3. **Update configuration**: Edit `.gemini/config.yaml` and set:
   - `image_generation.vertex_ai.project_id`: Your Google Cloud project ID
   - `video_generation.vertex_ai.project_id`: Your Google Cloud project ID
   - `image_generation.vertex_ai.location`: Your preferred region (e.g.,
     'us-central1')
   - `video_generation.vertex_ai.location`: Your preferred region

4. **Enable features**:

   ```yaml
   code_completion:
     enabled: true

   error_handling:
     enabled: true

   image_generation:
     enabled: true

   video_generation:
     enabled: true
   ```

## Usage

### Starting Gemini CLI

```bash
# Start interactive mode
gemini

# Start with a specific prompt
gemini "Help me fix this error"

# Use a specific model
gemini --model gemini-2.5-pro-002
```

### Using Tools

All tools are available as function calls within the Gemini CLI chat interface.

**Code Completion Example:**

```
You: Complete this function for me
[provide your code context]

Gemini: I'll use the code_completion tool to help you.
[generates completion]
```

**Error Analysis Example:**

```
You: I'm getting this error: [paste error]

Gemini: Let me analyze that error for you using the handle_error tool.
[provides analysis and fixes]
```

**Image Generation Example:**

```
You: Generate an image of a futuristic dashboard

Gemini: I'll create that image using the generate_image tool.
[generates and saves image]
```

**Video Generation Example:**

```
You: Create a video showing a product demo

Gemini: I'll generate that video using the generate_video tool.
[generates and saves video]
```

## Examples

### Example 1: Debug and Fix Code

```typescript
// You have an error in your code
const user = users.find((u) => u.id === userId);
console.log(user.name); // TypeError: Cannot read property 'name' of undefined

// Ask Gemini CLI:
// "Analyze this error and suggest a fix"

// Gemini will:
// 1. Use handle_error tool to analyze
// 2. Provide root cause (user might be undefined)
// 3. Suggest fix:
const user = users.find((u) => u.id === userId);
if (user) {
  console.log(user.name);
} else {
  console.log('User not found');
}
```

### Example 2: Complete Complex Logic

```typescript
// You need to implement a function
function processOrderWithRetry(order: Order) {
  // Ask Gemini: "Complete this function to process the order with retry logic"

  // Gemini will use code_completion tool to generate:
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      return await processOrder(order);
    } catch (error) {
      attempt++;
      if (attempt >= maxRetries) {
        throw new Error(`Failed to process order after ${maxRetries} attempts`);
      }
      await delay(1000 * attempt); // Exponential backoff
    }
  }
}
```

### Example 3: Generate Marketing Materials

```typescript
// Generate a hero image for your landing page
// Ask Gemini:
// "Generate a professional hero image for a SaaS dashboard product"

// Gemini uses generate_image tool with:
// - Prompt: Professional, modern, clean design
// - Quality: ultra
// - Aspect ratio: 16:9
// - Output: .gemini/generated/images/hero-image-[timestamp].png
```

### Example 4: Create Demo Video

```typescript
// Generate a product demo video
// Ask Gemini:
// "Create a 10-second video showcasing our mobile app interface"

// Gemini uses generate_video tool with:
// - Prompt: Smooth navigation through app screens
// - Duration: 10 seconds
// - Quality: cinematic
// - Camera: slow pan and zoom
// - Output: .gemini/generated/videos/demo-[timestamp].mp4
```

## Troubleshooting

### Authentication Issues

**Problem**: "Permission denied" or "Authentication failed"

**Solution**:

```bash
# Re-authenticate
gcloud auth application-default login

# Verify authentication
gcloud auth application-default print-access-token
```

### API Not Enabled

**Problem**: "API not enabled" error

**Solution**:

```bash
# Enable Vertex AI
gcloud services enable aiplatform.googleapis.com

# Verify it's enabled
gcloud services list --enabled | grep aiplatform
```

### Rate Limiting

**Problem**: "Quota exceeded" or "Rate limit reached"

**Solution**:

1. Check your usage limits in `.gemini/config.yaml`
2. Request quota increase in Google Cloud Console
3. Use lower quality settings for faster generation

### Configuration Errors

**Problem**: Tools not appearing or not working

**Solution**:

1. Verify `.gemini/config.yaml` syntax is valid
2. Check that `enabled: true` for each feature
3. Ensure project_id is set correctly
4. Restart Gemini CLI

### Media Generation Not Working

**Problem**: Image or video generation fails

**Solution**:

1. Verify Vertex AI API is enabled
2. Check your project has billing enabled
3. Ensure you have the correct IAM permissions
4. Verify the model name in config matches available models
5. For Veo, ensure you have access (it may be in preview)

### Code Completion Not Accurate

**Problem**: Completions are not relevant

**Solution**:

1. Provide more context in the `prefix` parameter
2. Include the file path for better context
3. Specify the programming language
4. Add additional context or instructions

## Best Practices

1. **Code Completions**:
   - Provide enough context (at least 5-10 lines before cursor)
   - Include import statements and type definitions
   - Specify the programming language
   - Be specific about what you want

2. **Error Handling**:
   - Include the full error stack trace
   - Provide code context (5-10 lines around the error)
   - Specify the programming language/runtime
   - Include relevant error details (file, line number)

3. **Image Generation**:
   - Be specific and detailed in prompts
   - Use descriptive adjectives (professional, modern, clean)
   - Specify style, composition, colors
   - Use negative prompts to avoid unwanted elements
   - Start with 'high' quality, use 'ultra' only when needed

4. **Video Generation**:
   - Keep durations reasonable (5-10 seconds optimal)
   - Be specific about camera movements
   - Describe the scene composition and lighting
   - Use reference images for consistent style
   - Start with 'standard' quality for testing

## Advanced Usage

### Custom Prompts

Create custom slash commands in `.gemini/commands/`:

```toml
# .gemini/commands/fix-error.toml
name = "fix-error"
description = "Analyze and fix code errors"
prompt = """
Use the handle_error tool to analyze this error and then suggest a fix.
Provide a detailed explanation and code example.
"""
```

### Batch Operations

Process multiple items:

```typescript
// Generate multiple images
for (const concept of concepts) {
  // Ask Gemini to generate image for each concept
}
```

### Integration with CI/CD

```yaml
# .github/workflows/gemini-review.yml
name: Gemini Code Review
on: [pull_request]
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run Gemini Review
        run: |
          npm install -g @google/gemini-cli
          gemini review-pr
```

## Support

For issues and questions:

- GitHub Issues: https://github.com/google/gemini-cli/issues
- Documentation: https://docs.google.com/gemini-cli
- Community: https://discord.gg/gemini-cli

## License

Copyright 2025 Google LLC. Licensed under Apache 2.0.
