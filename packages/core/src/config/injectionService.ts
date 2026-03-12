/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Source of an injection into the model conversation.
 * - `user_steering`: Interactive guidance from the user (gated on model steering).
 * - `background_completion`: Output from a backgrounded execution that has finished.
 */
export type InjectionSource = 'user_steering' | 'background_completion';

/**
 * Typed listener that receives both the injection text and its source.
 */
export type InjectionListener = (text: string, source: InjectionSource) => void;

/**
 * Service for managing injections into the model conversation.
 *
 * Multiple sources (user steering, background execution completions, etc.)
 * can feed into this service. Consumers register typed listeners via
 * {@link onInjection} to receive injections with source information, or use the
 * legacy {@link onUserHint} API for backward compatibility.
 */
export class InjectionService {
  private readonly injections: Array<{
    text: string;
    source: InjectionSource;
    timestamp: number;
  }> = [];
  private readonly injectionListeners: Set<InjectionListener> = new Set();
  private readonly userHintListeners: Set<(hint: string) => void> = new Set();

  constructor(private readonly isEnabled: () => boolean) {}

  /**
   * Adds an injection from any source.
   *
   * `user_steering` injections are gated on model steering being enabled.
   * Other sources (e.g. `background_completion`) are always accepted.
   */
  addInjection(text: string, source: InjectionSource): void {
    if (source === 'user_steering' && !this.isEnabled()) {
      return;
    }
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return;
    }
    this.injections.push({ text: trimmed, source, timestamp: Date.now() });

    // Fire typed listeners (new API)
    for (const listener of this.injectionListeners) {
      listener(trimmed, source);
    }

    // Fire legacy listeners (user_steering only)
    if (source === 'user_steering') {
      for (const listener of this.userHintListeners) {
        listener(trimmed);
      }
    }
  }

  /**
   * Adds a new steering hint from the user.
   * Convenience wrapper around {@link addInjection} with `user_steering` source.
   */
  addUserHint(hint: string): void {
    this.addInjection(hint, 'user_steering');
  }

  /**
   * Registers a typed listener for injections from any source.
   */
  onInjection(listener: InjectionListener): void {
    this.injectionListeners.add(listener);
  }

  /**
   * Unregisters a typed injection listener.
   */
  offInjection(listener: InjectionListener): void {
    this.injectionListeners.delete(listener);
  }

  /**
   * Registers a listener for user steering hints only.
   */
  onUserHint(listener: (hint: string) => void): void {
    this.userHintListeners.add(listener);
  }

  /**
   * Unregisters a user steering hint listener.
   */
  offUserHint(listener: (hint: string) => void): void {
    this.userHintListeners.delete(listener);
  }

  /**
   * Returns all collected injection texts (all sources).
   */
  getUserHints(): string[] {
    return this.injections.map((h) => h.text);
  }

  /**
   * Returns injection texts added after a specific index.
   */
  getUserHintsAfter(index: number): string[] {
    if (index < 0) {
      return this.getUserHints();
    }
    return this.injections.slice(index + 1).map((h) => h.text);
  }

  /**
   * Returns the index of the latest injection.
   */
  getLatestHintIndex(): number {
    return this.injections.length - 1;
  }

  /**
   * Returns the timestamp of the last injection.
   */
  getLastUserHintAt(): number | null {
    if (this.injections.length === 0) {
      return null;
    }
    return this.injections[this.injections.length - 1].timestamp;
  }

  /**
   * Clears all collected injections.
   */
  clear(): void {
    this.injections.length = 0;
  }
}
