#!/usr/bin/env python3

"""
Test client for Gemini Hypha Service

This script connects to the Hypha server and tests the Gemini agent service
by sending queries and processing the streaming responses.
"""

import asyncio
import sys
from hypha_rpc import connect_to_server

# Configuration
HYPHA_SERVER_URL = 'https://hypha.aicell.io'
WORKSPACE = 'ws-user-github|478667'
TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2FtdW4uYWkvIiwic3ViIjoic3BhcmtseS1waHJhc2UtNzA2ODE3ODYiLCJhdWQiOiJodHRwczovL2FtdW4tYWkuZXUuYXV0aDAuY29tL2FwaS92Mi8iLCJpYXQiOjE3NTE1MTgwNDYsImV4cCI6MTc4NzUxODA0Niwic2NvcGUiOiJ3czp3cy11c2VyLWdpdGh1Ynw0Nzg2Njcjcncgd2lkOndzLXVzZXItZ2l0aHVifDQ3ODY2NyIsImd0eSI6ImNsaWVudC1jcmVkZW50aWFscyIsImh0dHBzOi8vYW11bi5haS9yb2xlcyI6WyJhZG1pbiJdLCJodHRwczovL2FtdW4uYWkvZW1haWwiOiJvZXdheTAwN0BnbWFpbC5jb20ifQ.rwAm1tkBGuNOuvV2OJ-6VtUVuTgMCqUNnxdJkI-q4Tw'
SERVICE_ID = 'gemini-agent'

async def test_gemini_service():
    """Test the Gemini service by sending queries and processing responses."""
    
    print("Connecting to Hypha server...")
    try:
        # Connect to Hypha server
        server = await connect_to_server({
            'server_url': HYPHA_SERVER_URL,
            'workspace': WORKSPACE,
            'token': TOKEN
        })
        
        print(f"Connected to workspace: {server.config.workspace}")
        
        # Get the Gemini service
        service_full_id = f"{server.config.workspace}/{SERVICE_ID}"
        print(f"Looking for service: {service_full_id}")
        
        # Try to get the service
        try:
            service = await server.get_service(service_full_id)
            print(f"Found service: {service.id}")
        except Exception as e:
            print(f"Failed to find service {service_full_id}: {e}")
            print("Available services:")
            try:
                services = await server.list_services()
                for svc in services:
                    print(f"  - {svc}")
            except Exception as list_error:
                print(f"Could not list services: {list_error}")
            return
        
        # Test queries
        test_queries = [
            "What is the weather like today?",
            "Help me write a Python function to calculate fibonacci numbers",
            "Explain how machine learning works in simple terms"
        ]
        
        for i, query in enumerate(test_queries, 1):
            print(f"\n{'='*50}")
            print(f"Test {i}: {query}")
            print(f"{'='*50}")
            
            try:
                # Call the chat service
                response_generator = await service.chat(query)
                
                # Process streaming responses
                async for response in response_generator:
                    if isinstance(response, dict):
                        response_type = response.get('type', 'unknown')
                        content = response.get('content', '')
                        timestamp = response.get('timestamp', '')
                        
                        if response_type == 'status':
                            print(f"[STATUS] {content}")
                        elif response_type == 'text':
                            print(content, end='', flush=True)
                        elif response_type == 'error':
                            print(f"\n[ERROR] {content}")
                        elif response_type == 'final':
                            print(f"\n[FINAL] Response complete")
                    else:
                        print(f"[RESPONSE] {response}")
                        
            except Exception as e:
                print(f"Error during query {i}: {e}")
                import traceback
                traceback.print_exc()
            
            print("\n" + "-"*50)
        
        print("\nAll tests completed!")
        
    except Exception as e:
        print(f"Failed to connect to Hypha server: {e}")
        import traceback
        traceback.print_exc()

async def simple_test():
    """Simple test to verify basic connectivity."""
    
    print("Testing basic connectivity...")
    try:
        # Connect to Hypha server
        server = await connect_to_server({
            'server_url': HYPHA_SERVER_URL,
            'workspace': WORKSPACE,
            'token': TOKEN
        })
        
        print(f"✓ Connected to workspace: {server.config.workspace}")
        
        # List services
        try:
            services = await server.list_services()
            print(f"✓ Found {len(services)} services:")
            for service in services:
                print(f"  - {service}")
        except Exception as e:
            print(f"✗ Could not list services: {e}")
        
        # Try to get our specific service
        service_full_id = f"{server.config.workspace}/{SERVICE_ID}"
        try:
            service = await server.get_service(service_full_id)
            print(f"✓ Found Gemini service: {service.id}")
            
            # Test a simple query
            print("\nTesting with simple query...")
            response_generator = await service.chat("Hello, how are you?")
            
            async for response in response_generator:
                if isinstance(response, dict):
                    response_type = response.get('type', 'unknown')
                    content = response.get('content', '')
                    
                    if response_type == 'status':
                        print(f"[STATUS] {content}")
                    elif response_type == 'text':
                        print(content, end='', flush=True)
                    elif response_type == 'final':
                        print(f"\n✓ Query completed successfully")
                        break
                    elif response_type == 'error':
                        print(f"\n✗ Error: {content}")
                        break
                        
        except Exception as e:
            print(f"✗ Could not access Gemini service: {e}")
            
    except Exception as e:
        print(f"✗ Connection failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "simple":
        asyncio.run(simple_test())
    else:
        asyncio.run(test_gemini_service())