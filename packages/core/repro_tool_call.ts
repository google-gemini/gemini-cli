
import { OpenAiContentGenerator } from './src/core/openAiContentGenerator.js';
import { LlmRole } from './src/telemetry/llmRole.js';

async function testToolCalling() {
  const generator = new OpenAiContentGenerator({
    baseUrl: 'http://49.247.174.129:8000/v1', // 사용자의 Gemma 4 서버 주소
    apiKey: 'dummy',
  });

  const request = {
    model: 'google/gemma-4-31B-it',
    contents: [
      {
        role: 'user',
        parts: [{ text: '현재 서울 날씨 어때?' }],
      },
    ],
    tools: [
      {
        functionDeclarations: [
          {
            name: 'get_weather',
            description: 'Get the current weather in a given location',
            parameters: {
              type: 'object',
              properties: {
                location: {
                  type: 'string',
                  description: 'The city and state, e.g. San Francisco, CA',
                },
              },
              required: ['location'],
            },
          },
        ],
      },
    ],
  };

  try {
    console.log('Sending request with tools...');
    const response = await generator.generateContent(request as any, 'test-id', LlmRole.USER);
    console.log('Response:', JSON.stringify(response, null, 2));
    
    const parts = response.candidates?.[0]?.content?.parts || [];
    const hasFunctionCall = parts.some(p => 'functionCall' in p);
    
    if (hasFunctionCall) {
      console.log('✅ Success: Function call detected!');
    } else {
      console.log('❌ Failure: No function call detected. Model just replied with text.');
    }
  } catch (error) {
    console.error('❌ Error during request:', error);
  }
}

testToolCalling();
