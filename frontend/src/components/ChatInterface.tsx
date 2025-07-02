import React, { useState, useEffect, useRef } from 'react';
import {
  Stack,
  TextInput,
  Button,
  Paper,
  Text,
  Group,
  Badge,
  ScrollArea,
  ActionIcon,
  Loader,
  Code,
} from '@mantine/core';
import { IconSend, IconPlayerStop, IconTrash } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { GeminiConfig, ChatMessage, WebSocketMessage } from '../types';
import { useWebSocket } from '../hooks/useWebSocket';
import { v4 as uuidv4 } from 'uuid';

interface Props {
  config: GeminiConfig;
}

const ChatInterface: React.FC<Props> = ({ config }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { socket, isConnected, sendMessage } = useWebSocket();

  useEffect(() => {
    if (socket) {
      socket.onmessage = (event) => {
        const message: WebSocketMessage = JSON.parse(event.data);
        
        switch (message.type) {
          case 'start':
            setIsLoading(true);
            addMessage('system', 'Starting Gemini CLI...');
            break;
            
          case 'output':
            if (message.data) {
              // Check if the last message is from assistant, if so append to it
              // Otherwise create a new assistant message
              const outputData = message.data;
              setMessages(prev => {
                const lastMessage = prev.length > 0 ? prev[prev.length - 1] : null;
                if (lastMessage && lastMessage.type === 'assistant') {
                  return [
                    ...prev.slice(0, -1),
                    { ...lastMessage, content: lastMessage.content + outputData }
                  ];
                } else {
                  return [
                    ...prev,
                    {
                      id: uuidv4(),
                      type: 'assistant' as const,
                      content: outputData,
                      timestamp: new Date(),
                    }
                  ];
                }
              });
            }
            break;
            
          case 'error':
            if (message.data) {
              addMessage('error', message.data);
            } else if (message.error) {
              addMessage('error', message.error);
            }
            break;
            
          case 'complete':
            setIsLoading(false);
            addMessage('system', `Process completed with exit code: ${message.exitCode}`);
            break;
        }
      };
    }
  }, [socket]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const addMessage = (type: ChatMessage['type'], content: string) => {
    const message: ChatMessage = {
      id: uuidv4(),
      type,
      content,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, message]);
  };


  const startNewSession = async () => {
    try {
      const response = await fetch('/api/chat/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      
      const data = await response.json();
      if (data.sessionId) {
        setSessionId(data.sessionId);
        notifications.show({
          title: 'Session Started',
          message: 'New chat session created',
          color: 'green',
        });
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to start new session',
        color: 'red',
      });
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !isConnected) return;

    let currentSessionId = sessionId;
    
    if (!currentSessionId) {
      try {
        const response = await fetch('/api/chat/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config }),
        });
        const data = await response.json();
        currentSessionId = data.sessionId;
        setSessionId(currentSessionId);
      } catch (error) {
        notifications.show({
          title: 'Error',
          message: 'Failed to start session',
          color: 'red',
        });
        return;
      }
    }

    addMessage('user', input);
    
    const message: WebSocketMessage = {
      type: 'chat',
      sessionId: currentSessionId || undefined,
      prompt: input,
      config,
    };
    
    sendMessage(JSON.stringify(message));
    setInput('');
  };

  const clearMessages = () => {
    setMessages([]);
  };

  const stopGeneration = () => {
    setIsLoading(false);
    if (socket) {
      socket.close();
    }
  };

  const renderMessage = (message: ChatMessage) => {
    const getMessageColor = () => {
      switch (message.type) {
        case 'user': return 'blue';
        case 'assistant': return 'green';
        case 'system': return 'gray';
        case 'error': return 'red';
        default: return 'gray';
      }
    };

    const getMessageLabel = () => {
      switch (message.type) {
        case 'user': return 'You';
        case 'assistant': return 'Gemini';
        case 'system': return 'System';
        case 'error': return 'Error';
        default: return 'Unknown';
      }
    };

    return (
      <Paper key={message.id} p="md" mb="sm" withBorder>
        <Group justify="space-between" mb="xs">
          <Badge color={getMessageColor()} variant="light">
            {getMessageLabel()}
          </Badge>
          <Text size="xs" c="dimmed">
            {message.timestamp.toLocaleTimeString()}
          </Text>
        </Group>
        <Code block={message.content.includes('\n')} c={message.type === 'error' ? 'red' : undefined}>
          {message.content}
        </Code>
      </Paper>
    );
  };

  return (
    <Stack h="100%" gap="md">
      <Group justify="space-between">
        <Text size="lg" fw={500}>Chat with Gemini CLI</Text>
        <Group>
          <ActionIcon
            variant="light"
            color="red"
            onClick={clearMessages}
            disabled={isLoading}
          >
            <IconTrash size={16} />
          </ActionIcon>
          <Badge color={isConnected ? 'green' : 'red'} variant="light">
            {isConnected ? 'Connected' : 'Disconnected'}
          </Badge>
        </Group>
      </Group>

      <ScrollArea flex={1} h={400}>
        {messages.map(renderMessage)}
        {isLoading && (
          <Paper p="md" mb="sm" withBorder>
            <Group>
              <Loader size="sm" />
              <Text>Gemini is thinking...</Text>
            </Group>
          </Paper>
        )}
        <div ref={messagesEndRef} />
      </ScrollArea>

      <Group>
        <TextInput
          flex={1}
          placeholder="Enter your prompt..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
          disabled={!isConnected || isLoading}
        />
        {isLoading ? (
          <Button
            color="red"
            leftSection={<IconPlayerStop size={16} />}
            onClick={stopGeneration}
          >
            Stop
          </Button>
        ) : (
          <Button
            leftSection={<IconSend size={16} />}
            onClick={handleSendMessage}
            disabled={!input.trim() || !isConnected}
          >
            Send
          </Button>
        )}
      </Group>
    </Stack>
  );
};

export default ChatInterface;