/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Fix for Node.js environment - ImageData is not available
if (typeof globalThis.ImageData === 'undefined') {
  class MockImageData {
    data: any;
    width: number;
    height: number;
    
    constructor(data: any, width: number, height: number) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  }
  globalThis.ImageData = MockImageData as any;
}

interface HyphaConnectOptions {
  serverUrl: string;
  workspace: string;
  token: string;
  serviceId: string;
}

export async function connectToHyphaService(options: HyphaConnectOptions, query: string): Promise<void> {
  try {
    console.log(`Connecting to Hypha server at ${options.serverUrl}...`);
    
    // Dynamic import for hypha-rpc
    const hyphaRpc = await import('hypha-rpc');
    const { hyphaWebsocketClient } = hyphaRpc.default;
    
    // Connect to Hypha server
    const server = await hyphaWebsocketClient.connectToServer({
      server_url: options.serverUrl,
      workspace: options.workspace,
      token: options.token
    });

    console.log(`Connected to workspace: ${server.config.workspace}`);

    // Find the Gemini service by iterating through available services
    const serviceFullId = `${server.config.workspace}/${options.serviceId}`;
    console.log(`Looking for service: ${serviceFullId}`);
    
    let service = null;
    try {
      // First try to find a service by iterating through available services
      const services = await server.listServices();
      for (const svc of services) {
        if (svc.id.includes(options.serviceId) && svc.id.includes('gemini-agent')) {
          service = await server.getService(svc.id);
          console.log(`Found service: ${service.id}`);
          break;
        }
      }
      
      if (!service) {
        console.error(`No ${options.serviceId} service found in available services`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`Failed to find service: ${error}`);
      process.exit(1);
    }

    console.log(`\nProcessing query: ${query}\n`);

    // Call the chat service
    const responseGenerator = await service.chat(query);
    
    // Process streaming responses
    for await (const response of responseGenerator) {
      if (typeof response === 'object' && response !== null) {
        const responseType = response.type || 'unknown';
        const content = response.content || '';
        
        if (responseType === 'status') {
          // Print status messages in a different color/format
          console.log(`\x1b[36m[STATUS]\x1b[0m ${content}`);
        } else if (responseType === 'text') {
          // Print text content directly
          process.stdout.write(content);
        } else if (responseType === 'error') {
          // Print errors in red
          console.error(`\x1b[31m[ERROR]\x1b[0m ${content}`);
        } else if (responseType === 'final') {
          // Final response indicates completion
          console.log(`\n\x1b[32m[COMPLETED]\x1b[0m Query processed successfully`);
          break;
        }
      } else {
        console.log(response);
      }
    }
    
  } catch (error) {
    console.error(`Failed to connect to Hypha service: ${error}`);
    process.exit(1);
  }
}