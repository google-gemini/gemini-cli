import React, { useState, useEffect } from 'react';
import {
  Stack,
  Text,
  Paper,
  Group,
  Badge,
  Button,
  ActionIcon,
  Table,
  Modal,
  ScrollArea,
} from '@mantine/core';
import { IconTrash, IconEye, IconRefresh } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { ChatSession } from '../types';

const SessionHistory: React.FC = () => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [modalOpened, setModalOpened] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/sessions');
      const data = await response.json();
      setSessions(data);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to fetch sessions',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteSession = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/chat/${sessionId}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        notifications.show({
          title: 'Session Deleted',
          message: 'Session has been removed',
          color: 'green',
        });
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to delete session',
        color: 'red',
      });
    }
  };

  const viewSession = (session: ChatSession) => {
    setSelectedSession(session);
    setModalOpened(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready': return 'blue';
      case 'active': return 'green';
      case 'completed': return 'gray';
      case 'error': return 'red';
      default: return 'gray';
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString();
  };

  const rows = sessions.map((session) => (
    <Table.Tr key={session.id}>
      <Table.Td>
        <Text size="sm" truncate w={100}>
          {session.id}
        </Text>
      </Table.Td>
      <Table.Td>
        <Badge color={getStatusColor(session.status)} variant="light">
          {session.status}
        </Badge>
      </Table.Td>
      <Table.Td>
        <Text size="sm">{session.config.model}</Text>
      </Table.Td>
      <Table.Td>
        <Text size="sm">{formatDate(session.createdAt)}</Text>
      </Table.Td>
      <Table.Td>
        <Group gap="xs">
          <ActionIcon
            variant="light"
            color="blue"
            size="sm"
            onClick={() => viewSession(session)}
          >
            <IconEye size={14} />
          </ActionIcon>
          <ActionIcon
            variant="light"
            color="red"
            size="sm"
            onClick={() => deleteSession(session.id)}
          >
            <IconTrash size={14} />
          </ActionIcon>
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text size="lg" fw={500}>Session History</Text>
        <Button
          leftSection={<IconRefresh size={16} />}
          variant="light"
          onClick={fetchSessions}
          loading={loading}
        >
          Refresh
        </Button>
      </Group>

      {sessions.length === 0 ? (
        <Paper p="xl" ta="center">
          <Text c="dimmed">No sessions found</Text>
          <Text size="sm" c="dimmed" mt="xs">
            Start a new chat to create your first session
          </Text>
        </Paper>
      ) : (
        <Paper withBorder>
          <ScrollArea>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Session ID</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Model</Table.Th>
                  <Table.Th>Created</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>{rows}</Table.Tbody>
            </Table>
          </ScrollArea>
        </Paper>
      )}

      <Modal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        title="Session Details"
        size="lg"
      >
        {selectedSession && (
          <Stack gap="md">
            <Group>
              <Text fw={500}>Session ID:</Text>
              <Text>{selectedSession.id}</Text>
            </Group>
            
            <Group>
              <Text fw={500}>Status:</Text>
              <Badge color={getStatusColor(selectedSession.status)} variant="light">
                {selectedSession.status}
              </Badge>
            </Group>
            
            <Group>
              <Text fw={500}>Model:</Text>
              <Text>{selectedSession.config.model}</Text>
            </Group>
            
            <Group>
              <Text fw={500}>Created:</Text>
              <Text>{formatDate(selectedSession.createdAt)}</Text>
            </Group>

            <Text fw={500}>Configuration:</Text>
            <Paper p="md" bg="gray.0" withBorder>
              <Text size="sm" component="pre">
                {JSON.stringify(selectedSession.config, null, 2)}
              </Text>
            </Paper>

            {selectedSession.messages && selectedSession.messages.length > 0 && (
              <>
                <Text fw={500}>Messages ({selectedSession.messages.length}):</Text>
                <ScrollArea h={200}>
                  <Stack gap="xs">
                    {selectedSession.messages.map((message) => (
                      <Paper key={message.id} p="sm" bg="gray.0" withBorder>
                        <Group justify="space-between" mb="xs">
                          <Badge size="sm" color={message.type === 'user' ? 'blue' : 'green'}>
                            {message.type}
                          </Badge>
                          <Text size="xs" c="dimmed">
                            {formatDate(message.timestamp)}
                          </Text>
                        </Group>
                        <Text size="sm">{message.content}</Text>
                      </Paper>
                    ))}
                  </Stack>
                </ScrollArea>
              </>
            )}
          </Stack>
        )}
      </Modal>
    </Stack>
  );
};

export default SessionHistory;