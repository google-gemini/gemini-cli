/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ReceiveEventsResponse {
  events?: Event[];
}

export interface Events {
  events?: Event[];
}

export type EventType = 'CAMPAIGN_NOTIFICATION' | 'CLI_BANNER';

export interface Event {
  eventId: string;
  eventType: EventType;
  campaignNotification: Campaign;
}

export interface Campaign {
  title: string; // will contain whether text is default, warning, or error
  body: string; // actual banner text
  campaignId: string;
  actions: Action[];
}

export interface Action {
  text: string;
  uri: string;
}
