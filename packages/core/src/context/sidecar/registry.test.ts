/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import { SidecarRegistry } from './registry.js';
import type { ContextProcessorDef, ContextWorkerDef } from './registry.js';
import type { ContextProcessor, ContextWorker } from '../pipeline.js';

describe('SidecarRegistry', () => {
  it('should register and retrieve processors correctly', () => {
    const registry = new SidecarRegistry();
    const processorDef: ContextProcessorDef = {
      id: 'TestProcessor',
      schema: { type: 'object' },
      create: () => ({} as ContextProcessor),
    };

    registry.registerProcessor(processorDef);
    const retrieved = registry.getProcessor('TestProcessor');
    expect(retrieved).toBe(processorDef);
  });

  it('should register and retrieve workers correctly', () => {
    const registry = new SidecarRegistry();
    const workerDef: ContextWorkerDef = {
      id: 'TestWorker',
      schema: { type: 'object' },
      create: () => ({} as ContextWorker),
    };

    registry.registerWorker(workerDef);
    const retrieved = registry.getWorker('TestWorker');
    expect(retrieved).toBe(workerDef);
  });

  it('should throw an error when retrieving unregistered processors', () => {
    const registry = new SidecarRegistry();
    expect(() => registry.getProcessor('Unknown')).toThrow('Context Processor [Unknown] is not registered.');
  });

  it('should throw an error when retrieving unregistered workers', () => {
    const registry = new SidecarRegistry();
    expect(() => registry.getWorker('Unknown')).toThrow('Context Worker [Unknown] is not registered.');
  });

  it('should return combined schemas', () => {
    const registry = new SidecarRegistry();
    registry.registerProcessor({
      id: 'TestProcessor',
      schema: { title: 'processorSchema' },
      create: () => ({} as ContextProcessor),
    });
    registry.registerWorker({
      id: 'TestWorker',
      schema: { title: 'workerSchema' },
      create: () => ({} as ContextWorker),
    });

    const schemas = registry.getSchemas() as Array<{title?: string}>;
    expect(schemas.length).toBe(2);
    expect(schemas.find(s => s.title === 'processorSchema')).toBeDefined();
    expect(schemas.find(s => s.title === 'workerSchema')).toBeDefined();
  });

  it('should safely clear the registry', () => {
    const registry = new SidecarRegistry();
    registry.registerProcessor({ id: 'TestProcessor', schema: {}, create: () => ({} as ContextProcessor) });
    registry.registerWorker({ id: 'TestWorker', schema: {}, create: () => ({} as ContextWorker) });

    registry.clear();

    expect(() => registry.getProcessor('TestProcessor')).toThrow();
    expect(() => registry.getWorker('TestWorker')).toThrow();
  });
});
