/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Google Chat HTTP endpoint event types.
 * @see https://developers.google.com/workspace/chat/api/reference/rest/v1/Event
 */

export interface ChatUser {
  name: string;
  displayName: string;
  type?: 'HUMAN' | 'BOT';
}

export interface ChatThread {
  name: string;
  threadKey?: string;
}

export interface ChatSpace {
  name: string;
  type: 'DM' | 'ROOM' | 'SPACE';
  displayName?: string;
}

export interface ChatMessage {
  name: string;
  sender: ChatUser;
  createTime: string;
  text?: string;
  argumentText?: string;
  thread: ChatThread;
  space: ChatSpace;
  cardsV2?: ChatCardV2[];
}

export interface ChatActionParameter {
  key: string;
  value: string;
}

export interface ChatAction {
  actionMethodName: string;
  parameters: ChatActionParameter[];
}

export type ChatEventType =
  | 'MESSAGE'
  | 'CARD_CLICKED'
  | 'ADDED_TO_SPACE'
  | 'REMOVED_FROM_SPACE';

export interface ChatEvent {
  type: ChatEventType;
  eventTime: string;
  message?: ChatMessage;
  space: ChatSpace;
  user: ChatUser;
  action?: ChatAction;
  common?: Record<string, unknown>;
  threadKey?: string;
}

// Google Chat Cards V2 response types

export interface ChatCardV2 {
  cardId: string;
  card: ChatCard;
}

export interface ChatCard {
  header?: ChatCardHeader;
  sections: ChatCardSection[];
}

export interface ChatCardHeader {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  imageType?: 'CIRCLE' | 'SQUARE';
}

export interface ChatCardSection {
  header?: string;
  widgets: ChatWidget[];
  collapsible?: boolean;
  uncollapsibleWidgetsCount?: number;
}

export type ChatWidget =
  | { textParagraph: { text: string } }
  | { decoratedText: ChatDecoratedText }
  | { buttonList: { buttons: ChatButton[] } }
  | { divider: Record<string, never> };

export interface ChatDecoratedText {
  text: string;
  topLabel?: string;
  bottomLabel?: string;
  startIcon?: { knownIcon: string };
  wrapText?: boolean;
}

export interface ChatButton {
  text: string;
  onClick: ChatOnClick;
  color?: { red: number; green: number; blue: number; alpha?: number };
  disabled?: boolean;
}

export interface ChatOnClick {
  action: {
    function: string;
    parameters: ChatActionParameter[];
  };
}

export interface ChatResponse {
  text?: string;
  cardsV2?: ChatCardV2[];
  thread?: { threadKey: string };
  actionResponse?: {
    type: 'NEW_MESSAGE' | 'UPDATE_MESSAGE' | 'REQUEST_CONFIG';
  };
}

// Bridge configuration

export interface ChatBridgeConfig {
  /** URL of the A2A server to connect to (e.g. http://localhost:8080) */
  a2aServerUrl: string;
  /** Google Chat project number for verification (optional) */
  projectNumber?: string;
  /** Whether to enable debug logging */
  debug?: boolean;
}
