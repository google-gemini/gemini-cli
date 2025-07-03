# Gemini CLI Hypha Integration

This project provides Hypha service integration for the Gemini CLI agent, enabling remote programmatic access to the Gemini agent through Hypha RPC.

## Overview

The integration consists of:

1. **CLI Service Mode** - The Gemini CLI can register itself as a Hypha service
2. **CLI Client Mode** - The Gemini CLI can connect to remote Hypha services  
3. **Python Client** (`test_gemini_service.py`) - Example client for testing the service

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

### Register Gemini CLI as a Hypha Service

Register the Gemini CLI as a service on the Hypha server:

```bash
gemini --connect https://hypha.aicell.io \
       --workspace ws-user-github|478667 \
       --token YOUR_TOKEN \
       --service-id gemini-agent
```

This will:
- Connect to the Hypha server at `https://hypha.aicell.io`
- Register as a service with ID `gemini-agent`
- Provide a `chat` function that yields streaming responses
- Keep running to serve requests

### Connect to Remote Gemini Service

Use the Gemini CLI to connect to an existing remote service:

```bash
gemini --connect https://hypha.aicell.io \
       --workspace ws-user-github|478667 \
       --token YOUR_TOKEN \
       --service-id gemini-agent \
       --prompt "What is machine learning?"
```

#### Parameters

- `--connect <url>`: Hypha server URL
- `--workspace <workspace>`: Target workspace ID
- `--token <token>`: Authentication token
- `--service-id <id>`: Service ID (defaults to "gemini-agent")
- `--prompt <query>`: Query to send to the agent (only for client mode)

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

## Usage Modes

### 1. Service Mode (Register)

When you run without `--prompt`, the CLI registers as a service:

```bash
gemini --connect https://hypha.aicell.io --workspace WORKSPACE --token TOKEN
```

Output:
```
Registering Gemini CLI as Hypha service...
Server: https://hypha.aicell.io
Workspace: ws-user-github|478667
Service ID: gemini-agent
✅ Service registered with ID: ws-user-github|478667/abc123:gemini-agent
🌐 Service URL: https://hypha.aicell.io/ws-user-github|478667/services/gemini-agent/chat
🚀 Service is now running. Press Ctrl+C to stop.
```

### 2. Client Mode (Connect)

When you run with `--prompt`, the CLI connects to existing service:

```bash
gemini --connect https://hypha.aicell.io --workspace WORKSPACE --token TOKEN --prompt "Your question"
```

Output:
```
Connecting to Hypha server at https://hypha.aicell.io...
Connected to workspace: ws-user-github|478667
Looking for service: ws-user-github|478667/gemini-agent
Found service: ws-user-github|478667/abc123:gemini-agent

Processing query: Your question

[STATUS] Initializing Gemini client...
[STATUS] Processing query with Gemini...
Your answer appears here...
[COMPLETED] Query processed successfully
```

## Configuration

### Default Credentials

The current setup uses:
- **Server**: https://hypha.aicell.io
- **Workspace**: ws-user-github|478667
- **Token**: [Your provided token with admin access]
- **Service ID**: gemini-agent

## Architecture

### Service Flow

1. **Registration**: Gemini CLI registers itself as a Hypha service
2. **Request Processing**: Client calls `chat` function with query
3. **Response Generation**: Service processes query through Gemini CLI core and yields streaming responses
4. **Tool Execution**: If needed, service executes tools and provides tool output

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

1. Modify the `chat` function in `registerAsHyphaService`
2. Add new methods to the service registration
3. Test with Python or JavaScript clients

### Debugging

Enable debug mode by setting:
```bash
export DEBUG=1
```

## License

Copyright 2025 Google LLC
SPDX-License-Identifier: Apache-2.0