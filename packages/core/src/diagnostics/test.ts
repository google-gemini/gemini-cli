import { HeapAnalyzer } from './heapAnalyzer.js';
import * as fs from 'fs';

async function test() {
  console.log('🔬 Memory Analysis Test Suite\n');

  if (!fs.existsSync('test.heapsnapshot')) {
    console.log('❌ No test.heapsnapshot found');
    console.log('   Generate one with: node --heapsnapshot test.heapsnapshot');
    console.log('   Then run: npm run test:memory');
    return;
  }

  console.log('📖 Parsing test.heapsnapshot...');
  const snapshot = HeapAnalyzer.parseSnapshot('test.heapsnapshot');

  console.log('\n📊 Heap Statistics:');
  const stats = HeapAnalyzer.getStats(snapshot);
  console.log(`   Nodes: ${stats.nodeCount.toLocaleString()}`);
  console.log(`   Edges: ${stats.edgeCount.toLocaleString()}`);
  console.log(`   Strings: ${stats.stringsCount.toLocaleString()}`);
  console.log(`   Total Heap: ${(stats.totalSizeBytes / 1024 / 1024).toFixed(2)} MB`);

  console.log('\n🔍 Top 10 Largest Objects:');
  const largeObjects = HeapAnalyzer.findLargeObjects(snapshot, 10);
  largeObjects.forEach((obj, i) => {
    console.log(`   ${i+1}. ${obj.type} "${obj.name.substring(0, 60)}" - ${(obj.size / 1024).toFixed(2)} KB`);
  });

  console.log('\n📤 Exporting to Perfetto format...');
  HeapAnalyzer.exportToPerfetto(snapshot, 'test.perfetto.json');
  console.log('   ✅ Saved to test.perfetto.json');
  console.log('   📍 View at: https://ui.perfetto.dev');

  console.log('\n✅ Test complete!');
}

test().catch(console.error);