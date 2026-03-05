// Public API surface for @google/gemini-cli-visualization
export { runPipeline, PIPELINE_VERSION } from './pipeline/run.js';
export { computeCacheKey, getCachedPath, setCached, CACHE_DIR } from './cache/index.js';
export { renderMermaidToPng } from './render/mermaid.js';
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
