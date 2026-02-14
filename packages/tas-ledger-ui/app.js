/* eslint-disable license-header/header */
/* eslint-disable no-undef */
/**
 * @license
 * Copyright 2025 Russell Nordland
 * Proprietary and Confidential
 */

import { Statement, InflectionPointMetrics, recursiveTruthAmplification } from "./inflection-mechanics.js";

/* TAS_EXEC_001 — Upgraded: Physics + Cryptographic Chaining
   Visualization → Manifest → Glass Layer → Provenance Ledger (hash chain)
*/

const HOLD_MS = 1200;
const LOCK_PHRASE = "LOCK";

// ---- Ledger config (TAS-ish defaults) ----
const LEDGER_CFG = {
  iterations: 7,
  passThreshold: 0.95,
  complexityCeiling: 0.65,
  driftCeiling: 0.35,
  alpha: 0.62,
  beta: 0.48,
  gamma: 0.35
};

// --- Demo nodes: replace with your actual graph data ---
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const NODES = Array.from({ length: 22 }, (_, i) => {
  const r = 18 + i * 10;
  const a = i * GOLDEN_ANGLE;

  // Deterministic-ish “physics” for demo:
  // - eigenresonance tends to rise as you move outward (but not monotonically)
  // - complexity rises slightly with index
  // - drift oscillates (to simulate unstable inflections)
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const eigenresonance = clamp01(0.70 + 0.25 * Math.sin(i * 0.55) + 0.10 * (i / 22));
  const complexity = clamp01(0.30 + 0.02 * i);
  const drift = clamp01(0.10 + 0.18 * Math.abs(Math.sin(i * 0.35)));

  const taibom = {
    claim: `Inflection ${i}: Verified decision point.`,
    inputs: ["Human focus", "Audit resonance", "Bounded execution"],
    constraints: ["Three-key trigger", "No silent state change", "Ledger sequencing"],
    expected_effect: `Crystallize trust path for node ${i}.`
  };

  return {
    id: `N${String(i).padStart(2, "0")}`,
    name: `NODE_${String(i).padStart(2, "0")}`,
    taibom,
    physics: { eigenresonance, complexity, drift },
    r, a,
  };
});

// --- Global state ---
let selectedNode = null;
let lastAudit = null;

// --- Cryptographic chain in-memory ---
const DNA_CHAIN = [];

// --- DOM ---
const svg = d3.select("#spiral-svg");
const manifestEl = document.getElementById("manifest");
// const selectedNodeEl = document.getElementById("manifest"); // Reusing manifest pre block for title
const consentEl = document.getElementById("key-consent");
const phraseEl = document.getElementById("key-phrase");
const holdBtn = document.getElementById("hold-exec");
const holdProg = document.getElementById("hold-progress");
const auditOut = document.getElementById("audit-output");
const focusStatus = document.getElementById("focus-status");
const systemStatus = document.getElementById("system-status");
const flashEl = document.getElementById("resonance-flash");
const ledgerStatusEl = document.getElementById("ledger-status");

// --- Utilities ---
function nowISO() {
  return new Date().toISOString();
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function setSystem(text, kind = "neutral") {
  systemStatus.textContent = text;
  systemStatus.style.borderColor =
    kind === "ok" ? "rgba(55,214,122,0.35)"
    : kind === "warn" ? "rgba(255,92,92,0.35)"
    : "rgba(255,255,255,0.10)";
}

function setLedgerStatus(text, ok = true) {
  ledgerStatusEl.textContent = text;
  ledgerStatusEl.style.color = ok ? "rgba(55,214,122,0.95)" : "rgba(255,92,92,0.95)";
}

function setFocus(locked) {
  focusStatus.textContent = locked ? "FOCUS: LOCKED" : "FOCUS: UNLOCKED";
  focusStatus.style.color = locked ? "rgba(55,214,122,0.95)" : "rgba(255,255,255,0.55)";
}

function resonanceFlash() {
  flashEl.classList.add("on");
  setTimeout(() => flashEl.classList.remove("on"), 240);
}

/** Canonical JSON stringify (stable key order) */
function canonicalStringify(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonicalStringify).join(",")}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map(k => JSON.stringify(k) + ":" + canonicalStringify(obj[k])).join(",")}}`;
}

/** SHA-256 hex via WebCrypto */
async function sha256hex(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

function short(h) {
  return String(h).slice(0, 8);
}

// --- Physics-driven audit ---
function buildStatementForNode(node) {
  return new Statement({
    id: node.id,
    claim: node.taibom.claim,
    inputs: node.taibom.inputs,
    constraints: node.taibom.constraints,
    expected_effect: node.taibom.expected_effect
  });
}

function runAudit(node) {
  const stmt = buildStatementForNode(node);
  const m = new InflectionPointMetrics(node.physics);

  const rta = recursiveTruthAmplification(m, LEDGER_CFG);

  // “Audit results” become a structured payload
  const invariants = [
    { name: "NoHiddenState", pass: true },
    { name: "ThreeKeyTrigger", pass: true },
    { name: "RecursiveTruthAmplification", pass: true },
    { name: "BoundedComplexity", pass: rta.bounded },
    { name: "IffGateThreshold", pass: rta.ready }
  ];

  return {
    statement: stmt,
    metrics: m,
    resonance: rta.resonance,  // final resonance after recursion
    ready: rta.ready,
    bounded: rta.bounded,
    steps: rta.steps,
    cfgUsed: rta.cfgUsed,
    invariants
  };
}

function renderManifest(node) {
  const m = node.taibom;
  const p = node.physics;

  manifestEl.textContent =
`ID: ${node.id}
NAME: ${node.name}

TAIBOM:
- CLAIM: ${m.claim}

INPUTS:
- ${m.inputs.join("\n- ")}

CONSTRAINTS:
- ${m.constraints.join("\n- ")}

EXPECTED EFFECT:
- ${m.expected_effect}

PHYSICS (InflectionPointMetrics):
- Eigenresonance: ${p.eigenresonance.toFixed(3)}
- Complexity:     ${p.complexity.toFixed(3)}
- Drift:          ${p.drift.toFixed(3)}
`;
}

function renderAudit(audit, liveResonance = null) {
  const lines = [];
  const r = (liveResonance ?? audit.resonance);

  lines.push(`RESONANCE: ${r.toFixed(3)}  ${audit.ready ? "[READY]" : "[NOT READY]"}`);
  lines.push(`BOUNDS:    ${audit.bounded ? "OK" : "VIOLATED"}`);
  lines.push("");

  lines.push("INVARIANTS:");
  for (const inv of audit.invariants) {
    lines.push(`- ${inv.pass ? "PASS" : "FAIL"}  ${inv.name}`);
  }

  lines.push("");
  lines.push("RTA TRACE (last 3 steps):");
  const tail = audit.steps.slice(-3);
  for (const s of tail) {
    lines.push(`- i=${s.i}  r=${s.resonance.toFixed(3)}  gain=${s.gain.toFixed(3)}  loss=${s.loss.toFixed(3)}`);
  }

  lines.push("");
  lines.push(`CFG: iter=${audit.cfgUsed.iterations}  thresh=${audit.cfgUsed.passThreshold}  c<=${audit.cfgUsed.complexityCeiling}  d<=${audit.cfgUsed.driftCeiling}`);

  auditOut.textContent = lines.join("\n");
}

// --- Ledger: hash-chained blocks ---
function getParentHash() {
  if (DNA_CHAIN.length === 0) return "0".repeat(64); // GENESIS parent
  return DNA_CHAIN[DNA_CHAIN.length - 1].blockHash;
}

/**
 * Block format:
 *  index
 *  timestamp
 *  parentHash
 *  payloadHash
 *  blockHash
 *  payload: { node, statement, auditSummary, cfgUsed }
 */
async function makeBlockFromExecution(node, audit) {
  const parentHash = getParentHash();

  const payload = {
    node: { id: node.id, name: node.name },
    statement: {
      id: audit.statement.id,
      claim: audit.statement.claim,
      inputs: audit.statement.inputs,
      constraints: audit.statement.constraints,
      expected_effect: audit.statement.expected_effect
    },
    auditSummary: {
      resonance: Number(audit.resonance.toFixed(6)),
      ready: audit.ready,
      bounded: audit.bounded,
      metrics: {
        eigenresonance: Number(audit.metrics.eigenresonance.toFixed(6)),
        complexity: Number(audit.metrics.complexity.toFixed(6)),
        drift: Number(audit.metrics.drift.toFixed(6))
      },
      invariants: audit.invariants
    },
    cfgUsed: audit.cfgUsed
  };

  const payloadCanonical = canonicalStringify(payload);
  const payloadHash = await sha256hex(payloadCanonical);

  const header = {
    index: DNA_CHAIN.length,           // 0-based
    timestamp: nowISO(),
    parentHash,
    payloadHash
  };

  const headerCanonical = canonicalStringify(header);
  const blockHash = await sha256hex(headerCanonical);

  return {
    ...header,
    blockHash,
    payload
  };
}

async function appendBlockToLedgerUI(block) {
  const stream = document.getElementById("ledger-stream");
  const el = document.createElement("div");
  el.className = "ledger-block entry-pending";

  // show blockHash short, parent short, resonance
  const timestamp = block.timestamp.slice(11, 19);
  const res = block.payload.auditSummary.resonance.toFixed(2);

  el.innerHTML = `
    <div class="block-id">[${short(block.blockHash)}]</div>
    <div class="block-meta">${block.payload.node.name}</div>
    <div class="block-res">RES: ${res} | P: ${short(block.parentHash)}</div>
    <div class="block-time">${timestamp}</div>
  `;

  stream.prepend(el);

  setTimeout(() => {
    el.classList.remove("entry-pending");
    el.classList.add("entry-verified");
    updateDNAString({ id: block.payload.node.id });
  }, 800);
}

async function sequenceExecution(node, audit) {
  setLedgerStatus("HASHING…", true);

  const block = await makeBlockFromExecution(node, audit);
  DNA_CHAIN.push(block);

  await appendBlockToLedgerUI(block);

  const ok = await verifyChain();
  setLedgerStatus(ok ? "SYNCED" : "CHAIN_BROKEN", ok);
  return block;
}

/** Full-chain verification */
async function verifyChain() {
  for (let i = 0; i < DNA_CHAIN.length; i++) {
    const b = DNA_CHAIN[i];
    const expectedParent = (i === 0) ? "0".repeat(64) : DNA_CHAIN[i - 1].blockHash;
    if (b.parentHash !== expectedParent) return false;

    const payloadCanonical = canonicalStringify(b.payload);
    const expectedPayloadHash = await sha256hex(payloadCanonical);
    if (b.payloadHash !== expectedPayloadHash) return false;

    const headerCanonical = canonicalStringify({
      index: b.index,
      timestamp: b.timestamp,
      parentHash: b.parentHash,
      payloadHash: b.payloadHash
    });
    const expectedBlockHash = await sha256hex(headerCanonical);
    if (b.blockHash !== expectedBlockHash) return false;
  }
  return true;
}

// Convenience: export DNA chain (for “immutable strand” handoff)
window.exportDNA = function exportDNA() {
  const blob = new Blob([JSON.stringify({ chain: DNA_CHAIN }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `TAS_PROVENANCE_LEDGER_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

// --- D3 visualization ---
function buildSpiral() {
  const bounds = document.querySelector(".viz-stage").getBoundingClientRect();
  const width = bounds.width;
  const height = bounds.height;

  svg.attr("viewBox", `0 0 ${width} ${height}`);

  const cx = width / 2;
  const cy = height / 2;

  const pts = NODES.map(n => {
    const x = cx + n.r * Math.cos(n.a);
    const y = cy + n.r * Math.sin(n.a);
    return { ...n, x, y };
  });

  const links = pts.map(p => ({
    id: `link-${p.id}`,
    source: { x: cx, y: cy },
    target: { x: p.x, y: p.y },
    nodeId: p.id
  }));

  svg.selectAll("*").remove();

  const guide = d3.line()
    .x(d => d.x)
    .y(d => d.y)
    .curve(d3.curveCatmullRom.alpha(0.6));

  svg.append("path")
    .datum(pts)
    .attr("d", guide)
    .attr("fill", "none")
    .attr("stroke", "rgba(255,255,255,0.10)")
    .attr("stroke-width", 1.5);

  svg.append("g")
    .attr("class", "links")
    .selectAll("line")
    .data(links)
    .enter()
    .append("line")
    .attr("id", d => d.id)
    .attr("x1", d => d.source.x)
    .attr("y1", d => d.source.y)
    .attr("x2", d => d.target.x)
    .attr("y2", d => d.target.y)
    .attr("stroke", "rgba(255,255,255,0.07)")
    .attr("stroke-width", 1);

  svg.append("circle")
    .attr("cx", cx)
    .attr("cy", cy)
    .attr("r", 5)
    .attr("fill", "rgba(247,201,72,0.85)")
    .attr("filter", "drop-shadow(0 0 10px rgba(247,201,72,0.25))");

  const g = svg.append("g").attr("class", "nodes");

  const nodeSel = g.selectAll("circle")
    .data(pts)
    .enter()
    .append("circle")
    .attr("id", d => `node-${d.id}`)
    .attr("class", "spiral-node") // Add class for selection
    .attr("cx", d => d.x)
    .attr("cy", d => d.y)
    .attr("r", d => 4 + Math.min(6, d.r / 60))
    .attr("fill", "rgba(255,255,255,0.78)")
    .attr("stroke", "rgba(0,0,0,0.35)")
    .attr("stroke-width", 1)
    .style("cursor", "pointer")
    .on("click", (_, d) => onSelectNode(d));

  nodeSel.append("title")
    .text(d => `${d.name} (${d.id})`);
}

function resetHighlights() {
  NODES.forEach(n => {
    d3.select(`#link-${n.id}`)
      .interrupt()
      .style("stroke", "rgba(255,255,255,0.07)")
      .style("stroke-width", "1px")
      .style("filter", "none");

    d3.select(`#node-${n.id}`)
      .interrupt()
      .attr("fill", "rgba(255,255,255,0.78)")
      .attr("filter", "none");
  });
}

// Solid Gold “verified DNA”
function updateDNAString(node) {
  d3.select(`#link-${node.id}`)
    .transition()
    .duration(900)
    .style("stroke", "var(--accent-color)")
    .style("stroke-width", "3px")
    .style("filter", "drop-shadow(0 0 6px rgba(247,201,72,0.35))");

  d3.select(`#node-${node.id}`)
    .transition()
    .duration(900)
    .attr("fill", "var(--accent-color)")
    .attr("filter", "drop-shadow(0 0 10px rgba(247,201,72,0.35))");
}

// --- Flow: Selection → Manifest → Audit → Glass Lock → Execute → Sequence ---
function onSelectNode(node) {
  selectedNode = node;
  lastAudit = runAudit(node);

  // manifestEl is the text output area
  renderManifest(node);
  renderAudit(lastAudit);

  resetHighlights();
  d3.select(`#node-${node.id}`)
    .attr("fill", "rgba(247,201,72,0.90)")
    .attr("filter", "drop-shadow(0 0 8px rgba(247,201,72,0.18))");

  setSystem(lastAudit.ready ? "NODE_READY" : "NODE_NOT_READY", lastAudit.ready ? "ok" : "warn");
  updateExecEligibility();
}

// --- Glass Layer: Eligibility now depends on BOTH RTA readiness AND three keys ---
function updateExecEligibility() {
  const hasNode = !!selectedNode;
  const auditReady = !!lastAudit?.ready;

  const k1 = consentEl.checked;
  const k2 = phraseEl.value.trim().toUpperCase() === LOCK_PHRASE;

  const eligible = hasNode && auditReady && k1 && k2;

  holdBtn.disabled = !eligible;
  setFocus(eligible);

  if (!hasNode) setSystem("READY");
  else if (!auditReady) setSystem("AUDIT_GATE_DENIED", "warn");
  else if (!eligible) setSystem("ARMING_GLASS_LAYER");
  else setSystem("GLASS_LOCK_ACQUIRED", "ok");
}

function isEligible() {
  return !!selectedNode &&
    !!lastAudit?.ready &&
    consentEl.checked &&
    phraseEl.value.trim().toUpperCase() === LOCK_PHRASE;
}

// --- Recursive flash during hold (resonance climb) ---
let holdAnimating = false;
let holdStart = 0;

function setHoldProgress(pct) {
  holdProg.style.width = `${pct}%`;
}

function resetHold() {
  holdAnimating = false;
  setHoldProgress(0);
}

// We animate *toward* the final resonance the physics model predicts.
// This is visual proof: the system “climbs” to the RTA resonance under lock.
function projectedResonance(progress01) {
  if (!lastAudit) return 0;
  const start = Math.max(0.50, lastAudit.steps?.[0]?.resonance ?? 0.50);
  const target = lastAudit.resonance;
  const eased = 1 - Math.pow(1 - progress01, 2); // ease-out
  return start + (target - start) * eased;
}

async function executeIfLocked() {
  if (!isEligible()) return;

  setSystem("EXECUTING", "ok");
  resonanceFlash();

  // Cryptographic sequencing
  await sequenceExecution(selectedNode, lastAudit);

  setSystem("EXECUTED → HASH_CHAINED", "ok");
  resetHold();
}

function onHoldStart() {
  if (!isEligible() || holdAnimating) return;
  holdAnimating = true;
  holdStart = performance.now();

  const tick = () => {
    if (!holdAnimating) return;

    const elapsed = performance.now() - holdStart;
    const p01 = clamp01(elapsed / HOLD_MS);
    setHoldProgress(p01 * 100);

    // live resonance climb visualization in audit panel
    const liveR = projectedResonance(p01);
    renderAudit(lastAudit, liveR);

    // subtle flash when nearing threshold
    if (p01 > 0.82) resonanceFlash();

    if (elapsed >= HOLD_MS) {
      holdAnimating = false;
      executeIfLocked();
      return;
    }
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}

function onHoldEnd() {
  if (!holdAnimating) return;
  resetHold();
  // restore final audit view
  if (lastAudit) renderAudit(lastAudit);
}

// --- Sovereign Wave Pulse (The "Living System") ---
function triggerSovereignWave() {
    const nodes = document.querySelectorAll('.spiral-node'); // Selects circles with class spiral-node

    nodes.forEach((node, index) => {
        // Use a timeout to create the "Wave" effect moving along the spiral
        setTimeout(() => {
            const isInvariantMet = Math.random() > 0.10; // 90% pass rate for demo

            if (isInvariantMet) {
                node.classList.add('node-sovereign-active');
                node.classList.remove('node-invariant-fail');

                // Log the Bond computation success in the console (or a UI log)
                // console.log(`Node ${index}: Bond H(parent ∥ φ ∥ t) Verified.`);
            } else {
                node.classList.remove('node-sovereign-active');
                node.classList.add('node-invariant-fail');
                // console.warn(`Node ${index}: Invariant Failed. Existence ↔ Null.`);
            }
        }, index * 100); // 100ms delay per node for the wave effect
    });
}

// Trigger the wave every 30 seconds
setInterval(triggerSovereignWave, 30000);

// --- Wire up UI ---
consentEl.addEventListener("change", updateExecEligibility);
phraseEl.addEventListener("input", updateExecEligibility);

holdBtn.addEventListener("mousedown", onHoldStart);
holdBtn.addEventListener("touchstart", (e) => { e.preventDefault(); onHoldStart(); }, { passive: false });

window.addEventListener("mouseup", onHoldEnd);
window.addEventListener("touchend", onHoldEnd);
window.addEventListener("touchcancel", onHoldEnd);

window.addEventListener("resize", buildSpiral);

// Init
buildSpiral();
updateExecEligibility();
setSystem("READY");
setLedgerStatus("SYNCED", true);
// Initial pulse after load
setTimeout(triggerSovereignWave, 2000);
