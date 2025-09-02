/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import type { UniversalMessage, ModelProviderConfig, ModelProviderType } from '../providers/types.js';
import type { Config } from '../config/config.js';
import type { ModelProviderFactory } from '../providers/ModelProviderFactory.js';

export interface SessionData {
  id: string;
  title: string;
  lastUpdated: Date;
  createdAt: Date;
  conversationHistory: UniversalMessage[];
  metadata?: {
    provider?: string;
    model?: string;
    roleId?: string;
  };
}

export interface SessionInfo {
  id: string;
  title: string;
  messageCount: number;
  lastUpdated: Date;
}

export interface SessionManagerOptions {
  config: Config;
  createModelProvider?: typeof ModelProviderFactory.create;
}

/**
 * SessionManager handles session persistence and retrieval as a singleton.
 * It manages conversation history, session metadata, and intelligent title generation.
 */
export class SessionManager {
  private static instance: SessionManager | null = null;
  private sessions: Map<string, SessionData> = new Map();
  private currentSessionId: string | null = null;
  private config: Config | null = null;
  private createModelProvider?: typeof ModelProviderFactory.create;
  private initialized = false;

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  /**
   * Initialize the SessionManager with configuration
   */
  async initializeWithConfig(options: SessionManagerOptions): Promise<void> {
    if (this.initialized) {
      console.warn('[SessionManager] Already initialized');
      return;
    }
    
    this.config = options.config;
    this.createModelProvider = options.createModelProvider;
    this.initialized = true; // Set before calling initialize to avoid circular dependency
    await this.initialize();
  }

  /**
   * Initialize the session manager by loading persisted sessions
   */
  private async initialize(): Promise<void> {
    await this.loadSessions();
  }

  /**
   * Ensure the SessionManager is properly initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.config) {
      throw new Error('SessionManager not initialized. Call initializeWithConfig() first.');
    }
  }

  /**
   * Get the sessions storage directory path
   */
  private getSessionsDir(): string {
    this.ensureInitialized();
    return path.join(this.config!.storage.getProjectTempDir(), 'sessions');
  }

  /**
   * Get the path for a specific session file
   */
  private getSessionPath(sessionId: string): string {
    return path.join(this.getSessionsDir(), `${sessionId}.json`);
  }

  /**
   * Load all persisted sessions from disk
   */
  private async loadSessions(): Promise<void> {
    const sessionsDir = this.getSessionsDir();
    
    try {
      if (!fs.existsSync(sessionsDir)) {
        fs.mkdirSync(sessionsDir, { recursive: true });
        return;
      }

      const files = fs.readdirSync(sessionsDir);
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        try {
          const sessionPath = path.join(sessionsDir, file);
          const sessionContent = fs.readFileSync(sessionPath, 'utf-8');
          const sessionData = JSON.parse(sessionContent) as SessionData;
          
          // Convert date strings back to Date objects
          sessionData.lastUpdated = new Date(sessionData.lastUpdated);
          sessionData.createdAt = new Date(sessionData.createdAt);
          
          this.sessions.set(sessionData.id, sessionData);
        } catch (error) {
          console.error(`Failed to load session file ${file}:`, error);
        }
      }
      
      console.log(`[SessionManager] Loaded ${this.sessions.size} sessions from disk`);
    } catch (error) {
      console.error('[SessionManager] Failed to load sessions:', error);
    }
  }

  /**
   * Save a session to disk
   */
  private async saveSession(sessionData: SessionData): Promise<void> {
    try {
      const sessionsDir = this.getSessionsDir();
      if (!fs.existsSync(sessionsDir)) {
        fs.mkdirSync(sessionsDir, { recursive: true });
      }

      const sessionPath = this.getSessionPath(sessionData.id);
      fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2), 'utf-8');
    } catch (error) {
      console.error(`[SessionManager] Failed to save session ${sessionData.id}:`, error);
    }
  }

  /**
   * Create a new session
   */
  createSession(sessionId: string, title: string = 'New Chat'): void {
    this.ensureInitialized();
    console.log(`[SessionManager] Creating session: ${sessionId}`);
    
    const newSession: SessionData = {
      id: sessionId,
      title,
      lastUpdated: new Date(),
      createdAt: new Date(),
      conversationHistory: [],
      metadata: {}
    };
    
    this.sessions.set(sessionId, newSession);
    
    // Auto-switch to new session if no current session
    if (!this.currentSessionId) {
      this.switchSession(sessionId);
    }
    
    // Save to disk
    this.saveSession(newSession);
  }

  /**
   * Switch to a different session
   */
  switchSession(sessionId: string): void {
    this.ensureInitialized();
    console.log(`[SessionManager] Switching from session ${this.currentSessionId} to ${sessionId}`);
    
    // Update current session timestamp if exists
    if (this.currentSessionId && this.sessions.has(this.currentSessionId)) {
      const currentSession = this.sessions.get(this.currentSessionId)!;
      currentSession.lastUpdated = new Date();
      this.saveSession(currentSession);
    }
    
    // Switch to new session
    this.currentSessionId = sessionId;
    
    // Create session if it doesn't exist
    let targetSession = this.sessions.get(sessionId);
    if (!targetSession) {
      this.createSession(sessionId);
      targetSession = this.sessions.get(sessionId)!;
    }
    
    targetSession.lastUpdated = new Date();
    this.saveSession(targetSession);
    
    const sessionHistory = targetSession.conversationHistory;
    console.log(`[SessionManager] Loaded session ${sessionId} with ${sessionHistory.length} messages`);
  }

  /**
   * Get current session ID
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): void {
    console.log(`[SessionManager] Deleting session: ${sessionId}`);
    
    // Remove from memory
    this.sessions.delete(sessionId);
    
    // Remove from disk
    try {
      const sessionPath = this.getSessionPath(sessionId);
      if (fs.existsSync(sessionPath)) {
        fs.unlinkSync(sessionPath);
      }
    } catch (error) {
      console.error(`[SessionManager] Failed to delete session file ${sessionId}:`, error);
    }
    
    // If deleting current session, clear current state
    if (this.currentSessionId === sessionId) {
      this.currentSessionId = null;
    }
  }

  /**
   * Get all session IDs
   */
  getSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Get sessions info for frontend (sorted by lastUpdated)
   */
  getSessionsInfo(): SessionInfo[] {
    const sessionsInfo = Array.from(this.sessions.values()).map(session => ({
      id: session.id,
      title: session.title,
      messageCount: session.conversationHistory.filter(msg => 
        !msg.content.startsWith('Tool response:') && 
        !msg.content.startsWith('Tool execution completed successfully')
      ).length, // Count display messages only
      lastUpdated: session.lastUpdated
    }));
    
    // Sort by lastUpdated (most recent first)
    sessionsInfo.sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());
    
    console.log(`[SessionManager] Retrieved info for ${sessionsInfo.length} sessions`);
    return sessionsInfo;
  }

  /**
   * Update session title
   */
  updateSessionTitle(sessionId: string, newTitle: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.title = newTitle;
      session.lastUpdated = new Date();
      console.log(`[SessionManager] Updated session ${sessionId} title to: ${newTitle}`);
      this.saveSession(session);
    }
  }

  /**
   * Update session metadata
   */
  updateSessionMetadata(sessionId: string, metadata: Partial<SessionData['metadata']>): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.metadata = { ...session.metadata, ...metadata };
      session.lastUpdated = new Date();
      this.saveSession(session);
    }
  }

  /**
   * Add a message to session history
   */
  addHistory(message: UniversalMessage): void {   
    if (this.currentSessionId) {
      const session = this.sessions.get(this.currentSessionId);
      if (session) {
        session.conversationHistory.push(message);
        session.lastUpdated = new Date();
        this.saveSession(session);
      }
    } 
  }

  /**
   * Get conversation history for current session
   */
  getHistory(): readonly UniversalMessage[] {
    if (this.currentSessionId) {
      const session = this.sessions.get(this.currentSessionId);
      return session?.conversationHistory || [];
    } 
    return [];
  }

  /**
   * Set conversation history for current session
   */
  setHistory(history: UniversalMessage[]): void {
    if (this.currentSessionId) {
      const session = this.sessions.get(this.currentSessionId);
      if (session) {
        session.conversationHistory = [...history];
        session.lastUpdated = new Date();
        this.saveSession(session);
      }
    }
  }

  /**
   * Clear conversation history for current session
   */
  clearHistory(): void {
    if (this.currentSessionId && this.sessions.has(this.currentSessionId)) {
      const session = this.sessions.get(this.currentSessionId)!;
      session.conversationHistory = [];
      session.lastUpdated = new Date();
      this.saveSession(session);
    }
  }

  /**
   * Get display messages for UI (include all messages including tools)
   */
  getDisplayMessages(sessionId?: string): UniversalMessage[] {
    const targetSessionId = sessionId || this.currentSessionId;
    if (!targetSessionId) {
      return [];
    }
    
    const session = this.sessions.get(targetSessionId);
    if (!session) {
      return [];
    }
    
    // Return all conversation history without filtering
    const displayMessages = session.conversationHistory;
    
    console.log(`[SessionManager] Retrieved ${displayMessages.length} display messages for session ${targetSessionId}`);
    return displayMessages;
  }

  /**
   * Generate title from first user message
   */
  generateTitleFromMessage(message: string): string {
    // Remove line breaks and trim
    const cleanMessage = message.replace(/\n+/g, ' ').trim();
    
    // Truncate to 30 characters
    if (cleanMessage.length <= 30) {
      return cleanMessage;
    }
    
    // Find a good break point (space) near 30 chars
    const truncated = cleanMessage.substring(0, 30);
    const lastSpaceIndex = truncated.lastIndexOf(' ');
    
    if (lastSpaceIndex > 15) { // If there's a space reasonably close to the end
      return cleanMessage.substring(0, lastSpaceIndex) + '...';
    } else {
      return truncated + '...';
    }
  }

  /**
   * Generate intelligent title using LLM when user sends exactly 3rd message
   */
  async generateIntelligentTitle(
    sessionId: string, 
    currentProvider?: { type: string; model: string }
  ): Promise<string | null> {
    if (!this.createModelProvider || !currentProvider) {
      return null;
    }

    try {
      const session = this.sessions.get(sessionId);
      if (!session) return null;

      // Get display messages (without tool messages)
      const displayMessages = session.conversationHistory.filter(msg => 
        !msg.content.startsWith('Tool response:') && 
        !msg.content.startsWith('Tool execution completed successfully')
      );

      // Only generate when user has exactly 3 messages (after 3rd message is sent)
      const userMessages = displayMessages.filter(msg => msg.role === 'user');
      if (userMessages.length !== 3) {
        return null;
      }

      // Create a conversation summary prompt
      const conversationText = displayMessages
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n');

      const titlePrompt = `Based on this conversation, generate a short, descriptive title (max 40 characters). Only respond with the title, no explanation:

${conversationText}

Title:`;

      // Use current provider to generate title
      const providerConfig: ModelProviderConfig = {
        type: currentProvider.type as ModelProviderType,
        model: currentProvider.model
      };
      
      const provider = this.createModelProvider!(providerConfig, this.config!);
      
      const titleResponse = await provider.sendMessage(
        [{ role: 'user', content: titlePrompt }],
        new AbortController().signal
      );

      const generatedTitle = titleResponse.content.trim().replace(/^["']|["']$/g, ''); // Remove quotes if any
      
      // Validate and clean the generated title
      if (generatedTitle && generatedTitle.length > 0 && generatedTitle.length <= 50) {
        console.log(`[SessionManager] LLM generated title for session ${sessionId}: ${generatedTitle}`);
        this.updateSessionTitle(sessionId, generatedTitle);
        return generatedTitle;
      }

      return null;
    } catch (error) {
      console.error('[SessionManager] Failed to generate intelligent title:', error);
      return null;
    }
  }

  /**
   * Handle auto-title generation based on message flow
   */
  handleAutoTitleGeneration(
    message: UniversalMessage
  ): void {
    if (message.role === 'user' && this.currentSessionId) {
      const session = this.sessions.get(this.currentSessionId);
      if (session && session.title === 'New Chat' && session.conversationHistory.length === 1) {
        // This is the first message in a new session
        const newTitle = this.generateTitleFromMessage(message.content);
        this.updateSessionTitle(this.currentSessionId, newTitle);
      }
    }
  }

  /**
   * Trigger intelligent title generation if conditions are met
   */
  async triggerIntelligentTitleGeneration(
    sessionId: string,
    currentProvider?: { type: string; model: string }
  ): Promise<void> {
    try {
      const intelligentTitle = await this.generateIntelligentTitle(sessionId, currentProvider);
      if (intelligentTitle) {
        this.updateSessionTitle(sessionId, intelligentTitle);
      }
    } catch (error) {
      console.error('[SessionManager] Error generating intelligent title:', error);
    }
  }
}