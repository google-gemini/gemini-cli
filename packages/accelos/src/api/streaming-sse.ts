/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Server-Sent Events endpoint for real-time streaming workflow visualization
 * This provides real-time streaming to web clients showing Claude Code progress
 */

export function createStreamingSSEHandler() {
  return async (c: any) => {
    // Get mastra instance from Hono context
    const mastra = c.get('mastra');
    // Set up Server-Sent Events headers
    c.header('Content-Type', 'text/event-stream');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Access-Control-Allow-Headers', 'Cache-Control');

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    // Helper function to send formatted SSE events
    const sendSSE = (data: any) => {
      writer.write(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
    };

    // Process streaming in background and close writer when done
    (async () => {
      // Send initial connection confirmation
      sendSSE({
        type: 'connection',
        timestamp: Date.now(),
        message: 'Connected to streaming workflow endpoint'
      });

      try {
      // Get the streaming workflow
      const workflow = mastra.getWorkflow('review-to-pr-streaming-workflow');
      if (!workflow) {
        sendSSE({
          type: 'error',
          timestamp: Date.now(),
          message: 'Streaming workflow not found',
          availableWorkflows: Object.keys(mastra.getWorkflows?.() || {})
        });
        await writer.close();
        return;
      }

      sendSSE({
        type: 'workflow-found',
        timestamp: Date.now(),
        message: 'Starting streaming workflow execution',
        workflowName: 'review-to-pr-streaming-workflow'
      });

      // Create workflow run
      const run = await workflow.createRunAsync();
      
      // Start streaming workflow
      const stream = await run.streamVNext({
        inputData: {
          reviewAssessmentId: 'sse-streaming-test-' + Date.now(),
          dryRun: true,
          autoCommit: false,
          createPR: false
        }
      });

      let eventCount = 0;
      let claudeCodeEvents = 0;

      // Process and forward all streaming events
      for await (const chunk of stream) {
        eventCount++;
        
        // Count Claude Code specific events
        if (chunk.type === 'claude-code-progress') {
          claudeCodeEvents++;
        }

        // Forward the event with SSE formatting
        sendSSE({
          type: 'workflow-event',
          timestamp: Date.now(),
          eventCount,
          claudeCodeEvents,
          originalEvent: chunk
        });

        // Send periodic heartbeat for long-running operations
        if (eventCount % 10 === 0) {
          sendSSE({
            type: 'heartbeat',
            timestamp: Date.now(),
            eventCount,
            claudeCodeEvents
          });
        }
      }

      // Get final results
      const result = await stream.result;
      const status = await stream.status;
      const usage = await stream.usage;

      // Send completion event
      sendSSE({
        type: 'workflow-complete',
        timestamp: Date.now(),
        summary: {
          totalEvents: eventCount,
          claudeCodeEvents: claudeCodeEvents,
          finalStatus: status,
          workflowSuccess: result?.success || false,
          executionTime: result?.summary?.totalExecutionTime || 'N/A',
          streamingEventsEmitted: result?.summary?.streamingEventsEmitted || 'N/A',
          tokenUsage: usage?.totalTokens || 0
        }
      });

      } catch (error) {
        sendSSE({
          type: 'error',
          timestamp: Date.now(),
          message: error instanceof Error ? error.message : String(error),
          error: {
            isStreamingError: error instanceof Error && error.message.includes('WritableStream'),
            details: error instanceof Error ? error.stack : undefined
          }
        });
      } finally {
        // Send final event and close connection
        sendSSE({
          type: 'connection-close',
          timestamp: Date.now(),
          message: 'Streaming session ended'
        });
        
        await writer.close();
      }
    })().catch(async (error) => {
      // Handle any unexpected errors in the async process
      try {
        sendSSE({
          type: 'error',
          timestamp: Date.now(),
          message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`
        });
        await writer.close();
      } catch (closeError) {
        // Writer might already be closed
        console.error('Failed to close writer:', closeError);
      }
    });
    
    return new Response(readable);
  };
}