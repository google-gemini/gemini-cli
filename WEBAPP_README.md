# Gemini CLI Web Interface

This is a full-stack web application that provides a modern frontend interface for the Gemini CLI. It allows you to configure all CLI options through a user-friendly interface and chat with Gemini through your browser.

## Features

- **Interactive Chat Interface**: Chat with Gemini CLI through a modern web interface
- **Configuration Panel**: Configure all Gemini CLI options (model, sandbox, debug modes, etc.)
- **Session Management**: Track and manage chat sessions
- **Real-time Communication**: WebSocket-based real-time communication with the CLI
- **Responsive Design**: Built with Mantine UI for a polished, responsive experience

## Architecture

```
┌─────────────────┐    WebSocket    ┌─────────────────┐    Process     ┌─────────────────┐
│                 │ ◄──────────────► │                 │ ◄─────────────► │                 │
│  React Frontend │                 │  Express Server │                 │   Gemini CLI    │
│                 │  HTTP/REST API  │                 │   (Node.js)     │   (Bundle)      │
│  (Mantine UI)   │ ◄──────────────► │   (WebSocket)   │                 │                 │
└─────────────────┘                 └─────────────────┘                 └─────────────────┘
```

- **Frontend**: React + TypeScript + Mantine UI
- **Backend**: Express.js server that wraps the Gemini CLI
- **Communication**: WebSocket for real-time chat, REST API for configuration
- **CLI Integration**: Spawns Gemini CLI processes with user-configured options

## Quick Start

### Development Mode

Run both frontend and backend in development mode:

```bash
npm run webapp:dev
```

This will start:
- Frontend dev server on http://localhost:3000
- Backend server on http://localhost:3001

### Production Mode

Build and run in production mode:

```bash
npm run webapp:start
```

This will:
1. Build the React frontend for production
2. Start the Express server serving the built frontend

### Individual Commands

```bash
# Build frontend only
npm run build:frontend

# Start backend only (development)
npm run dev:server

# Start backend only (production)
npm run start:server

# Start frontend only (development)
npm run dev:frontend
```

## Usage

1. **Configure Settings**: Use the Configuration panel to set up your Gemini CLI preferences:
   - Choose your preferred model (gemini-2.5-pro, gemini-1.5-flash, etc.)
   - Enable/disable sandbox mode, debug mode, YOLO mode
   - Configure telemetry settings
   - Set advanced options

2. **Start Chatting**: Go to the Chat tab and start sending prompts to Gemini
   - Type your message in the input field
   - Press Enter or click Send
   - Watch the real-time responses from Gemini CLI

3. **Manage Sessions**: Use the Sessions tab to:
   - View all active and completed chat sessions
   - Delete old sessions
   - Review session details and configurations

## API Endpoints

### REST API

- `GET /api/config` - Get available configuration options
- `POST /api/chat/start` - Start a new chat session
- `GET /api/chat/:sessionId` - Get session details
- `DELETE /api/chat/:sessionId` - Delete a session
- `GET /api/sessions` - Get all sessions
- `GET /api/health` - Health check

### WebSocket

Connect to the same host/port for WebSocket communication:

```javascript
const ws = new WebSocket('ws://localhost:3001');

// Send a chat message
ws.send(JSON.stringify({
  type: 'chat',
  sessionId: 'session-id',
  prompt: 'Your message here',
  config: { model: 'gemini-2.5-pro', debug: true }
}));
```

## Configuration

The application supports all Gemini CLI configuration options:

### Core Options
- **Model**: Choose from available Gemini models
- **Sandbox**: Run in sandboxed environment
- **Debug**: Enable debug output
- **All Files**: Include all files in context
- **YOLO**: Auto-accept all actions (use carefully!)
- **Checkpointing**: Enable file edit checkpointing

### Telemetry Options
- **Enable Telemetry**: Send usage data
- **Telemetry Target**: local or gcp
- **OTLP Endpoint**: Custom telemetry endpoint
- **Log Prompts**: Include prompts in telemetry

## Authentication

The application uses the same authentication as the Gemini CLI. Make sure you have either:

1. Set your API key: `export GEMINI_API_KEY="your-api-key"`
2. Signed in via `gemini auth` command
3. Have valid authentication credentials available

## Troubleshooting

### Common Issues

1. **WebSocket Connection Failed**
   - Check if the server is running on the correct port
   - Verify firewall settings
   - Try refreshing the page

2. **CLI Command Failed**
   - Check authentication (API key or login)
   - Verify Gemini CLI is properly built (`npm run bundle`)
   - Check server logs for error details

3. **Build Errors**
   - Ensure all dependencies are installed (`npm install`)
   - Check Node.js version (>=18.0.0 required)

### Logs

Server logs will show:
- WebSocket connections
- CLI process outputs
- API requests
- Error details

## Development

### Project Structure

```
├── frontend/           # React frontend application
│   ├── src/
│   │   ├── components/ # React components
│   │   ├── hooks/      # Custom React hooks
│   │   ├── types.ts    # TypeScript type definitions
│   │   └── App.tsx     # Main App component
│   └── package.json
├── server/             # Express.js backend
│   ├── index.js        # Main server file
│   └── package.json
└── bundle/             # Built Gemini CLI
    └── gemini.js
```

### Adding Features

1. **New Configuration Options**: Update `types.ts` and add UI in `ConfigurationPanel.tsx`
2. **Chat Features**: Extend `ChatInterface.tsx` and WebSocket message handling
3. **API Endpoints**: Add new routes in `server/index.js`

### Type Safety

The application maintains type safety between frontend and backend through shared TypeScript interfaces in `frontend/src/types.ts`. When adding new features, ensure you update the types to maintain the contract between client and server.