import { ToolCallEvent } from "../ui/types.js";

export enum GeminiEventType {
    Content,
    ToolCallInfo,
}

export interface GeminiContentEvent {
    type: GeminiEventType.Content;
    value: string;
}

export interface GeminiToolCallInfoEvent {
    type: GeminiEventType.ToolCallInfo;
    value: ToolCallEvent;
}

export type GeminiEvent =
    | GeminiContentEvent
    | GeminiToolCallInfoEvent;

export type GeminiStream = AsyncIterable<GeminiEvent>;
