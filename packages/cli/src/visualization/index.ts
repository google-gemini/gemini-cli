// Public API surface for @google/gemini-cli-visualization
export { runPipeline } from './pipeline/run.js';
export { generateMermaid } from './generate.js';
export { PIPELINE_VERSION } from './types.js';
export {
  computeCacheKey,
  getCachedPath,
  setCached,
  CACHE_DIR,
} from './cache/index.js';
export { renderMermaidToPng } from './render/mermaid.js';
export { renderHtmlToPng } from './render/html.js';
export { renderMermaidAscii } from './render/ascii.js';
export { renderVisualArtifact } from './render/visualArtifact.js';
export type {
  DiagramType,
  TerminalProtocol,
  ColorDepth,
  Theme,
  ArtifactType,
  TerminalCaps,
  PipelineOptions,
  RenderResult,
  VisualArtifactDisplay,
  CacheMeta,
} from './types.js';
