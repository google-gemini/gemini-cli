/**
 * @license
 * Copyright 2025 Trust Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TrustConfiguration } from '@trustos/trust-cli-core';
import { PrivacyManager, PRIVACY_MODES } from '../../../core/src/trustos/privacyManager.js';

export interface PrivacyCommandArgs {
  action: 'status' | 'switch' | 'list' | 'info';
  mode?: 'strict' | 'moderate' | 'open';
  verbose?: boolean;
}

export class PrivacyCommandHandler {
  private config: TrustConfiguration;
  private privacyManager: PrivacyManager;

  constructor() {
    this.config = new TrustConfiguration();
  }

  async initialize(): Promise<void> {
    await this.config.initialize();
    this.privacyManager = new PrivacyManager(this.config);
  }

  async handleCommand(args: PrivacyCommandArgs): Promise<void> {
    await this.initialize();

    switch (args.action) {
      case 'status':
        await this.showPrivacyStatus(args.verbose);
        break;
      case 'switch':
        if (!args.mode) {
          throw new Error('Privacy mode required for switch command');
        }
        await this.switchPrivacyMode(args.mode);
        break;
      case 'list':
        await this.listPrivacyModes();
        break;
      case 'info':
        await this.showModeInfo(args.mode);
        break;
      default:
        throw new Error(`Unknown privacy command: ${args.action}`);
    }
  }

  private async showPrivacyStatus(verbose = false): Promise<void> {
    const currentMode = this.privacyManager.getCurrentMode();
    const modeInfo = this.privacyManager.getModeInfo();
    
    console.log('\\n🛡️  Trust CLI - Privacy Status');
    console.log('═'.repeat(50));
    console.log(`Current Mode: ${currentMode.name.toUpperCase()}`);
    console.log(`Description: ${modeInfo.description}`);
    
    const config = this.config.get();
    console.log('\\n⚙️  Active Settings:');
    console.log(`   Model Verification: ${config.privacy.modelVerification ? 'enabled' : 'disabled'}`);
    console.log(`   Audit Logging: ${config.privacy.auditLogging ? 'enabled' : 'disabled'}`);
    console.log(`   Prompt Logging: ${config.transparency.logPrompts ? 'enabled' : 'disabled'}`);
    console.log(`   Response Logging: ${config.transparency.logResponses ? 'enabled' : 'disabled'}`);
    console.log(`   Streaming: ${config.inference.stream ? 'enabled' : 'disabled'}`);
    console.log(`   Max Tokens: ${config.inference.maxTokens}`);

    if (verbose) {
      console.log('\\n🔒 Privacy Restrictions:');
      modeInfo.restrictions.forEach(restriction => {
        console.log(`   • ${restriction}`);
      });

      console.log('\\n✨ Available Features:');
      modeInfo.features.forEach(feature => {
        console.log(`   • ${feature}`);
      });
    }

    console.log('\\n💡 Use \"trust privacy switch <mode>\" to change privacy levels');
    console.log('💡 Use \"trust privacy list\" to see all available modes');
  }

  private async switchPrivacyMode(mode: 'strict' | 'moderate' | 'open'): Promise<void> {
    const currentMode = this.privacyManager.getCurrentMode();
    
    if (currentMode.name === mode) {
      console.log(`\\n✅ Already in ${mode} privacy mode`);
      return;
    }

    console.log(`\\n🔄 Switching from ${currentMode.name} to ${mode} privacy mode...`);
    
    try {
      await this.privacyManager.switchMode(mode);
      
      const newMode = PRIVACY_MODES[mode];
      console.log(`✅ Successfully switched to ${mode} privacy mode`);
      console.log(`📝 ${newMode.description}`);
      
      // Show key changes
      console.log('\\n🔧 Key Settings Updated:');
      if (newMode.settings.privacy?.modelVerification !== undefined) {
        console.log(`   Model Verification: ${newMode.settings.privacy.modelVerification ? 'enabled' : 'disabled'}`);
      }
      if (newMode.settings.privacy?.auditLogging !== undefined) {
        console.log(`   Audit Logging: ${newMode.settings.privacy.auditLogging ? 'enabled' : 'disabled'}`);
      }
      if (newMode.settings.inference?.stream !== undefined) {
        console.log(`   Streaming: ${newMode.settings.inference.stream ? 'enabled' : 'disabled'}`);
      }
      if (newMode.settings.inference?.maxTokens !== undefined) {
        console.log(`   Max Tokens: ${newMode.settings.inference.maxTokens}`);
      }
      
      // Show important warnings for strict mode
      if (mode === 'strict') {
        console.log('\\n⚠️  Strict Mode Restrictions:');
        console.log('   • Model downloads are disabled');
        console.log('   • Only verified models can be loaded');
        console.log('   • No external network connections allowed');
        console.log('\\n💡 Switch to moderate mode to enable model downloads');
      }
      
    } catch (error) {
      console.error(`❌ Failed to switch privacy mode: ${error}`);
      throw error;
    }
  }

  private async listPrivacyModes(): Promise<void> {
    const currentMode = this.privacyManager.getCurrentMode();
    
    console.log('\\n🛡️  Trust CLI - Available Privacy Modes');
    console.log('═'.repeat(60));
    
    Object.values(PRIVACY_MODES).forEach(mode => {
      const isCurrent = currentMode.name === mode.name;
      const indicator = isCurrent ? '→' : ' ';
      const status = isCurrent ? ' (current)' : '';
      
      console.log(`\\n${indicator} ${mode.name.toUpperCase()}${status}`);
      console.log(`   ${mode.description}`);
      
      // Show key features
      console.log('   Key Features:');
      mode.features.slice(0, 3).forEach(feature => {
        console.log(`     • ${feature}`);
      });
      
      if (mode.features.length > 3) {
        console.log(`     • ... and ${mode.features.length - 3} more features`);
      }
    });
    
    console.log('\\n💡 Use \"trust privacy switch <mode>\" to change modes');
    console.log('💡 Use \"trust privacy info <mode>\" for detailed information');
  }

  private async showModeInfo(mode?: 'strict' | 'moderate' | 'open'): Promise<void> {
    const targetMode = mode || this.privacyManager.getCurrentMode().name;
    const modeConfig = PRIVACY_MODES[targetMode];
    
    if (!modeConfig) {
      console.error(`❌ Invalid privacy mode: ${targetMode}`);
      console.log('Available modes: strict, moderate, open');
      return;
    }
    
    const isCurrent = this.privacyManager.getCurrentMode().name === targetMode;
    
    console.log(`\\n🛡️  Privacy Mode: ${modeConfig.name.toUpperCase()}${isCurrent ? ' (current)' : ''}`);
    console.log('═'.repeat(60));
    console.log(`${modeConfig.description}`);
    
    console.log('\\n🔒 Privacy Restrictions:');
    modeConfig.restrictions.forEach(restriction => {
      console.log(`   • ${restriction}`);
    });
    
    console.log('\\n✨ Available Features:');
    modeConfig.features.forEach(feature => {
      console.log(`   • ${feature}`);
    });
    
    console.log('\\n⚙️  Configuration Settings:');
    if (modeConfig.settings.privacy) {
      console.log('   Privacy:');
      Object.entries(modeConfig.settings.privacy).forEach(([key, value]) => {
        console.log(`     ${key}: ${value}`);
      });
    }
    
    if (modeConfig.settings.inference) {
      console.log('   Inference:');
      Object.entries(modeConfig.settings.inference).forEach(([key, value]) => {
        console.log(`     ${key}: ${value}`);
      });
    }
    
    if (modeConfig.settings.transparency) {
      console.log('   Transparency:');
      Object.entries(modeConfig.settings.transparency).forEach(([key, value]) => {
        console.log(`     ${key}: ${value}`);
      });
    }
    
    if (!isCurrent) {
      console.log(`\\n💡 Use \"trust privacy switch ${targetMode}\" to activate this mode`);
    }
  }
}

export async function handlePrivacyCommand(args: PrivacyCommandArgs): Promise<void> {
  const handler = new PrivacyCommandHandler();
  await handler.handleCommand(args);
}