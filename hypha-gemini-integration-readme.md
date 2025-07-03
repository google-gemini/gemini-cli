# Gemini CLI Hypha Integration

This project provides a Hypha service wrapper for the Gemini CLI agent, enabling remote programmatic access to the Gemini agent through Hypha RPC.

## Overview

The integration consists of:

1. **Hypha Service** (`hypha-gemini-service.js`) - A Node.js service that wraps the Gemini CLI agent and registers it with a Hypha server
2. **CLI Command Extension** - New command-line options for the Gemini CLI to connect to remote Hypha services
3. **Python Test Client** (`test_gemini_service.py`) - Example client for testing the service

## Features

- **Remote Access**: Connect to Gemini agent remotely through Hypha RPC
- **Streaming Responses**: Real-time streaming of agent responses and tool executions
- **Tool Integration**: Full access to Gemini CLI tools (file operations, shell commands, web search, etc.)
- **Authentication**: Secure token-based authentication through Hypha
- **Cross-Platform**: Works with both Python and JavaScript clients

## Setup

### Prerequisites

- Node.js (v18 or higher)
- Python 3.x (for testing clients)
- Gemini API key

### Installation

1. **Install Dependencies**
   ```bash
   npm install hypha-rpc
   pip install hypha-rpc
   ```

2. **Build the Gemini CLI**
   ```bash
   npm run build
   ```

3. **Set up Environment**
   ```bash
   export GEMINI_API_KEY="your-gemini-api-key"
   ```

## Usage

### Starting the Hypha Service

Run the Hypha service to register the Gemini agent:

```bash
node hypha-gemini-service.js
```

The service will:
- Connect to the Hypha server at `https://hypha.aicell.io`
- Register a service with ID `gemini-agent`
- Provide a `chat` function that yields streaming responses

### Using the CLI with Hypha Connection

Connect to the remote Gemini service using the extended CLI:

```bash
node packages/cli/dist/index.js \
  --connect https://hypha.aicell.io \
  --workspace ws-user-github|478667 \
  --token YOUR_TOKEN \
  --prompt "What is machine learning?"
```

#### Parameters

- `--connect <url>`: Hypha server URL
- `--workspace <workspace>`: Target workspace ID
- `--token <token>`: Authentication token
- `--service-id <id>`: Service ID (defaults to "gemini-agent")
- `--prompt <query>`: Query to send to the agent

### Using Python Client

```python
import asyncio
from hypha_rpc import connect_to_server

async def test_gemini():
    # Connect to Hypha server
    server = await connect_to_server({
        'server_url': 'https://hypha.aicell.io',
        'workspace': 'ws-user-github|478667',
        'token': 'YOUR_TOKEN'
    })
    
    # Get the Gemini service
    service = await server.get_service('ws-user-github|478667/gemini-agent')
    
    # Call the chat service
    async for response in await service.chat("Hello, how are you?"):
        if response.get('type') == 'text':
            print(response.get('content'), end='')
        elif response.get('type') == 'final':
            print("\nCompleted!")
            break

asyncio.run(test_gemini())
```

### Testing

Run the test client to verify the service:

```bash
# Simple connectivity test
python3 test_gemini_service.py simple

# Full test with multiple queries
python3 test_gemini_service.py
```

## Configuration

### Service Configuration

The service can be configured by modifying the constants in `hypha-gemini-service.js`:

```javascript
const HYPHA_SERVER_URL = 'https://hypha.aicell.io';
const WORKSPACE = 'ws-user-github|478667';
const TOKEN = 'your-token-here';
const SERVICE_ID = 'gemini-agent';
```

### Default Credentials

The current setup uses:
- **Server**: https://hypha.aicell.io
- **Workspace**: ws-user-github|478667
- **Token**: [Provided token with admin access]
- **Service ID**: gemini-agent

## Architecture

### Service Flow

1. **Initialization**: Service loads Gemini configuration and authenticates with Gemini API
2. **Registration**: Service registers with Hypha server providing a `chat` function
3. **Request Processing**: Client calls `chat` function with query
4. **Response Generation**: Service processes query through Gemini CLI core and yields streaming responses
5. **Tool Execution**: If needed, service executes tools and provides tool output

### Response Types

The service yields different response types:

- `status`: Status updates (e.g., "Initializing...", "Processing...")
- `text`: Actual response text from the agent
- `error`: Error messages
- `final`: Completion signal

## Error Handling

Common issues and solutions:

1. **ImageData Error**: Fixed with mock ImageData class for Node.js compatibility
2. **Authentication Errors**: Ensure valid Gemini API key and Hypha token
3. **Connection Issues**: Check network connectivity and server availability
4. **Service Not Found**: Ensure the service is running and properly registered

## Security

- Uses token-based authentication through Hypha
- API keys are handled securely through environment variables
- Service visibility is set to "public" but can be restricted to "private"

## Development

### Adding New Features

To extend the service:

1. Modify `hypha-gemini-service.js` to add new methods
2. Update the service registration to include new functions
3. Test with Python or JavaScript clients

### Debugging

Enable debug mode by setting:
```bash
export DEBUG=1
```

## License

Copyright 2025 Google LLC
SPDX-License-Identifier: Apache-2.0