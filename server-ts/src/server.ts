import express from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { SessionManager } from './sessionManager.js';
import { ConfigParameters } from './types.js';

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Session manager
const sessionManager = new SessionManager();

// API Routes
app.get('/api/config', (req, res) => {
  res.json({
    models: [
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-1.5-pro',
      'gemini-1.5-flash'
    ],
    sandboxOptions: [true, false],
    telemetryTargets: ['local', 'gcp'],
    defaultConfig: {
      model: 'gemini-2.5-pro',
      sandbox: false,
      debug: false,
      allFiles: false,
      showMemoryUsage: false,
      yolo: false,
      telemetry: false,
      checkpointing: false
    }
  });
});

app.post('/api/chat/start', async (req, res) => {
  try {
    const sessionId = uuidv4();
    const config: ConfigParameters = req.body.config || {};
    
    await sessionManager.createSession(sessionId, config);
    
    res.json({ sessionId });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

app.get('/api/chat/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessionManager.getSession(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  res.json({ 
    id: sessionId, 
    status: 'active',
    historyLength: session.getHistoryLength()
  });
});

app.delete('/api/chat/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  sessionManager.deleteSession(sessionId);
  res.json({ success: true });
});

app.get('/api/sessions', (req, res) => {
  const sessions = sessionManager.getAllSessions();
  res.json(sessions);
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start HTTP server
const server = app.listen(PORT, () => {
  console.log(`Gemini CLI Server running on port ${PORT}`);
});

// WebSocket server for real-time chat
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('New WebSocket connection');
  
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'chat') {
        const { sessionId, prompt } = message;
        
        const session = sessionManager.getSession(sessionId);
        if (!session) {
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Session not found'
          }));
          return;
        }
        
        // Send start message
        ws.send(JSON.stringify({
          type: 'start',
          sessionId
        }));
        
        // Process the message and stream response
        await session.sendMessage(prompt, (chunk) => {
          ws.send(JSON.stringify({
            type: 'output',
            sessionId,
            data: chunk
          }));
        });
        
        // Send completion message
        ws.send(JSON.stringify({
          type: 'complete',
          sessionId
        }));
      }
    } catch (error) {
      console.error('WebSocket error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });
});

export default app;