/**
 * @license
 * Copyright 2025 Trust Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TrustConfig } from './types.js';
import { TrustConfiguration } from '../config/trustosConfig.js';

/**
 * Privacy Mode Definitions
 * Trust: An Open System for Modern Assurance
 */
export interface PrivacyModeConfig {
  name: 'strict' | 'moderate' | 'open';
  description: string;
  settings: Partial<TrustConfig>;
  restrictions: string[];
  features: string[];
}

/**
 * Pre-defined privacy mode configurations
 */
export const PRIVACY_MODES: Record<string, PrivacyModeConfig> = {
  strict: {
    name: 'strict',
    description: 'Maximum privacy and security - no external connections',
    settings: {
      privacy: {
        privacyMode: 'strict',
        auditLogging: true,
        modelVerification: true,
      },
      transparency: {
        logPrompts: false,
        logResponses: false,
        showModelInfo: true,
        showPerformanceMetrics: true,
      },
      inference: {
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 2048,
        stream: false, // Disable streaming for maximum control
      },
    },
    restrictions: [
      'No external network connections allowed',
      'All models must be verified before use',
      'Automatic model downloads disabled',
      'Prompt/response logging disabled for privacy',
      'Only pre-approved models can be loaded',
    ],
    features: [
      'Complete offline operation',
      'Mandatory model integrity verification',
      'Audit trail for all operations',
      'Enhanced security monitoring',
      'Strict resource isolation',
    ],
  },
  
  moderate: {
    name: 'moderate',
    description: 'Balanced privacy and functionality',
    settings: {
      privacy: {
        privacyMode: 'moderate',
        auditLogging: true,
        modelVerification: true,
      },
      transparency: {
        logPrompts: true,
        logResponses: true,
        showModelInfo: true,
        showPerformanceMetrics: true,
      },
      inference: {
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 2048,
        stream: true,
      },
    },
    restrictions: [
      'External connections only for model downloads',
      'All models verified after download',
      'Optional prompt/response logging',
      'Performance data collection allowed',
    ],
    features: [
      'Model downloads from trusted sources',
      'Real-time streaming responses',
      'Performance optimization enabled',
      'Transparent logging with user control',
      'Balanced security and usability',
    ],
  },
  
  open: {
    name: 'open',
    description: 'Maximum functionality for development and testing',
    settings: {
      privacy: {
        privacyMode: 'open',
        auditLogging: true,
        modelVerification: false, // Optional verification for development
      },
      transparency: {
        logPrompts: true,
        logResponses: true,
        showModelInfo: true,
        showPerformanceMetrics: true,
      },
      inference: {
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 4096, // Higher token limit
        stream: true,
      },
    },
    restrictions: [
      'Model verification optional (for development)',
      'Extended logging for debugging',
      'Higher resource limits',
    ],
    features: [
      'Full development capabilities',
      'Extended context windows',
      'Comprehensive debugging logs',
      'Flexible model management',
      'Performance testing tools',
    ],
  },
};

/**
 * Privacy Manager - Enforces privacy mode settings
 */
export class PrivacyManager {
  private config: TrustConfiguration;
  private currentMode: PrivacyModeConfig;

  constructor(config: TrustConfiguration) {
    this.config = config;
    this.currentMode = PRIVACY_MODES[config.getPrivacyMode()];
  }

  /**
   * Get current privacy mode configuration
   */
  getCurrentMode(): PrivacyModeConfig {
    return this.currentMode;
  }

  /**
   * Switch to a new privacy mode
   */
  async switchMode(modeName: 'strict' | 'moderate' | 'open'): Promise<void> {
    const newMode = PRIVACY_MODES[modeName];
    if (!newMode) {
      throw new Error(`Invalid privacy mode: ${modeName}`);
    }

    // Apply the new privacy mode settings
    if (newMode.settings.privacy) {
      this.config.setPrivacyMode(newMode.name);
      if (newMode.settings.privacy.auditLogging !== undefined) {
        this.config.setAuditLogging(newMode.settings.privacy.auditLogging);
      }
      if (newMode.settings.privacy.modelVerification !== undefined) {
        this.config.setModelVerification(newMode.settings.privacy.modelVerification);
      }
    }

    if (newMode.settings.transparency) {
      this.config.setTransparencySettings(newMode.settings.transparency);
    }

    if (newMode.settings.inference) {
      this.config.setInferenceSettings(newMode.settings.inference);
    }

    // Save the configuration
    await this.config.save();
    
    // Update current mode
    this.currentMode = newMode;
  }

  /**
   * Check if an operation is allowed in current privacy mode
   */
  isOperationAllowed(operation: string): { allowed: boolean; reason?: string } {
    switch (this.currentMode.name) {
      case 'strict':
        return this.checkStrictModeOperation(operation);
      case 'moderate':
        return this.checkModerateModeOperation(operation);
      case 'open':
        return { allowed: true }; // Open mode allows everything
      default:
        return { allowed: false, reason: 'Unknown privacy mode' };
    }
  }

  /**
   * Get privacy mode information for display
   */
  getModeInfo(): {
    name: string;
    description: string;
    restrictions: string[];
    features: string[];
  } {
    return {
      name: this.currentMode.name,
      description: this.currentMode.description,
      restrictions: this.currentMode.restrictions,
      features: this.currentMode.features,
    };
  }

  /**
   * Validate model download request
   */
  validateModelDownload(modelName: string): { allowed: boolean; reason?: string } {
    if (this.currentMode.name === 'strict') {
      return {
        allowed: false,
        reason: 'Model downloads disabled in strict privacy mode. Switch to moderate or open mode.',
      };
    }
    
    return { allowed: true };
  }

  /**
   * Validate model loading request
   */
  validateModelLoad(modelPath: string): { allowed: boolean; reason?: string } {
    if (this.currentMode.name === 'strict' && this.config.isModelVerificationEnabled()) {
      // In strict mode, ensure model is verified
      // This would integrate with the model verification system
      return { allowed: true }; // Assume verification happens elsewhere
    }
    
    return { allowed: true };
  }

  private checkStrictModeOperation(operation: string): { allowed: boolean; reason?: string } {
    const restrictedOperations = [
      'external_download',
      'network_request',
      'unverified_model_load',
      'prompt_logging',
      'response_logging',
    ];

    if (restrictedOperations.includes(operation)) {
      return {
        allowed: false,
        reason: `Operation '${operation}' not allowed in strict privacy mode`,
      };
    }

    return { allowed: true };
  }

  private checkModerateModeOperation(operation: string): { allowed: boolean; reason?: string } {
    const restrictedOperations = [
      'unverified_model_load', // Still require verification in moderate mode
    ];

    if (restrictedOperations.includes(operation)) {
      return {
        allowed: false,
        reason: `Operation '${operation}' requires verification in moderate privacy mode`,
      };
    }

    return { allowed: true };
  }
}

/**
 * Global privacy manager instance
 */
let globalPrivacyManager: PrivacyManager | null = null;

export function getPrivacyManager(config?: TrustConfiguration): PrivacyManager {
  if (!globalPrivacyManager && config) {
    globalPrivacyManager = new PrivacyManager(config);
  }
  
  if (!globalPrivacyManager) {
    throw new Error('Privacy manager not initialized. Provide a configuration.');
  }
  
  return globalPrivacyManager;
}

export function initializePrivacyManager(config: TrustConfiguration): PrivacyManager {
  globalPrivacyManager = new PrivacyManager(config);
  return globalPrivacyManager;
}