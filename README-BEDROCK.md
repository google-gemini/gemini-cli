# AWS Bedrock Integration for Gemini CLI

This document describes the AWS Bedrock integration for the Gemini CLI, allowing you to use Anthropic Claude models through AWS Bedrock.

## Prerequisites

1. **AWS Account**: You need an AWS account with access to Amazon Bedrock
2. **AWS Credentials**: Configure AWS credentials using one of these methods:
   - AWS CLI: `aws configure`
   - Environment variables: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
   - IAM roles (for EC2/Lambda)
   - AWS SSO
3. **Bedrock Model Access**: Enable access to Claude models in the AWS Bedrock console
4. **AWS SDK**: The integration uses `@anthropic-ai/bedrock-sdk` which is included as a dependency

## Configuration

### Required Environment Variables

```bash
# AWS region where Bedrock is available
export AWS_REGION=us-east-1

# Optional: Specify the Claude model (defaults to claude-3-sonnet)
export BEDROCK_MODEL=anthropic.claude-3-sonnet-20240229-v1:0
```

### Available Models

- `anthropic.claude-3-5-sonnet-20241022-v2:0` - Claude 3.5 Sonnet (latest)
- `anthropic.claude-3-5-haiku-20241022-v1:0` - Claude 3.5 Haiku (fast)
- `anthropic.claude-3-sonnet-20240229-v1:0` - Claude 3 Sonnet
- `anthropic.claude-3-haiku-20240307-v1:0` - Claude 3 Haiku
- `anthropic.claude-3-opus-20240229-v1:0` - Claude 3 Opus

### Cross-Region Inference Profiles (Recommended)
- `us.anthropic.claude-3-7-sonnet-20250219-v1:0`
- `us.anthropic.claude-sonnet-4-20250514-v1:0`
- `us.anthropic.claude-opus-4-20250514-v1:0`

## Usage

### Using Bedrock as the Content Generator

To use AWS Bedrock instead of the default Gemini API:

1. Set up your AWS credentials and region:
```bash
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
```

2. Configure the CLI:
```bash
# Set auth type to AWS Bedrock
gemini config set selectedAuthType aws-bedrock
```

3. Run the CLI:
```bash
# Interactive mode
gemini

# Direct command
gemini "What is the weather like today?"

# With streaming
gemini --stream "Explain quantum computing"
```

### Settings File Configuration

Create or update `~/.gemini/settings.json`:

```json
{
  "selectedAuthType": "aws-bedrock",
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    }
  }
}
```

## Features

### Supported Features

- ✅ Text generation
- ✅ Multi-turn conversations
- ✅ System instructions
- ✅ Streaming responses
- ✅ Tool/function calling (MCP compatible)
- ✅ Image inputs (base64 encoded)
- ✅ JSON mode
- ✅ Token counting (estimation)
- ✅ Full MCP (Model Context Protocol) support

### Unsupported Features

- ❌ Embeddings (not available for Claude models on Bedrock)

## Tool Calling

The Bedrock integration supports tool calling with automatic format conversion between Gemini and Bedrock formats:

```javascript
// Gemini format (input)
{
  functionDeclarations: [{
    name: 'get_weather',
    description: 'Get weather information',
    parameters: {
      type: 'OBJECT',
      properties: {
        location: { type: 'STRING' }
      },
      required: ['location']
    }
  }]
}

// Automatically converted to Bedrock format
{
  name: 'get_weather',
  description: 'Get weather information',
  input_schema: {
    type: 'object',
    properties: {
      location: { type: 'string' }
    },
    required: ['location']
  }
}
```

### MCP Integration Example

```bash
# Use MCP tools with Bedrock
gemini
> Store a note: "Testing MCP with AWS Bedrock"
> What notes do I have stored?
> List all files in the current directory
```

## Error Handling

The integration includes specific error handling for common AWS Bedrock issues:

- **Authentication errors**: Check your AWS credentials
- **Permission errors**: Ensure your IAM role has `bedrock:InvokeModel` permission
- **Rate limits**: The integration will surface rate limit errors from Bedrock
- **Region availability**: Ensure Bedrock is available in your AWS region

## Debugging

Enable debug mode to see detailed request/response information:

```bash
gemini --debug "Your prompt here"
```

This will log:
- AWS credential detection
- Bedrock request details
- Tool format conversions
- Response processing

## Cost Considerations

AWS Bedrock charges based on:
- Input tokens processed
- Output tokens generated
- Model selection (Opus is more expensive than Haiku)

Monitor your AWS billing dashboard to track usage.

## Troubleshooting

### "No AWS credentials found"
```bash
# Check your AWS credentials
aws sts get-caller-identity

# Configure credentials
aws configure

# Or use environment variables
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret
```

### "Access denied" errors
1. Check IAM permissions for `bedrock:InvokeModel`
2. Ensure model access is enabled in Bedrock console:
   - Go to AWS Bedrock console
   - Navigate to "Model access"
   - Request access to Claude models
   - Wait for approval (usually instant)

### "Invalid model" errors
- Verify the model ID is correct
- Check if the model is available in your region
- Consider using cross-region inference profiles (starting with `us.`)

## Development

### Running Tests

```bash
# Run Bedrock-specific tests
npm test src/providers/bedrock

# Run with coverage
npm test -- --coverage src/providers/bedrock
```

### Architecture

The Bedrock integration follows a modular design:

- `BedrockProvider.ts` - Main provider implementing ContentGenerator interface
- `BedrockMessageConverter.ts` - Converts between Gemini and Bedrock message formats
- `BedrockToolConverter.ts` - Handles tool/function declaration conversion
- `BedrockStreamHandler.ts` - Processes streaming responses
- `BedrockTypes.ts` - TypeScript type definitions

All components maintain strict TypeScript typing with zero `any` types.

### Key Implementation Details

1. **Message Format Conversion**: Automatically converts between Gemini's content format and Bedrock's message format
2. **Tool ID Tracking**: Maintains consistency between tool calls and responses using a ToolUseTracker
3. **Stream Processing**: Handles Bedrock's streaming events and converts them to Gemini's expected format
4. **Error Mapping**: Maps AWS Bedrock errors to appropriate Gemini CLI error types

## Differences from Upstream

This fork:
- Adds AWS Bedrock as an authentication option alongside existing options
- Supports Claude models through Bedrock while maintaining Gemini compatibility
- Requires AWS credentials when using Bedrock authentication
- Maintains full compatibility with all CLI features including MCP

## Contributing

When contributing:
1. Keep changes minimal to ease upstream merges
2. Test with multiple Claude models
3. Ensure AWS credential handling is secure
4. Document any Bedrock-specific features
5. Follow the strict no-`any` TypeScript policy
6. Ensure all tests pass: `npm test && npm run lint && npm run typecheck`

## License

This fork maintains the same Apache 2.0 license as the upstream project.