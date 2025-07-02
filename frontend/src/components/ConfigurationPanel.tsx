import React, { useState, useEffect } from 'react';
import {
  Stack,
  Select,
  Switch,
  TextInput,
  Button,
  Group,
  Text,
  Paper,
  Divider,
  Badge,
  Alert,
} from '@mantine/core';
import { IconSettings, IconInfoCircle } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { GeminiConfig, ConfigOptions } from '../types';

interface Props {
  config: GeminiConfig;
  onConfigChange: (config: GeminiConfig) => void;
}

const ConfigurationPanel: React.FC<Props> = ({ config, onConfigChange }) => {
  const [configOptions, setConfigOptions] = useState<ConfigOptions | null>(null);
  const [localConfig, setLocalConfig] = useState<GeminiConfig>(config);

  useEffect(() => {
    fetchConfigOptions();
  }, []);

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  const fetchConfigOptions = async () => {
    try {
      const response = await fetch('/api/config');
      const data = await response.json();
      setConfigOptions(data);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to fetch configuration options',
        color: 'red',
      });
    }
  };

  const handleConfigChange = (field: keyof GeminiConfig, value: any) => {
    setLocalConfig(prev => ({ ...prev, [field]: value }));
  };

  const saveConfig = () => {
    onConfigChange(localConfig);
    notifications.show({
      title: 'Configuration Saved',
      message: 'Your settings have been updated',
      color: 'green',
    });
  };

  const resetConfig = () => {
    if (configOptions) {
      setLocalConfig(configOptions.defaultConfig);
    }
  };

  if (!configOptions) {
    return <Text>Loading configuration options...</Text>;
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text size="lg" fw={500}>Configuration</Text>
        <Badge color="blue" variant="light">CLI Settings</Badge>
      </Group>

      <Alert icon={<IconInfoCircle size={16} />} title="Configuration Help">
        These settings control how the Gemini CLI behaves. Changes will apply to new chat sessions.
      </Alert>

      <Paper p="md" withBorder>
        <Stack gap="md">
          <Text fw={500} mb="xs">Model Settings</Text>
          
          <Select
            label="Model"
            description="Choose the Gemini model to use"
            placeholder="Select a model"
            data={configOptions.models}
            value={localConfig.model}
            onChange={(value) => handleConfigChange('model', value)}
          />

          <Divider my="md" />

          <Text fw={500} mb="xs">Execution Options</Text>
          
          <Switch
            label="Sandbox Mode"
            description="Run commands in a sandboxed environment"
            checked={localConfig.sandbox}
            onChange={(event) => handleConfigChange('sandbox', event.currentTarget.checked)}
          />

          <Switch
            label="Debug Mode"
            description="Enable debug output for troubleshooting"
            checked={localConfig.debug}
            onChange={(event) => handleConfigChange('debug', event.currentTarget.checked)}
          />

          <Switch
            label="Include All Files"
            description="Include all files in the context (may use more tokens)"
            checked={localConfig.allFiles}
            onChange={(event) => handleConfigChange('allFiles', event.currentTarget.checked)}
          />

          <Switch
            label="Show Memory Usage"
            description="Display memory usage information"
            checked={localConfig.showMemoryUsage}
            onChange={(event) => handleConfigChange('showMemoryUsage', event.currentTarget.checked)}
          />

          <Switch
            label="YOLO Mode"
            description="Automatically accept all actions (use with caution!)"
            checked={localConfig.yolo}
            onChange={(event) => handleConfigChange('yolo', event.currentTarget.checked)}
          />

          <Switch
            label="Checkpointing"
            description="Enable checkpointing of file edits"
            checked={localConfig.checkpointing}
            onChange={(event) => handleConfigChange('checkpointing', event.currentTarget.checked)}
          />

          <Divider my="md" />

          <Text fw={500} mb="xs">Telemetry Settings</Text>
          
          <Switch
            label="Enable Telemetry"
            description="Send usage data to help improve the CLI"
            checked={localConfig.telemetry}
            onChange={(event) => handleConfigChange('telemetry', event.currentTarget.checked)}
          />

          {localConfig.telemetry && (
            <>
              <Select
                label="Telemetry Target"
                description="Where to send telemetry data"
                placeholder="Select target"
                data={configOptions.telemetryTargets}
                value={localConfig.telemetryTarget}
                onChange={(value) => handleConfigChange('telemetryTarget', value)}
              />

              <TextInput
                label="OTLP Endpoint"
                description="Custom OTLP endpoint for telemetry"
                placeholder="https://your-endpoint.com"
                value={localConfig.telemetryOtlpEndpoint || ''}
                onChange={(event) => handleConfigChange('telemetryOtlpEndpoint', event.currentTarget.value)}
              />

              <Switch
                label="Log Prompts"
                description="Include user prompts in telemetry data"
                checked={localConfig.telemetryLogPrompts || false}
                onChange={(event) => handleConfigChange('telemetryLogPrompts', event.currentTarget.checked)}
              />
            </>
          )}

          <Divider my="md" />

          <Text fw={500} mb="xs">Advanced Settings</Text>
          
          <TextInput
            label="Sandbox Image"
            description="Custom sandbox container image URI"
            placeholder="us-docker.pkg.dev/..."
            value={localConfig.sandboxImage || ''}
            onChange={(event) => handleConfigChange('sandboxImage', event.currentTarget.value)}
          />
        </Stack>
      </Paper>

      <Group justify="flex-end">
        <Button variant="light" onClick={resetConfig}>
          Reset to Defaults
        </Button>
        <Button leftSection={<IconSettings size={16} />} onClick={saveConfig}>
          Save Configuration
        </Button>
      </Group>
    </Stack>
  );
};

export default ConfigurationPanel;