import { ToolResultDisplay } from '../tools/tools.js';

export enum ToolCallStatus {
  Pending,
  Invoked,
  Confirming,
  Canceled,
}

export interface ToolCallEvent {
  type: 'tool_call';
  status: ToolCallStatus;
  callId: string;
  name: string;
  args: Record<string, never>;
  resultDisplay: ToolResultDisplay | undefined;
  confirmationDetails: ToolCallConfirmationDetails | undefined;
}

export interface IndividualToolCallDisplay {
  callId: string;
  name: string;
  description: string;
  resultDisplay: ToolResultDisplay | undefined;
  status: ToolCallStatus;
  confirmationDetails: ToolCallConfirmationDetails | undefined;
}

export interface HistoryItemBase {
  id: number;
  text?: string; // Text content for user/gemini/info/error messages
}

export type HistoryItem = HistoryItemBase &
  (
    | { type: 'user'; text: string }
    | { type: 'gemini'; text: string }
    | { type: 'info'; text: string }
    | { type: 'error'; text: string }
    | { type: 'tool_group'; tools: IndividualToolCallDisplay[] }
  );

export interface ToolCallConfirmationDetails {
  title: string;
  onConfirm: (outcome: ToolConfirmationOutcome) => Promise<void>;
}

export interface ToolEditConfirmationDetails
  extends ToolCallConfirmationDetails {
  fileName: string;
  fileDiff: string;
}

export interface ToolExecuteConfirmationDetails
  extends ToolCallConfirmationDetails {
  command: string;
  rootCommand: string;
  description: string;
}

export enum ToolConfirmationOutcome {
  ProceedOnce,
  ProceedAlways,
  Cancel,
}
