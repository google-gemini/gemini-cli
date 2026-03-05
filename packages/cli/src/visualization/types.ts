/**
 * Shared types for the termviz pipeline.
 */

export type DiagramType = 'mermaid' | 'graphviz' | 'html';

export type TerminalProtocol = 'kitty' | 'iterm2' | 'sixel' | 'ascii';

export type ColorDepth = 8 | 24;

export type Theme = 'default' | 'dark' | 'neutral';

export type ArtifactType = 'mermaid' | 'ui' | 'deps' | 'git';

// ---------------------------------------------------------------------------
// Terminal capabilities
// ---------------------------------------------------------------------------

export interface TerminalCaps {
    protocol: TerminalProtocol;
    colorDepth: ColorDepth;
    columns: number;
    rows: number;
    supportsUnicode: boolean;
}

// ---------------------------------------------------------------------------
// Pipeline I/O
// ---------------------------------------------------------------------------

export interface PipelineOptions {
    /** Raw diagram source (e.g. Mermaid text) */
    spec: string;
    diagramType: DiagramType;
    theme?: Theme;
    /** Target render width in pixels (default: 1200) */
    widthPx?: number;
    /** Override background color (default: transparent for dark, white for default) */
    backgroundColor?: string;
    /** If true, skip Puppeteer entirely — ASCII renderer will be called directly */
    asciiOnly?: boolean;
}

export interface RenderResult {
    /** Absolute path to the cached PNG file */
    pngPath: string;
    widthPx: number;
    heightPx: number;
    /** Whether this came from cache or was freshly rendered */
    fromCache: boolean;
}

// ---------------------------------------------------------------------------
// Visual artifact display (for CLI renderer + future gemini-cli integration)
// ---------------------------------------------------------------------------

export interface VisualArtifactDisplay {
    type: 'visual_artifact';
    artifactType: ArtifactType;
    title?: string;
    pngPath: string;
    widthCells?: number;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

export interface CacheMeta {
    key: string;
    pngPath: string;
    widthPx: number;
    heightPx: number;
    createdAt: string;
    spec: string;
    diagramType: DiagramType;
    theme: Theme;
    rendererVersion: string;
}
