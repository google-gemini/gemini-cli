// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { Firestore, Timestamp } from '@google-cloud/firestore';
import { PubSub } from '@google-cloud/pubsub';
import * as fs from 'fs';
import * as path from 'path';

interface IssueDocument {
  firestore_id?: string;
  github_metadata?: {
    owner?: string;
    repo?: string;
    issue_number?: number | string;
  };
  created_at?: any;
  updated_at?: any;
  [key: string]: any;
}

function getJsonFiles(targetPath: string): string[] {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Target path does not exist: ${targetPath}`);
  }

  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    return [targetPath];
  }

  if (stat.isDirectory()) {
    const files = fs.readdirSync(targetPath);
    return files
      .filter((file) => file.endsWith('.json') && !file.includes('package') && !file.includes('tsconfig'))
      .map((file) => path.join(targetPath, file));
  }

  return [];
}

function resolveDocumentId(data: IssueDocument): string {
  if (data.firestore_id) {
    return data.firestore_id;
  }

  const meta = data.github_metadata;
  if (meta?.owner && meta?.repo && meta?.issue_number !== undefined) {
    return `github_${meta.owner}_${meta.repo}_${meta.issue_number}`;
  }

  throw new Error('Could not resolve document ID: missing firestore_id and github_metadata.');
}

async function syncToFirestore(
  firestore: Firestore,
  collectionName: string,
  docId: string,
  data: IssueDocument
): Promise<void> {
  const docRef = firestore.collection(collectionName).doc(docId);
  const docSnapshot = await docRef.get();

  const docData = { ...data };

  // Convert date strings to Firestore Timestamps if necessary
  if (typeof docData.created_at === 'string') {
    try {
      docData.created_at = Timestamp.fromDate(new Date(docData.created_at));
    } catch {
      docData.created_at = Timestamp.now();
    }
  } else if (!docData.created_at) {
    docData.created_at = Timestamp.now();
  }

  if (typeof docData.updated_at === 'string') {
    try {
      docData.updated_at = Timestamp.fromDate(new Date(docData.updated_at));
    } catch {
      docData.updated_at = Timestamp.now();
    }
  } else if (!docData.updated_at) {
    docData.updated_at = Timestamp.now();
  }

  if (!docSnapshot.exists) {
    console.log(`[Firestore] Document '${docId}' not found. Adding new document...`);
    await docRef.set(docData);
    console.log(`[Firestore] ✅ Document '${docId}' created successfully.`);
  } else {
    console.log(`[Firestore] Document '${docId}' already exists. Updating to match local file...`);
    await docRef.set(docData);
    console.log(`[Firestore] 🔄 Document '${docId}' updated successfully.`);
  }
}

async function publishToPubSub(
  pubsub: PubSub,
  topicId: string,
  docId: string,
  data: IssueDocument
): Promise<void> {
  const topic = pubsub.topic(topicId);
  const dataBuffer = Buffer.from(JSON.stringify(data));

  console.log(`[Pub/Sub] Publishing document '${docId}' to topic '${topicId}'...`);
  const messageId = await topic.publishMessage({ data: dataBuffer });
  console.log(`[Pub/Sub] 🚀 Message ${messageId} published successfully.`);
}

async function main() {
  const projectId =
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.PROJECT_ID ||
    process.argv[2] ||
    'gcli-intern-project-2026';

  const databaseId = process.env.FIRESTORE_DATABASE || 'test-gcli-db-clone';
  const collectionName = process.env.FIRESTORE_COLLECTION || 'test_issues';
  const topicId = process.env.PUBSUB_TOPIC || 'issue-ready-for-code';

  const inputPath =
    process.argv[3] ||
    process.env.TARGET_PATH ||
    path.join(__dirname, 'example_firestore.json');

  console.log('=======================================================');
  console.log(' Firestore & Pub/Sub Document Synchronizer');
  console.log(` Project:    ${projectId}`);
  console.log(` Database:   ${databaseId}`);
  console.log(` Collection: ${collectionName}`);
  console.log(` Topic:      ${topicId}`);
  console.log(` Target:     ${inputPath}`);
  console.log('=======================================================\n');

  const jsonFiles = getJsonFiles(inputPath);
  if (jsonFiles.length === 0) {
    console.warn(`No JSON files found at target path: ${inputPath}`);
    return;
  }

  const firestore = new Firestore({
    projectId,
    databaseId,
  });

  const pubsub = new PubSub({
    projectId,
  });

  for (const filePath of jsonFiles) {
    console.log(`\nProcessing file: ${filePath}`);
    try {
      const rawContent = fs.readFileSync(filePath, 'utf-8');
      const data: IssueDocument = JSON.parse(rawContent);

      const docId = resolveDocumentId(data);
      console.log(`Resolved Document ID: ${docId}`);

      // 1. Sync / Upsert to Firestore
      await syncToFirestore(firestore, collectionName, docId, data);

      // 2. Publish to Pub/Sub
      await publishToPubSub(pubsub, topicId, docId, data);
    } catch (err) {
      console.error(`❌ Error processing ${filePath}:`, (err as Error).message);
      process.exitCode = 1;
    }
  }

  console.log('\nAll operations completed.');
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
