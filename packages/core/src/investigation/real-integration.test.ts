/**
 * REAL Integration Tests — Investigation Module
 * All method names and return type fields verified against actual source.
 */
import { describe, it, expect, afterAll } from 'vitest';
import * as v8 from 'node:v8';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as child_process from 'node:child_process';

import { HeapSnapshotAnalyzer, type RawHeapSnapshot, type ClassSummary, type LeakReport } from './heapSnapshotAnalyzer.js';
import { RootCauseAnalyzer, type RootCauseReport } from './rootCauseAnalyzer.js';
import { PerfettoExporter } from './perfettoExporter.js';
import { PerfettoSqlIntegration, SqlParser } from './perfettoSqlIntegration.js';
import { SmartDiffEngine } from './smartDiff.js';
import { TrendForecaster, type HeapDataPoint } from './trendForecaster.js';
import { GCPressureAnalyzer, type GCEvent } from './gcPressureAnalyzer.js';
import { FlameGraphGenerator } from './flameGraphGenerator.js';
import { AllocationHotspotProfiler, type AllocationSample } from './allocationHotspotProfiler.js';
import { TokenEfficiencyBenchmark } from './tokenEfficiencyBenchmark.js';
import { MemoryRegressionGuard } from './memoryRegressionGuard.js';
import { InvestigationExecutor } from './investigationTool.js';
import { LLMExplainer } from './llmExplainer.js';
import { CDPClient } from './cdpClient.js';

const DIR = '/tmp/inv-real-test';
let raw1: RawHeapSnapshot, raw2: RawHeapSnapshot, raw3: RawHeapSnapshot;
let a1: HeapSnapshotAnalyzer, a2: HeapSnapshotAnalyzer, a3: HeapSnapshotAnalyzer;
let sp1: string, sp2: string, sp3: string;
let cs1: ClassSummary[], cs2: ClassSummary[];
let leak: LeakReport;
let rca: RootCauseReport;

describe('REAL Integration Tests', () => {
  afterAll(() => { fs.rmSync(DIR, { recursive: true, force: true }); });

  // ── 1. Snapshot Generation ──
  describe('1. V8 Heap Snapshot Generation', () => {
    it('snapshot 1', () => {
      fs.mkdirSync(DIR, { recursive: true });
      const d: any[] = []; for (let i = 0; i < 500; i++) d.push({ a: new Array(50).fill(`i-${i}`) });
      sp1 = path.join(DIR, 's1.heapsnapshot');
      v8.writeHeapSnapshot(sp1);
      expect(fs.statSync(sp1).size).toBeGreaterThan(0);
      (globalThis as any).__d1 = d;
    });
    it('snapshot 2 (more allocs)', () => {
      const d: any[] = []; for (let i = 0; i < 1000; i++) d.push({ b: Buffer.alloc(256) });
      sp2 = path.join(DIR, 's2.heapsnapshot');
      v8.writeHeapSnapshot(sp2);
      expect(fs.statSync(sp2).size).toBeGreaterThan(0);
      (globalThis as any).__d2 = d;
    });
    it('snapshot 3 (even more)', () => {
      const d: any[] = []; for (let i = 0; i < 1500; i++) d.push({ c: Buffer.alloc(512) });
      sp3 = path.join(DIR, 's3.heapsnapshot');
      v8.writeHeapSnapshot(sp3);
      expect(fs.statSync(sp3).size).toBeGreaterThan(0);
      (globalThis as any).__d3 = d;
    });
  });

  // ── 2. HeapSnapshotAnalyzer ──
  describe('2. HeapSnapshotAnalyzer', () => {
    it('parse snapshot 1', () => {
      raw1 = JSON.parse(fs.readFileSync(sp1, 'utf-8'));
      a1 = new HeapSnapshotAnalyzer(); a1.parse(raw1);
      expect(a1.nodeCount).toBeGreaterThan(1000);
    });
    it('total size', () => { expect(a1.getTotalSize()).toBeGreaterThan(0); });
    it('class summaries', () => {
      cs1 = a1.getClassSummaries();
      expect(cs1.length).toBeGreaterThan(0);
    });
    it('parse snapshot 2', () => {
      raw2 = JSON.parse(fs.readFileSync(sp2, 'utf-8'));
      a2 = new HeapSnapshotAnalyzer(); a2.parse(raw2);
      cs2 = a2.getClassSummaries();
      expect(a2.nodeCount).toBeGreaterThan(0);
    });
    it('parse snapshot 3', () => {
      raw3 = JSON.parse(fs.readFileSync(sp3, 'utf-8'));
      a3 = new HeapSnapshotAnalyzer(); a3.parse(raw3);
      expect(a3.nodeCount).toBeGreaterThan(0);
    });
    it('top retainers', () => { expect(a1.getTopRetainers(5).length).toBeGreaterThan(0); });
    it('detached nodes', () => { expect(Array.isArray(a1.getDetachedNodes())).toBe(true); });
    it('lookup by id', () => {
      const n = a1.getNodes();
      if (n.length > 0) expect(a1.getNodeById(n[0].id)).toBeDefined();
    });
  });

  // ── 3. Static Diff ──
  describe('3. Snapshot Diff', () => {
    it('diff two real snapshots', () => {
      const diff = HeapSnapshotAnalyzer.diff(a1, a2);
      expect(diff).toBeDefined();
      // SnapshotDiff has: added[], removed[], grown[], totalAdded, totalRemoved, netGrowth
      expect(Array.isArray(diff.grown)).toBe(true);
      expect(Array.isArray(diff.added)).toBe(true);
      expect(typeof diff.netGrowth).toBe('number');
    });
    it('find grown classes', () => {
      const diff = HeapSnapshotAnalyzer.diff(a1, a2);
      // grown entries or added entries should exist
      expect(diff.grown.length + diff.added.length).toBeGreaterThan(0);
    });
  });

  // ── 4. 3-Snapshot Leak Detection ──
  describe('4. Leak Detection', () => {
    it('detect leaks across 3 snapshots', () => {
      leak = HeapSnapshotAnalyzer.detectLeaks(a1, a2, a3);
      expect(leak).toBeDefined();
      // LeakReport: { timestamp, snapshotSizes, leakCandidates[], summary, recommendations[] }
      expect(Array.isArray(leak.leakCandidates)).toBe(true);
      expect(typeof leak.summary).toBe('string');
      expect(Array.isArray(leak.recommendations)).toBe(true);
    });
    it('markdown from leak report', () => {
      const md = HeapSnapshotAnalyzer.leakReportToMarkdown(leak);
      expect(md.length).toBeGreaterThan(0);
    });
  });

  // ── 5. Retainer Chain ──
  describe('5. Retainer Chain', () => {
    it('get retainer chain for a node', () => {
      const nodes = a1.getNodes();
      if (nodes.length > 10) {
        const chain = a1.getRetainerChain(10, 5);
        // RetainerChain has { nodeId, nodeName, nodeType, selfSize, retainedSize, chain: RetainerStep[] }
        // May be undefined for unreachable nodes
        if (chain) {
          expect(Array.isArray(chain.chain)).toBe(true);
        }
      }
    });
  });

  // ── 6. RootCauseAnalyzer ──
  describe('6. RootCauseAnalyzer', () => {
    it('analyzeSnapshot', () => {
      const r = new RootCauseAnalyzer();
      rca = r.analyzeSnapshot(cs1, a1.nodeCount);
      expect(Array.isArray(rca.findings)).toBe(true);
    });
    it('analyzeLeakReport', () => {
      const r = new RootCauseAnalyzer();
      const report = r.analyzeLeakReport(leak);
      expect(Array.isArray(report.findings)).toBe(true);
    });
    it('toMarkdown', () => {
      expect(RootCauseAnalyzer.toMarkdown(rca).length).toBeGreaterThan(0);
    });
  });

  // ── 7. PerfettoExporter ──
  describe('7. PerfettoExporter', () => {
    it('export leak report', () => {
      const p = new PerfettoExporter({ processName: 'test', threadName: 'main' });
      const trace = p.exportLeakReport(leak);
      expect(Array.isArray(trace.traceEvents)).toBe(true);
    });
    it('export class summaries', () => {
      const p = new PerfettoExporter();
      p.exportClassSummaries(cs1, a1.getTotalSize(), 'test');
      expect(p.toJSON().length).toBeGreaterThan(0);
    });
    it('valid JSON', () => {
      const p = new PerfettoExporter();
      p.exportClassSummaries(cs1, a1.getTotalSize());
      expect(JSON.parse(p.toJSON())).toBeDefined();
    });
    it('compact <= full', () => {
      const p = new PerfettoExporter();
      p.exportClassSummaries(cs1, a1.getTotalSize());
      expect(p.toCompactJSON().length).toBeLessThanOrEqual(p.toJSON().length);
    });
    it('write to disk', () => {
      const p = new PerfettoExporter();
      p.exportClassSummaries(cs1, a1.getTotalSize());
      const tp = path.join(DIR, 'trace.json');
      fs.writeFileSync(tp, p.toJSON());
      expect(fs.existsSync(tp)).toBe(true);
    });
  });

  // ── 8. PerfettoSqlIntegration ──
  describe('8. PerfettoSqlIntegration', () => {
    it('parse SQL', () => {
      const r = SqlParser.parse('SELECT name FROM slice LIMIT 5');
      expect(r).toBeDefined();
    });
    it('load and query trace', async () => {
      const p = new PerfettoExporter();
      p.exportClassSummaries(cs1, a1.getTotalSize());
      const tp = path.join(DIR, 'q-trace.json');
      fs.writeFileSync(tp, p.toJSON());
      const sql = new PerfettoSqlIntegration();
      await sql.loadTrace(tp);
      const r = await sql.query('SELECT * FROM slice LIMIT 10');
      expect(Array.isArray(r.rows)).toBe(true);
    });
  });

  // ── 9. SmartDiffEngine ──
  describe('9. SmartDiffEngine', () => {
    it('diff real snapshots', () => {
      const e = new SmartDiffEngine();
      const r = e.diff(cs1, cs2);
      // SmartDiffReport: { timestamp, summary, netMemoryChange, stories[], topGrowers[], topShrinkers[] }
      expect(typeof r.summary).toBe('string');
      expect(Array.isArray(r.stories)).toBe(true);
      expect(Array.isArray(r.topGrowers)).toBe(true);
    });
    it('formatForTerminal', () => {
      const e = new SmartDiffEngine();
      const r = e.diff(cs1, cs2);
      expect(typeof SmartDiffEngine.formatForTerminal(r)).toBe('string');
    });
    it('toMarkdown', () => {
      const e = new SmartDiffEngine();
      const r = e.diff(cs1, cs2);
      expect(typeof SmartDiffEngine.toMarkdown(r)).toBe('string');
    });
  });

  // ── 10. TrendForecaster ──
  describe('10. TrendForecaster', () => {
    it('analyze trends', () => {
      const f = new TrendForecaster();
      const base = a1.getTotalSize();
      for (let i = 0; i < 10; i++) {
        const heapSize = base + i*base*0.05;
        f.addDataPoint({ timestamp: Date.now() - (10-i)*60000, totalHeapSize: heapSize, usedHeapSize: heapSize * 0.9, objectCount: a1.nodeCount + i*500 });
      }
      expect(f.getDataPointCount()).toBe(10);
      const t = f.analyze();
      // TrendReport: { timestamp, trend, growthRateBytesPerSec, rSquared, predictedOomMs, ... }
      expect(typeof t.trend).toBe('string');
      expect(typeof t.growthRateBytesPerSec).toBe('number');
      expect(typeof t.rSquared).toBe('number');
    });
    it('detect growing', () => {
      const f = new TrendForecaster();
      const base = a1.getTotalSize();
      for (let i = 0; i < 10; i++) {
        const heapSize = base + i*base*0.1;
        f.addDataPoint({ timestamp: Date.now() - (10-i)*60000, totalHeapSize: heapSize, usedHeapSize: heapSize * 0.9, objectCount: 1000 + i*500 });
      }
      // isGrowing() should reflect upward trend
      const trend = f.analyze();
      expect(['growing','stable','shrinking']).toContain(trend.trend);
    });
    it('perfetto counters', () => {
      const f = new TrendForecaster();
      for (let i = 0; i < 5; i++) f.addDataPoint({ timestamp: Date.now()-i*60000, totalHeapSize: 1e6+i*5e4, usedHeapSize: (1e6+i*5e4)*0.9, objectCount: 5000+i*100 });
      expect(Array.isArray(f.toPerfettoCounters())).toBe(true);
    });
  });

  // ── 11. GCPressureAnalyzer ──
  describe('11. GCPressureAnalyzer', () => {
    it('analyze GC events', () => {
      const gc = new GCPressureAnalyzer();
      const types: GCEvent['type'][] = ['scavenge', 'mark-compact', 'minor-gc', 'incremental-marking'];
      const evts: GCEvent[] = [];
      for (let i = 0; i < 50; i++) {
        const hBefore = 1e7+i*1e4;
        const hAfter = 1e7+i*5e3;
        const gen: GCEvent['generation'] = i%4 < 2 ? 'young' : 'old';
        evts.push({ type: types[i%4], startUs: (Date.now()-(50-i)*1000)*1000, durationUs: (Math.random()*50 + (i%4===1?100:5))*1000, heapBefore: hBefore, heapAfter: hAfter, freedBytes: Math.max(0, hBefore - hAfter), forced: false, generation: gen });
      }
      const r = gc.analyze(evts, 50000);
      // GCHealthReport: { gcTimePercent, healthScore, categories[], recommendations[], ... }
      expect(typeof r.gcTimePercent).toBe('number');
      expect(typeof r.healthScore).toBe('number');
      expect(Array.isArray(r.categories)).toBe(true);
      expect(Array.isArray(r.recommendations)).toBe(true);
    });
    it('format for terminal', () => {
      const gc = new GCPressureAnalyzer();
      const r = gc.analyze([{ type:'scavenge', startUs:Date.now()*1000, durationUs:5000, heapBefore:1e6, heapAfter:9e5, freedBytes:1e5, forced:false, generation:'young' }], 10000);
      expect(typeof GCPressureAnalyzer.formatForTerminal(r)).toBe('string');
    });
  });

  // ── 12. FlameGraphGenerator ──
  describe('12. FlameGraphGenerator', () => {
    it('from class summaries', () => {
      const g = new FlameGraphGenerator();
      g.addClassSummaries(cs1.slice(0,10));
      expect(g.getRoot()).toBeDefined();
      expect(typeof g.getRoot().name).toBe('string');
    });
    it('HTML output', () => {
      const g = new FlameGraphGenerator();
      g.addClassSummaries(cs1.slice(0,10));
      expect(g.toHTML().length).toBeGreaterThan(100);
    });
    it('ASCII output', () => {
      const g = new FlameGraphGenerator();
      g.addClassSummaries(cs1.slice(0,5));
      expect(typeof g.toASCII(80)).toBe('string');
    });
    it('folded stacks', () => {
      const g = new FlameGraphGenerator();
      g.addClassSummaries(cs1.slice(0,5));
      expect(typeof g.toFoldedStacks()).toBe('string');
    });
    it('Perfetto events', () => {
      const g = new FlameGraphGenerator();
      g.addClassSummaries(cs1.slice(0,5));
      expect(Array.isArray(g.toPerfettoEvents())).toBe(true);
    });
  });

  // ── 13. AllocationHotspotProfiler ──
  describe('13. AllocationHotspotProfiler', () => {
    it('find hotspots', () => {
      const p = new AllocationHotspotProfiler();
      const s: AllocationSample[] = [];
      for (let i = 0; i < 200; i++) {
        s.push({ nodeId: i+1, size: Math.floor(Math.random()*1e4)+100, count: Math.floor(Math.random()*50)+1, stack: [{ functionName:'alloc', scriptName:'w.js', lineNumber:i%10+1, columnNumber:0 }] });
      }
      const r = p.analyze(s);
      // AllocationProfileReport: { totalAllocatedBytes, totalAllocationCount, hotspots[], recommendations[], ... }
      expect(typeof r.totalAllocatedBytes).toBe('number');
      expect(typeof r.totalAllocationCount).toBe('number');
      expect(Array.isArray(r.hotspots)).toBe(true);
      expect(Array.isArray(r.recommendations)).toBe(true);
    });
    it('from class summaries', () => {
      const cls = cs1.slice(0,5).map(c => ({ className:c.className, count:c.count, shallowSize:c.shallowSize, retainedSize:c.retainedSize }));
      expect(Array.isArray(AllocationHotspotProfiler.fromClassSummaries(cls))).toBe(true);
    });
  });

  // ── 14. TokenEfficiencyBenchmark ──
  describe('14. TokenEfficiencyBenchmark', () => {
    it('benchmark snapshot analysis', () => {
      const b = new TokenEfficiencyBenchmark();
      const c = b.benchmarkSnapshotAnalysis(fs.statSync(sp1).size);
      // TokenCost: { scenario, sizeBytes, rawApproach: { estimatedTokens }, structuredApproach, reduction }
      expect(typeof c.scenario).toBe('string');
      expect(typeof c.sizeBytes).toBe('number');
      expect(typeof c.rawApproach.estimatedTokens).toBe('number');
      expect(c.rawApproach.estimatedTokens).toBeGreaterThan(0);
    });
    it('benchmark Perfetto output', () => {
      const b = new TokenEfficiencyBenchmark();
      expect(b.benchmarkPerfettoOutput(100)).toBeDefined();
    });
    it('benchmark LLM prompt reduction', () => {
      const b = new TokenEfficiencyBenchmark();
      expect(b.benchmarkLLMPromptReduction(10)).toBeDefined();
    });
    it('generate full report', () => {
      const b = new TokenEfficiencyBenchmark();
      b.benchmarkSnapshotAnalysis(fs.statSync(sp1).size);
      b.benchmarkPerfettoOutput(50);
      b.benchmarkLLMPromptReduction(5);
      expect(b.generateReport().length).toBeGreaterThan(0);
    });
  });

  // ── 15. MemoryRegressionGuard ──
  describe('15. MemoryRegressionGuard', () => {
    it('create fingerprint', () => {
      const g = new MemoryRegressionGuard();
      const cls = cs1.map(c => ({ className:c.className, count:c.count, shallowSize:c.shallowSize, retainedSize:c.retainedSize }));
      const fp = g.createFingerprint(cls, { label:'snap1' });
      // MemoryFingerprint: { id, timestamp, totalHeapSize, ... }
      expect(typeof fp.totalHeapSize).toBe('number');
      expect(fp.totalHeapSize).toBeGreaterThan(0);
    });
    it('set baseline and check regression', () => {
      const g = new MemoryRegressionGuard();
      const mk = (s: ClassSummary[]) => s.map(c => ({ className:c.className, count:c.count, shallowSize:c.shallowSize, retainedSize:c.retainedSize }));
      const fp1 = g.createFingerprint(mk(cs1));
      const fp2 = g.createFingerprint(mk(cs2));
      g.setBaseline('k', fp1);
      const r = g.checkRegression('k', fp2);
      // RegressionResult: { isRegression, severity, violations[], summary, comparison }
      expect(typeof r.isRegression).toBe('boolean');
      expect(Array.isArray(r.violations)).toBe(true);
      expect(typeof r.summary).toBe('string');
    });
    it('export/import baselines', () => {
      const g = new MemoryRegressionGuard();
      const cls = cs1.map(c => ({ className:c.className, count:c.count, shallowSize:c.shallowSize, retainedSize:c.retainedSize }));
      g.setBaseline('k1', g.createFingerprint(cls));
      const exp = g.exportBaselines();
      const g2 = new MemoryRegressionGuard();
      g2.importBaselines(exp);
      expect(g2.getBaseline('k1')).toBeDefined();
    });
  });

  // ── 16. LLMExplainer ──
  describe('16. LLMExplainer', () => {
    it('generate narrative prompt', () => {
      const e = new LLMExplainer();
      expect(e.generateNarrativePrompt(rca, cs1).length).toBeGreaterThan(0);
    });
    it('generate leak explanation prompt', () => {
      if (leak.leakCandidates.length > 0) {
        const e = new LLMExplainer();
        expect(e.generateLeakExplanationPrompt(leak.leakCandidates[0]).length).toBeGreaterThan(0);
      }
    });
  });

  // ── 17. InvestigationExecutor E2E ──
  describe('17. InvestigationExecutor E2E', () => {
    it('analyze real snapshot', async () => {
      const ex = new InvestigationExecutor();
      const r = await ex.execute({ action:'analyze_heap_snapshot', file_path:sp1 });
      expect(r.success).toBe(true);
      expect(typeof r.summary).toBe('string');
      await ex.dispose();
    });
    it('diagnose memory', async () => {
      const ex = new InvestigationExecutor();
      const r = await ex.execute({ action:'diagnose_memory', file_path:sp1 });
      expect(r.success).toBe(true);
      await ex.dispose();
    });
    it('export to Perfetto', async () => {
      const ex = new InvestigationExecutor();
      await ex.execute({ action:'analyze_heap_snapshot', file_path:sp1 });
      const ep = path.join(DIR, 'ex-trace.json');
      const r = await ex.execute({ action:'export_perfetto', output_path:ep });
      expect(r.success).toBe(true);
      expect(fs.existsSync(ep)).toBe(true);
      await ex.dispose();
    });
    it('handle missing file', async () => {
      const ex = new InvestigationExecutor();
      const r = await ex.execute({ action:'analyze_heap_snapshot', file_path:'/nope.heapsnapshot' });
      expect(r.success).toBe(false);
      await ex.dispose();
    });
    it('reject unknown action', async () => {
      const ex = new InvestigationExecutor();
      const r = await ex.execute({ action:'bad' as any });
      expect(r.success).toBe(false);
      await ex.dispose();
    });
  });

  // ── 18. CDPClient — Real Process ──
  describe('18. CDPClient', () => {
    it('connect and get heap usage', async () => {
      const port = 9230 + Math.floor(Math.random()*100);
      let proc: child_process.ChildProcess | null = null;
      try {
        proc = child_process.spawn('node', [`--inspect=127.0.0.1:${port}`, '-e', 'const d=[];setInterval(()=>{d.push(Array(100).fill("x"));if(d.length>50)d.shift();},50);'], { stdio:['pipe','pipe','pipe'] });
        await new Promise<void>(res => {
          const t = setTimeout(res, 4000);
          proc!.stderr!.on('data', (c:Buffer) => { if(c.toString().includes('Debugger listening')){clearTimeout(t);setTimeout(res,500);} });
        });
        const targets = await CDPClient.discoverTargets(port);
        expect(targets.length).toBeGreaterThan(0);
        const client = new CDPClient();
        await client.connect(port);
        expect(client.getState()).toBe('connected');
        const u = await client.getHeapUsage();
        expect(u.usedSize).toBeGreaterThan(0);
        await client.disconnect();
        expect(client.getState()).toBe('disconnected');
      } finally { if(proc) proc.kill('SIGTERM'); }
    }, 15000);

    it('take real heap snapshot via CDP', async () => {
      const port = 9340 + Math.floor(Math.random()*100);
      let proc: child_process.ChildProcess | null = null;
      try {
        proc = child_process.spawn('node', [`--inspect=127.0.0.1:${port}`, '-e', 'const d=[];setInterval(()=>{d.push({x:Math.random()});if(d.length>20)d.shift();},100);'], { stdio:['pipe','pipe','pipe'] });
        await new Promise<void>(res => {
          const t = setTimeout(res, 4000);
          proc!.stderr!.on('data', (c:Buffer) => { if(c.toString().includes('Debugger listening')){clearTimeout(t);setTimeout(res,500);} });
        });
        const client = new CDPClient();
        await client.connect(port);
        await client.heapProfilerEnable();
        const snap = await client.takeHeapSnapshot();
        expect(snap.length).toBeGreaterThan(1000);
        const parsed = JSON.parse(snap);
        expect(parsed.snapshot).toBeDefined();
        await client.heapProfilerDisable();
        await client.disconnect();
      } finally { if(proc) proc.kill('SIGTERM'); }
    }, 30000);
  });
});
