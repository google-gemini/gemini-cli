import * as fs from 'fs';

export interface HeapSnapshot {
  snapshot: {
    meta: any;
    node_count: number;
    edge_count: number;
  };
  nodes: number[];
  edges: number[];
  strings: string[];
}

export interface HeapStats {
  nodeCount: number;
  edgeCount: number;
  stringsCount: number;
  fileSize: string;
  totalSizeBytes: number;
}

export interface LargeObject {
  type: string;
  name: string;
  size: number;
}

export class HeapAnalyzer {
  static parseSnapshot(filePath: string): HeapSnapshot {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  }

  static getStats(snapshot: HeapSnapshot): HeapStats {
    const nodeCount = snapshot.snapshot.node_count;
    const edgeCount = snapshot.snapshot.edge_count;
    const stringsCount = snapshot.strings.length;
    
    const nodeFieldCount = snapshot.snapshot.meta.node_fields.length;
    const nodeSelfSizeField = snapshot.snapshot.meta.node_fields.indexOf('self_size');
    let totalSizeBytes = 0;
    
    for (let i = 0; i < nodeCount; i++) {
      const offset = i * nodeFieldCount;
      const size = snapshot.nodes[offset + nodeSelfSizeField] || 0;
      totalSizeBytes += size;
    }

    return {
      nodeCount,
      edgeCount,
      stringsCount,
      fileSize: (JSON.stringify(snapshot).length / 1024).toFixed(2) + ' KB',
      totalSizeBytes
    };
  }

  static findLargeObjects(snapshot: HeapSnapshot, limit: number = 10): LargeObject[] {
    const nodes = snapshot.nodes;
    const strings = snapshot.strings;
    const nodeFieldCount = snapshot.snapshot.meta.node_fields.length;
    const nodeTypeField = snapshot.snapshot.meta.node_fields.indexOf('type');
    const nodeNameField = snapshot.snapshot.meta.node_fields.indexOf('name');
    const nodeSelfSizeField = snapshot.snapshot.meta.node_fields.indexOf('self_size');

    const objects: LargeObject[] = [];

    for (let i = 0; i < snapshot.snapshot.node_count; i++) {
      const offset = i * nodeFieldCount;
      const typeIndex = nodes[offset + nodeTypeField];
      const nameIndex = nodes[offset + nodeNameField];
      const size = nodes[offset + nodeSelfSizeField] || 0;

      if (size > 0) {
        objects.push({
          type: snapshot.snapshot.meta.node_types[0][typeIndex] || 'unknown',
          name: strings[nameIndex] || '',
          size: size
        });
      }
    }

    objects.sort((a, b) => b.size - a.size);
    return objects.slice(0, limit);
  }

  static compareSnapshots(snapshot1: HeapSnapshot, snapshot2: HeapSnapshot) {
    const stats1 = this.getStats(snapshot1);
    const stats2 = this.getStats(snapshot2);
    const largeObjects1 = this.findLargeObjects(snapshot1, 5);
    const largeObjects2 = this.findLargeObjects(snapshot2, 5);

    return {
      nodeGrowth: stats2.nodeCount - stats1.nodeCount,
      sizeGrowthBytes: stats2.totalSizeBytes - stats1.totalSizeBytes,
      sizeGrowth: ((stats2.totalSizeBytes - stats1.totalSizeBytes) / 1024).toFixed(2) + ' KB',
      percentageGrowth: ((stats2.totalSizeBytes - stats1.totalSizeBytes) / stats1.totalSizeBytes * 100).toFixed(2) + '%',
      before: {
        nodeCount: stats1.nodeCount,
        totalSize: (stats1.totalSizeBytes / 1024).toFixed(2) + ' KB',
        largestObjects: largeObjects1
      },
      after: {
        nodeCount: stats2.nodeCount,
        totalSize: (stats2.totalSizeBytes / 1024).toFixed(2) + ' KB',
        largestObjects: largeObjects2
      }
    };
  }

  static exportToPerfetto(snapshot: HeapSnapshot, outputPath: string) {
    const stats = this.getStats(snapshot);
    const largeObjects = this.findLargeObjects(snapshot, 10);

    const perfettoTrace = {
      traceEvents: [
        {
          name: 'heap_snapshot_analysis',
          ph: 'i',
          ts: 0,
          pid: 1,
          tid: 1,
          args: {
            node_count: stats.nodeCount,
            edge_count: stats.edgeCount,
            strings_count: stats.stringsCount,
            total_heap_size_kb: (stats.totalSizeBytes / 1024).toFixed(2),
            file_size_kb: stats.fileSize,
            largest_objects: largeObjects.map(obj => ({
              type: obj.type,
              name: obj.name,
              size_bytes: obj.size,
              size_kb: (obj.size / 1024).toFixed(2)
            }))
          }
        }
      ],
      metadata: {
        analyzer_version: '1.0.0',
        snapshot_timestamp: new Date().toISOString()
      }
    };

    fs.writeFileSync(outputPath, JSON.stringify(perfettoTrace, null, 2));
  }

  static findPotentialLeaks(snapshots: HeapSnapshot[]) {
    if (snapshots.length < 2) {
      return { error: 'Need at least 2 snapshots for comparison' };
    }

    const growingObjects: Record<string, number[]> = {};
    
    for (let i = 0; i < snapshots.length; i++) {
      const objects = this.findLargeObjects(snapshots[i], 20);
      objects.forEach(obj => {
        const key = `${obj.type}:${obj.name}`;
        if (!growingObjects[key]) {
          growingObjects[key] = [];
        }
        growingObjects[key].push(obj.size);
      });
    }

    const potentialLeaks = Object.entries(growingObjects)
      .filter(([_, sizes]) => sizes.length === snapshots.length && 
        sizes.every((s, i) => i === 0 || s > sizes[i-1]))
      .map(([name, sizes]) => ({
        name,
        growth: `${((sizes[sizes.length-1] - sizes[0]) / 1024).toFixed(2)} KB`,
        sizes: sizes.map(s => (s / 1024).toFixed(2) + ' KB')
      }));

    return {
      potentialLeaks,
      summary: {
        totalSnapshots: snapshots.length,
        hasLeaks: potentialLeaks.length > 0,
        leakCount: potentialLeaks.length
      }
    };
  }
}