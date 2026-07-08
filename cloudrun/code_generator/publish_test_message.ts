import { PubSub } from '@google-cloud/pubsub';
import * as fs from 'fs';
import * as path from 'path';

async function publishMessage(projectId: string, topicId: string, messageObject: object) {
  // Instantiates a client
  const pubsub = new PubSub({ projectId });

  // References the existing topic
  const topic = pubsub.topic(topicId);

  // Convert the JSON object to a string and then to a Buffer
  const dataBuffer = Buffer.from(JSON.stringify(messageObject));

  console.log(`Publishing spec to projects/${projectId}/topics/${topicId}...`);

  try {
    const messageId = await topic.publishMessage({ data: dataBuffer });
    console.log(`Message ${messageId} published.`);
  } catch (error) {
    console.error(`Received error while publishing: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}

const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.argv[2];

if (!projectId) {
  console.error('Error: Project ID not specified.');
  console.error('Please either:');
  console.error('  1. Set the GOOGLE_CLOUD_PROJECT environment variable.');
  console.error('  2. Pass the project ID as the first argument.');
  console.error('\nUsage: npm start <PROJECT_ID>');
  process.exit(1);
}

const topicId = 'issue-ready-for-code';

try {
  // Read and parse the example spec
  const specPath = path.join(__dirname, 'example_firestore.json');
  const specContent = fs.readFileSync(specPath, 'utf8');
  const specJson = JSON.parse(specContent);

  publishMessage(projectId, topicId, specJson);
} catch (error) {
  console.error(`Failed to read or parse example_spec.json: ${(error as Error).message}`);
  process.exit(1);
}
