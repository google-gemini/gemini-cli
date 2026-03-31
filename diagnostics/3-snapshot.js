import fs from 'fs';
import CDP from 'chrome-remote-interface';

async function takeSnapshot(client, filename) {
  return new Promise(async (resolve, reject) => {
    const stream = fs.createWriteStream(filename);
    
    // Listen for the chunks of the snapshot
    const chunkListener = client.HeapProfiler.addHeapSnapshotChunk(({ chunk }) => {
      stream.write(chunk);
    });

    try {
      // takeHeapSnapshot Promise formally resolves ONLY after all chunks are sent
      await client.HeapProfiler.takeHeapSnapshot({ reportProgress: false });
      
      // Explicitly flush and close the write stream
      stream.end(() => {
        // Cleanup the listener so we don't leak memory on consecutive snapshots
        chunkListener(); // chrome-remote-interface returns an unsubscriber function
        resolve(filename);
      });
    } catch (err) {
      stream.end();
      reject(err);
    }
  });
}

async function run() {
  console.log("Starting Phase 1: Native Chrome DevTools Protocol (CDP) Memory Extraction...");
  let client;
  try {
    client = await CDP({ host: '127.0.0.1', port: 9229 });
    const { HeapProfiler } = client;
    await HeapProfiler.enable();

    console.log('[Native] Taking Steady State Snapshot (1)...');
    await takeSnapshot(client, 'snapshot1.heapsnapshot');

    console.log('[Native] Simulating application event cycle for 3 seconds...');
    await new Promise(r => setTimeout(r, 3000));

    console.log('[Native] Taking Action Snapshot (2)...');
    await takeSnapshot(client, 'snapshot2.heapsnapshot');

    console.log('[Native] Triggering Native V8 Garbage Collection...');
    await HeapProfiler.collectGarbage();

    console.log('[Native] Taking Post-GC Snapshot (3)...');
    await takeSnapshot(client, 'snapshot3.heapsnapshot');

    console.log('Finished taking 3 genuine heapsnapshots from V8.');
  } catch (err) {
    console.error(`\n[FATAL ERROR Phase 1]: Could not connect to the V8 Inspector on port 9229.`);
    console.error(`Please make sure you started your target application with the '--inspect=9229' flag.`);
    console.error(`Example: node --inspect=9229 index.js\n`);
    throw err;
  } finally {
    if (client) {
      await client.close();
    }
  }
}

run();
