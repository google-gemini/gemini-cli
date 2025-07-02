import React, { useState } from 'react';
import {
  AppShell,
  Burger,
  Group,
  Title,
  Container,
  Tabs,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconTerminal2, IconSettings, IconHistory } from '@tabler/icons-react';
import ChatInterface from './components/ChatInterface';
import ConfigurationPanel from './components/ConfigurationPanel';
import SessionHistory from './components/SessionHistory';
import { GeminiConfig } from './types';

function App() {
  const [opened, { toggle }] = useDisclosure();
  const [activeTab, setActiveTab] = useState<string>('chat');
  const [config, setConfig] = useState<GeminiConfig>({
    model: 'gemini-2.5-pro',
    sandbox: false,
    debug: false,
    allFiles: false,
    showMemoryUsage: false,
    yolo: false,
    telemetry: false,
    checkpointing: false
  });

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 300,
        breakpoint: 'sm',
        collapsed: { mobile: !opened },
      }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md">
          <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
          <Group>
            <IconTerminal2 size={28} />
            <Title order={3}>Gemini CLI</Title>
          </Group>
        </Group>
      </AppShell.Header>

      <Tabs value={activeTab} onChange={(value) => setActiveTab(value || 'chat')} orientation="vertical">
        <AppShell.Navbar p="md">
          <Tabs.List style={{ width: '100%' }}>
            <Tabs.Tab value="chat" leftSection={<IconTerminal2 size={16} />}>
              Chat
            </Tabs.Tab>
            <Tabs.Tab value="config" leftSection={<IconSettings size={16} />}>
              Configuration
            </Tabs.Tab>
            <Tabs.Tab value="history" leftSection={<IconHistory size={16} />}>
              Sessions
            </Tabs.Tab>
          </Tabs.List>
        </AppShell.Navbar>

        <AppShell.Main>
          <Container size="xl" h="100%">
            <Tabs.Panel value="chat">
              <ChatInterface config={config} />
            </Tabs.Panel>
            
            <Tabs.Panel value="config">
              <ConfigurationPanel config={config} onConfigChange={setConfig} />
            </Tabs.Panel>
            
            <Tabs.Panel value="history">
              <SessionHistory />
            </Tabs.Panel>
          </Container>
        </AppShell.Main>
      </Tabs>
    </AppShell>
  );
}

export default App;
