document.addEventListener('DOMContentLoaded', () => {
  const serverUrlInput = document.getElementById('server-url');
  const chatHistory = document.getElementById('chat-history');
  const promptInput = document.getElementById('prompt-input');
  const sendBtn = document.getElementById('send-btn');
  const includeContextCheckbox = document.getElementById('include-page-context');

  // Helper for UUID generation
  function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
  }

  // Load saved settings
  chrome.storage.local.get(['serverUrl'], (result) => {
    if (result.serverUrl) {
      serverUrlInput.value = result.serverUrl;
    }
  });

  document.getElementById('save-config').addEventListener('click', () => {
    chrome.storage.local.set({ serverUrl: serverUrlInput.value });
    alert('Settings saved');
  });

  sendBtn.addEventListener('click', async () => {
    console.log('Send button clicked');
    const prompt = promptInput.value.trim();
    if (!prompt) return;

    // Remove trailing slash if present
    const serverUrl = serverUrlInput.value.replace(/\/$/, '');
    if (!serverUrl) {
      alert('Please set the Server URL');
      return;
    }

    appendMessage('user', prompt);
    promptInput.value = '';
    sendBtn.disabled = true;

    let context = '';
    if (includeContextCheckbox.checked) {
      try {
        console.log('Fetching page context...');
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.id) {
            const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => document.body.innerText,
            });
            context = `

[Context from ${tab.url}]:
${result}
`;
            console.log('Page context retrieved successfully');
        }
      } catch (e) {
        console.error('Failed to get page context:', e);
        appendMessage('agent', 'Error: Could not retrieve page context. ' + e.message);
      }
    }

    try {
      console.log(`Sending message to ${serverUrl}...`);
      await sendMessage(serverUrl, prompt + context);
    } catch (error) {
      console.error('sendMessage failed:', error);
      appendMessage('agent', `Error: ${error.message}`);
    } finally {
      sendBtn.disabled = false;
    }
  });

  function appendMessage(role, text) {
    const div = document.createElement('div');
    div.className = `message ${role}-message`;
    div.innerText = text;
    chatHistory.appendChild(div);
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }

  async function sendMessage(baseUrl, text) {
    let messageId;
    try {
        messageId = generateUUID();
    } catch (e) {
        console.error('UUID generation failed:', e);
        messageId = 'fallback-id-' + Date.now();
    }
    
    // Construct JSON-RPC payload based on testing_utils.ts
    const rpcPayload = {
        jsonrpc: '2.0',
        id: generateUUID(),
        method: 'message/stream',
        params: {
            message: {
                kind: 'message',
                role: 'user',
                parts: [{ kind: 'text', text: text }],
                messageId: messageId
            },
            metadata: {
                coderAgent: {
                    kind: 'agent-settings',
                    // Optional: Try to infer or leave empty if server has defaults
                    // workspacePath: '/tmp' 
                }
            }
        }
    };

    console.log('Sending payload:', rpcPayload);

    let response;
    
    // Try root endpoint first (JSON-RPC style)
    try {
        console.log(`Attempting POST ${baseUrl}/`);
        response = await fetch(`${baseUrl}/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rpcPayload)
        });
        console.log(`Root endpoint response status: ${response.status}`);
    } catch (e) {
        console.error(`Fetch to ${baseUrl}/ failed:`, e);
    }

    if (!response || response.status === 404) {
        console.log('Root endpoint 404 or failed, trying /message/stream (REST style)...');
        // Fallback to /message/stream
        try {
            response = await fetch(`${baseUrl}/message/stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(rpcPayload.params) // Send params as body
            });
            console.log(`/message/stream response status: ${response ? response.status : 'undefined'}`);
        } catch (e) {
             console.error(`Fetch to ${baseUrl}/message/stream failed:`, e);
        }
    }
    
    if (!response || response.status === 404) {
         console.log('Trying /v1/message/stream...');
         try {
             response = await fetch(`${baseUrl}/v1/message/stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(rpcPayload.params)
            });
            console.log(`/v1/message/stream response status: ${response ? response.status : 'undefined'}`);
         } catch (e) {
             console.error(`Fetch to ${baseUrl}/v1/message/stream failed:`, e);
         }
    }

    if (!response) {
        throw new Error('All fetch attempts failed. Check console for details.');
    }

    if (!response.ok) {
        throw new Error(`Server returned ${response.status} ${response.statusText}`);
    }

    await handleStream(response);
  }

  async function handleStream(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message agent-message';
    chatHistory.appendChild(messageDiv);
    
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        
        const lines = buffer.split('\n');
        // Process all complete lines
        for (let i = 0; i < lines.length - 1; i++) {
            const line = lines[i];
            if (line.startsWith('data: ')) {
                try {
                    const jsonStr = line.substring(6);
                    if (jsonStr.trim() === '[DONE]') continue;
                    
                    const jsonResponse = JSON.parse(jsonStr);
                    console.log('Event:', jsonResponse);
                    
                    // The server response wrapper: { jsonrpc: '2.0', result: EVENT, id: ... } 
                    const event = jsonResponse.result || jsonResponse; 

                    if (event.kind === 'status-update' && event.status && event.status.message) {
                        const message = event.status.message;
                        if (message.parts) {
                            const textParts = message.parts.filter(p => p.kind === 'text');
                            if (textParts.length > 0) {
                                // Accumulate text parts. 
                                // Note: In a real streaming scenario, we might get partial text or full updates.
                                // If _sendTextContent sends a new message each time, we should append.
                                // If it sends the same message with more text, we should replace?
                                // Based on task.ts, _sendTextContent creates a NEW messageId each time.
                                // So we should APPEND.
                                
                                const newText = textParts.map(p => p.text).join('');
                                messageDiv.innerText += newText;
                            }
                        }
                    }
                    
                    // Handle Tool Calls (if any info is sent via different event kind) 
                    // task.ts sends 'status-update' with 'ToolCallConfirmationEvent' or 'ToolCallUpdateEvent'
                    // The message contains 'data' part with ToolCall info.
                    
                    if (event.kind === 'status-update' && event.status.message?.parts) {
                         const dataParts = event.status.message.parts.filter(p => p.kind === 'data');
                         for (const part of dataParts) {
                             if (part.data && part.data.request) { // It's a tool call
                                 const toolName = part.data.tool?.name || part.data.request.name || 'Unknown Tool';
                                 const status = part.data.status;
                                 messageDiv.innerText += `\n[Tool: ${toolName} (${status})]\n`;
                             }
                         }
                    }
                    
                } catch (e) {
                    console.error('Parse error', e, line);
                }
            }
        }
        // Keep the last incomplete line in buffer
        buffer = lines[lines.length - 1];
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }
  }
});
