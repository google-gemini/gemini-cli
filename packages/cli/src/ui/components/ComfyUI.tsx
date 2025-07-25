import React, { useState, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { useDrag } from '../hooks/useDrag.js';
import { NODES } from './nodes.js';
import Line from './Line.js';

const DraggableNode = ({ node, onConnect }) => {
  const ref = useRef(null);
  const { isDragging, position, onMouseDown, onMouseUp } = useDrag(ref);

  return (
    <Box
      ref={ref}
      borderStyle="round"
      borderColor={isDragging ? 'cyan' : 'white'}
      paddingX={1}
      position="absolute"
      left={position.x}
      top={position.y}
    >
      <Text>
        <Text
          onPress={() => {
            onMouseDown();
          }}
        >
          {isDragging ? 'DRAGGING' : node.name}
        </Text>
        <Text
          onPress={() => {
            onMouseUp();
          }}
        >
          {isDragging ? ' (release)' : ''}
        </Text>
        <Text onPress={() => onConnect(node)}> | Connect</Text>
      </Text>
    </Box>
  );
};

const Sidebar = ({ onNodeSelect }) => {
  const [selectedNodeIndex, setSelectedNodeIndex] = useState(0);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedNodeIndex((prev) => Math.max(0, prev - 1));
    }
    if (key.downArrow) {
      setSelectedNodeIndex((prev) => Math.min(NODES.length - 1, prev + 1));
    }
    if (key.return) {
      onNodeSelect(NODES[selectedNodeIndex]);
    }
  });

  return (
    <Box borderStyle="round" padding={1} width="20%" flexDirection="column">
      <Text>Nodes</Text>
      {NODES.map((node, index) => (
        <Box
          key={node.id}
          borderStyle={selectedNodeIndex === index ? 'double' : 'single'}
          paddingX={1}
        >
          <Text>{node.name}</Text>
        </Box>
      ))}
    </Box>
  );
};

const Content = ({ nodes, onRun, onConnect, connections }) => {
  const nodesRef = useRef({});

  return (
    <Box borderStyle="round" padding={1} flexGrow={1} position="relative">
      <Text>Workflow</Text>
      {nodes.map((node) => (
        <Box key={node.id} ref={(el) => (nodesRef.current[node.id] = el)}>
          <DraggableNode node={node} onConnect={onConnect} />
        </Box>
      ))}
      {connections.map((connection, index) => {
        const fromEl = nodesRef.current[connection.from];
        const toEl = nodesRef.current[connection.to];

        if (!fromEl || !toEl) {
          return null;
        }

        return (
          <Line
            key={index}
            x1={fromEl.x + Math.floor(fromEl.width / 2)}
            y1={fromEl.y + Math.floor(fromEl.height / 2)}
            x2={toEl.x + Math.floor(toEl.width / 2)}
            y2={toEl.y + Math.floor(toEl.height / 2)}
          />
        );
      })}
      <Box position="absolute" bottom={1} right={1}>
        <Text onPress={onRun}>Run</Text>
      </Box>
    </Box>
  );
};

const ComfyUI = () => {
  const [workflowNodes, setWorkflowNodes] = useState([]);
  const [connections, setConnections] = useState([]);
  const [connectingNode, setConnectingNode] = useState(null);

  const handleNodeSelect = (node) => {
    setWorkflowNodes([...workflowNodes, { ...node, id: `${node.id}-${new Date().getTime()}` }]);
  };

  const handleConnect = (node) => {
    if (connectingNode) {
      setConnections([...connections, { from: connectingNode.id, to: node.id }]);
      setConnectingNode(null);
    } else {
      setConnectingNode(node);
    }
  };

  const handleRun = () => {
    const executedNodes = new Set();
    const executionOrder = [];

    const executeNode = (nodeId) => {
      if (executedNodes.has(nodeId)) {
        return;
      }

      const node = workflowNodes.find((n) => n.id === nodeId);
      if (!node) {
        return;
      }

      const dependencies = connections
        .filter((c) => c.to === nodeId)
        .map((c) => c.from);

      for (const depId of dependencies) {
        executeNode(depId);
      }

      executionOrder.push(node.name);
      executedNodes.add(nodeId);
    };

    const outputNodes = workflowNodes.filter(
      (node) => !connections.some((c) => c.from === node.id)
    );

    for (const node of outputNodes) {
      executeNode(node.id);
    }

    console.log('Execution Order:', executionOrder);
  };

  return (
    <Box width="100%" height="100%" flexDirection="row">
      <Sidebar onNodeSelect={handleNodeSelect} />
      <Content
        nodes={workflowNodes}
        onRun={handleRun}
        onConnect={handleConnect}
        connections={connections}
      />
    </Box>
  );
};

export default ComfyUI;
