// Test script to verify httpOptions with Viasat API
import { GoogleGenAI } from '@google/genai';

const googleGenAI = new GoogleGenAI({
  vertexai: true,
  project: 'viasat-ops-ml-engineering-prod',
  location: 'global',
  httpOptions: {
    baseUrl: 'https://api.viasat.com/v1/llms/vertexai/',
    headers: {
      'X-Goog-Api-Key': '4QUKLD1DhNTb83U6imi0h2PZsYJUtFkMUC4ayStcJvDASigR',
      'user_email': 'peter.lepeska@viasat.com'
    }
  }
});

async function test() {
  try {
    console.log('Testing Viasat API with custom httpOptions...');
    const response = await googleGenAI.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: [{
        role: 'user',
        parts: [{ text: 'Say "Hello from direct API test!"' }]
      }]
    });

    console.log('Success! Response:', response.candidates[0].content.parts[0].text);
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Full error:', JSON.stringify(error, null, 2));
  }
}

test();
