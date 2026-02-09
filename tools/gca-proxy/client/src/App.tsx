/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Checkbox,
  TextField,
  Button,
  Chip,
  Divider,
  Alert,
  CssBaseline,
  ThemeProvider,
  createTheme,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

interface InterceptConfig {
  [endpoint: string]: boolean;
}

interface PendingRequest {
  id: string;
  method: string;
  path: string;
  body: unknown;
  receivedAt: string;
  upstreamResponse?: {
    statusCode: number;
    headers: Record<string, string>;
    body: unknown;
    chunks?: unknown[];
  };
}

function App() {
  const [config, setConfig] = useState<InterceptConfig>({});
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editedResponse, setEditedResponse] = useState<string>('');
  const [editedChunks, setEditedChunks] = useState<string>('');
  const [statusCode, setStatusCode] = useState(200);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const selected = pending.find((p) => p.id === selectedId);
  const isStreaming = selected?.upstreamResponse?.chunks !== undefined;

  // WebSocket connection
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    const connect = () => {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connected');
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          switch (msg.type) {
            case 'config':
              setConfig(msg.data);
              break;
            case 'pending_list':
              setPending(msg.data);
              break;
            case 'request_intercepted':
              // Update with full details
              setPending((prev) => {
                const existing = prev.find((p) => p.id === msg.data.id);
                if (existing) {
                  return prev.map((p) =>
                    p.id === msg.data.id ? { ...p, ...msg.data } : p,
                  );
                }
                return [...prev, msg.data];
              });
              // Auto-select if nothing selected
              setSelectedId((cur) => cur ?? msg.data.id);
              break;
          }
        } catch (e) {
          console.error('WS parse error:', e);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected, reconnecting...');
        setConnected(false);
        setTimeout(connect, 2000);
      };

      ws.onerror = (e) => {
        console.error('WebSocket error:', e);
      };

      wsRef.current = ws;
    };

    connect();

    return () => {
      wsRef.current?.close();
    };
  }, []);

  // Update edited response when selection changes
  useEffect(() => {
    if (selected?.upstreamResponse) {
      if (selected.upstreamResponse.chunks) {
        setEditedChunks(
          JSON.stringify(selected.upstreamResponse.chunks, null, 2),
        );
        setEditedResponse('');
      } else {
        setEditedResponse(
          JSON.stringify(selected.upstreamResponse.body, null, 2),
        );
        setEditedChunks('');
      }
      setStatusCode(selected.upstreamResponse.statusCode);
    }
  }, [selected]);

  const toggleEndpoint = useCallback(
    (endpoint: string) => {
      const newValue = !config[endpoint];
      setConfig((prev) => ({ ...prev, [endpoint]: newValue }));
      wsRef.current?.send(
        JSON.stringify({
          type: 'update_config',
          config: { [endpoint]: newValue },
        }),
      );
    },
    [config],
  );

  const releaseRequest = useCallback(() => {
    if (!selectedId) return;

    try {
      const msg: {
        type: string;
        id: string;
        statusCode: number;
        body?: unknown;
        chunks?: unknown[];
      } = {
        type: 'release',
        id: selectedId,
        statusCode,
      };

      if (isStreaming) {
        msg.chunks = JSON.parse(editedChunks);
      } else {
        msg.body = JSON.parse(editedResponse);
      }

      wsRef.current?.send(JSON.stringify(msg));
      setSelectedId(null);
      setEditedResponse('');
      setEditedChunks('');
    } catch (e) {
      alert('Invalid JSON: ' + e);
    }
  }, [selectedId, statusCode, isStreaming, editedChunks, editedResponse]);

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Container maxWidth="xl" sx={{ py: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 2 }}>
          <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
            🔀 GCA Proxy
          </Typography>
          <Chip
            label={connected ? 'Connected' : 'Disconnected'}
            color={connected ? 'success' : 'error'}
            size="small"
          />
          {pending.length > 0 && (
            <Chip
              label={`${pending.length} pending`}
              color="warning"
              size="small"
            />
          )}
        </Box>

        <Box sx={{ display: 'flex', gap: 2, height: 'calc(100vh - 100px)' }}>
          {/* Left: Endpoint Toggles */}
          <Paper sx={{ width: 280, overflow: 'auto', flexShrink: 0 }}>
            <Typography
              variant="subtitle2"
              sx={{ p: 1, bgcolor: 'primary.dark' }}
            >
              Intercept Endpoints
            </Typography>
            <List dense>
              {Object.entries(config).map(([endpoint, enabled]) => (
                <ListItem key={endpoint} disablePadding>
                  <ListItemButton
                    onClick={() => toggleEndpoint(endpoint)}
                    dense
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <Checkbox
                        edge="start"
                        checked={enabled}
                        tabIndex={-1}
                        disableRipple
                        size="small"
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={endpoint.replace('/v1internal', '')}
                      primaryTypographyProps={{ fontSize: 12 }}
                    />
                    {enabled ? (
                      <PauseIcon fontSize="small" color="warning" />
                    ) : (
                      <PlayArrowIcon fontSize="small" color="success" />
                    )}
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Paper>

          {/* Center: Request Queue */}
          <Paper sx={{ width: 300, overflow: 'auto', flexShrink: 0 }}>
            <Typography
              variant="subtitle2"
              sx={{ p: 1, bgcolor: 'warning.dark' }}
            >
              Pending Requests
            </Typography>
            {pending.length === 0 ? (
              <Alert severity="info" sx={{ m: 1 }}>
                No pending requests. Enable interception for an endpoint.
              </Alert>
            ) : (
              <List dense>
                {pending.map((req) => (
                  <ListItem key={req.id} disablePadding>
                    <ListItemButton
                      selected={selectedId === req.id}
                      onClick={() => setSelectedId(req.id)}
                    >
                      <ListItemText
                        primary={
                          <Box
                            sx={{
                              display: 'flex',
                              gap: 1,
                              alignItems: 'center',
                            }}
                          >
                            <Chip
                              label={req.method}
                              size="small"
                              color="primary"
                              sx={{ fontSize: 10 }}
                            />
                            <Typography variant="body2" sx={{ fontSize: 11 }}>
                              {req.path.replace('/v1internal', '')}
                            </Typography>
                          </Box>
                        }
                        secondary={new Date(
                          req.receivedAt,
                        ).toLocaleTimeString()}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            )}
          </Paper>

          {/* Right: Response Editor */}
          <Paper
            sx={{
              flex: 1,
              overflow: 'auto',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Typography
              variant="subtitle2"
              sx={{ p: 1, bgcolor: 'success.dark' }}
            >
              Response Editor
            </Typography>

            {!selected ? (
              <Alert severity="info" sx={{ m: 1 }}>
                Select a pending request to edit its response.
              </Alert>
            ) : (
              <Box
                sx={{
                  p: 2,
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                {/* Request Info */}
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Request Body:
                  </Typography>
                  <TextField
                    multiline
                    fullWidth
                    minRows={3}
                    maxRows={6}
                    value={JSON.stringify(selected.body, null, 2)}
                    InputProps={{ readOnly: true }}
                    size="small"
                    sx={{ fontFamily: 'monospace', fontSize: 11 }}
                  />
                </Box>

                <Divider />

                {/* Response Editor */}
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  <TextField
                    label="Status Code"
                    type="number"
                    value={statusCode}
                    onChange={(e) => setStatusCode(Number(e.target.value))}
                    size="small"
                    sx={{ width: 100 }}
                  />
                  <Chip
                    label={isStreaming ? 'SSE Streaming' : 'JSON Response'}
                    color={isStreaming ? 'secondary' : 'default'}
                    size="small"
                  />
                  <Box sx={{ flex: 1 }} />
                  <Button
                    variant="contained"
                    color="success"
                    onClick={releaseRequest}
                    startIcon={<PlayArrowIcon />}
                  >
                    Continue
                  </Button>
                </Box>

                <Typography variant="body2" color="text.secondary">
                  {isStreaming
                    ? 'Response Chunks (edit array):'
                    : 'Response Body (edit JSON):'}
                </Typography>

                <TextField
                  multiline
                  fullWidth
                  minRows={10}
                  value={isStreaming ? editedChunks : editedResponse}
                  onChange={(e) =>
                    isStreaming
                      ? setEditedChunks(e.target.value)
                      : setEditedResponse(e.target.value)
                  }
                  size="small"
                  sx={{
                    flex: 1,
                    '& .MuiInputBase-input': {
                      fontFamily: 'monospace',
                      fontSize: 11,
                    },
                  }}
                />
              </Box>
            )}
          </Paper>
        </Box>
      </Container>
    </ThemeProvider>
  );
}

export default App;
