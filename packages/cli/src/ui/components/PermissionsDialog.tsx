/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { useKeypress } from '../hooks/useKeypress.js';
import {
  PermissionService,
  ToolPermission,
} from '../../services/PermissionService.js';
import { Config } from '@google/gemini-cli-core';

interface PermissionsDialogProps {
  config: Config;
  onClose: () => void;
}

interface PermissionGroup {
  type: string;
  name: string;
  permissions: ToolPermission[];
}

export function PermissionsDialog({
  config,
  onClose,
}: PermissionsDialogProps): React.JSX.Element {
  const [permissionService] = useState(() => new PermissionService(config));
  const [permissions, setPermissions] = useState<ToolPermission[]>([]);
  const [permissionGroups, setPermissionGroups] = useState<PermissionGroup[]>(
    [],
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [focusSection, setFocusSection] = useState<'groups' | 'actions'>(
    'groups',
  );
  const [loading, setLoading] = useState(true);

  // Load permissions on mount
  useEffect(() => {
    const loadPermissions = () => {
      setLoading(true);
      try {
        const allPermissions = permissionService.getAllPermissions();
        setPermissions(allPermissions);

        // Group permissions by type
        const groups: PermissionGroup[] = [
          {
            type: 'shell',
            name: 'Shell Commands',
            permissions: allPermissions.filter((p) => p.type === 'shell'),
          },
          {
            type: 'mcp',
            name: 'MCP Tools',
            permissions: allPermissions.filter((p) =>
              p.type.startsWith('mcp_'),
            ),
          },
          {
            type: 'memory',
            name: 'Memory Operations',
            permissions: allPermissions.filter((p) => p.type === 'memory'),
          },
          {
            type: 'global',
            name: 'Global Settings',
            permissions: allPermissions.filter((p) => p.type === 'global'),
          },
        ];

        setPermissionGroups(groups);
      } catch (error) {
        console.error('Failed to load permissions:', error);
      }
      setLoading(false);
    };

    loadPermissions();
  }, [permissionService]);

  const handleResetAll = () => {
    try {
      permissionService.resetAllPermissions();
      // Reload permissions
      const allPermissions = permissionService.getAllPermissions();
      setPermissions(allPermissions);

      // Regroup permissions
      const groups: PermissionGroup[] = [
        {
          type: 'shell',
          name: 'Shell Commands',
          permissions: allPermissions.filter((p) => p.type === 'shell'),
        },
        {
          type: 'mcp',
          name: 'MCP Tools',
          permissions: allPermissions.filter((p) => p.type.startsWith('mcp_')),
        },
        {
          type: 'memory',
          name: 'Memory Operations',
          permissions: allPermissions.filter((p) => p.type === 'memory'),
        },
        {
          type: 'global',
          name: 'Global Settings',
          permissions: allPermissions.filter((p) => p.type === 'global'),
        },
      ];

      setPermissionGroups(groups);
    } catch (error) {
      console.error('Failed to reset permissions:', error);
    }
  };

  const handleResetByType = (type: string) => {
    try {
      permissionService.resetPermissionsByType(type);
      // Reload permissions
      const allPermissions = permissionService.getAllPermissions();
      setPermissions(allPermissions);

      // Regroup permissions
      const groups: PermissionGroup[] = [
        {
          type: 'shell',
          name: 'Shell Commands',
          permissions: allPermissions.filter((p) => p.type === 'shell'),
        },
        {
          type: 'mcp',
          name: 'MCP Tools',
          permissions: allPermissions.filter((p) => p.type.startsWith('mcp_')),
        },
        {
          type: 'memory',
          name: 'Memory Operations',
          permissions: allPermissions.filter((p) => p.type === 'memory'),
        },
        {
          type: 'global',
          name: 'Global Settings',
          permissions: allPermissions.filter((p) => p.type === 'global'),
        },
      ];

      setPermissionGroups(groups);
    } catch (error) {
      console.error('Failed to reset permissions by type:', error);
    }
  };

  useKeypress(
    (key) => {
      const { name } = key;

      if (name === 'escape') {
        onClose();
      } else if (name === 'tab') {
        setFocusSection((prev) => (prev === 'groups' ? 'actions' : 'groups'));
      } else if (focusSection === 'groups') {
        if (name === 'up' || name === 'k') {
          setSelectedIndex((prev) => Math.max(0, prev - 1));
        } else if (name === 'down' || name === 'j') {
          setSelectedIndex((prev) =>
            Math.min(permissionGroups.length - 1, prev + 1),
          );
        } else if (name === 'r') {
          const selectedGroup = permissionGroups[selectedIndex];
          if (selectedGroup && selectedGroup.permissions.length > 0) {
            handleResetByType(
              selectedGroup.type === 'mcp' ? 'mcp' : selectedGroup.type,
            );
          }
        }
      } else if (focusSection === 'actions') {
        if (name === 'return' || name === 'space') {
          if (key.sequence === 'A') {
            handleResetAll();
          }
        }
      }
    },
    { isActive: true },
  );

  if (loading) {
    return (
      <Box
        borderStyle="round"
        borderColor={Colors.Gray}
        flexDirection="column"
        padding={1}
        width="100%"
        height="100%"
      >
        <Text bold color={Colors.AccentBlue}>
          Tool Permissions
        </Text>
        <Box height={1} />
        <Text>Loading permissions...</Text>
      </Box>
    );
  }

  const totalPermissions = permissions.length;

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      padding={1}
      width="100%"
      height="100%"
    >
      <Text bold color={Colors.AccentBlue}>
        Tool Permissions
      </Text>
      <Box height={1} />

      {totalPermissions === 0 ? (
        <Text color={Colors.Gray}>
          No &quot;Always Allow&quot; permissions are currently granted.
        </Text>
      ) : (
        <>
          <Text color={Colors.Gray}>
            Total granted permissions: {totalPermissions}
          </Text>
          <Box height={1} />

          {/* Permission Groups */}
          <Box flexDirection="column">
            <Text bold={focusSection === 'groups'} color={Colors.AccentGreen}>
              {focusSection === 'groups' ? '> ' : '  '}Permission Groups:
            </Text>
            {permissionGroups.map((group, index) => (
              <Box key={group.type} flexDirection="row" alignItems="center">
                <Box minWidth={2} flexShrink={0}>
                  <Text
                    color={
                      focusSection === 'groups' && selectedIndex === index
                        ? Colors.AccentGreen
                        : Colors.Gray
                    }
                  >
                    {focusSection === 'groups' && selectedIndex === index
                      ? '●'
                      : ''}
                  </Text>
                </Box>
                <Text
                  color={
                    focusSection === 'groups' && selectedIndex === index
                      ? Colors.AccentGreen
                      : Colors.Foreground
                  }
                >
                  {group.name} ({group.permissions.length})
                </Text>
              </Box>
            ))}
          </Box>

          <Box height={1} />

          {/* Selected Group Details */}
          {permissionGroups[selectedIndex] && (
            <Box flexDirection="column">
              <Text bold color={Colors.AccentCyan}>
                {permissionGroups[selectedIndex].name}:
              </Text>
              {permissionGroups[selectedIndex].permissions.length === 0 ? (
                <Text color={Colors.Gray}>No permissions granted.</Text>
              ) : (
                permissionGroups[selectedIndex].permissions.map(
                  (permission) => (
                    <Box
                      key={permission.id}
                      flexDirection="column"
                      marginLeft={2}
                    >
                      <Text color={Colors.Foreground}>{permission.name}</Text>
                      <Text color={Colors.Gray} wrap="wrap">
                        {permission.description}
                      </Text>
                      <Box height={1} />
                    </Box>
                  ),
                )
              )}
            </Box>
          )}
        </>
      )}

      <Box marginTop={1} flexDirection="column">
        <Text bold={focusSection === 'actions'} color={Colors.AccentYellow}>
          {focusSection === 'actions' ? '> ' : '  '}Actions:
        </Text>
        <Text color={Colors.Gray}>
          Press &apos;r&apos; to reset selected group permissions
        </Text>
        <Text color={Colors.Gray}>
          Press &apos;A&apos; to reset ALL permissions
        </Text>
      </Box>

      <Box height={1} />
      <Text color={Colors.Gray}>(Tab to change focus, Esc to close)</Text>
    </Box>
  );
}
