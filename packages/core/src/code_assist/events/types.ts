/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ReceiveEventsResponse {
  event: Event;
}

export type EventType = 'CAMPAIGN_NOTIFICATION' | 'CLI_BANNER';

export interface Event {
  eventId: string;
  eventType: EventType;
  campaignNotification: Campaign;
}

export interface Campaign {
  title: string; // first line of banner
  body: string; // rest of banner text
  campaignId: string;
  action: Action;
}

export interface Action {
  text?: string; // banner's styling WARNING is supported right now
  uri?: string;
}
