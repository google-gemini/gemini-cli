#!/usr/bin/env node

/**
 * SECURITY REGRESSION DEMO - Issue #8077
 * Demonstrates how environment variables leak to plaintext in saved settings
 */

const fs = require('fs');
const path = require('path');

// Simulate the settings functionality (simplified version)
function demonstrateSecurityRegression() {
  console.log('🔐 SECURITY REGRESSION DEMO - Issue #8077');
  console.log('================================================\n');

  // Step 1: Set up environment variables with sensitive data
  console.log('📝 Step 1: Setting up environment variables...');
  process.env['API_KEY'] = 'sk-1234567890abcdef-super-secret-key';
  process.env['DATABASE_PASSWORD'] = 'my-super-secret-db-password-2024';
  process.env['JWT_SECRET'] = 'ultra-secret-jwt-signing-key-abcdef123456';

  console.log('✅ Environment variables set:');
  console.log(`   API_KEY: ${process.env['API_KEY']}`);
  console.log(`   DATABASE_PASSWORD: ${process.env['DATABASE_PASSWORD']}`);
  console.log(`   JWT_SECRET: ${process.env['JWT_SECRET']}\n`);

  // Step 2: Create initial settings file with environment variable references
  console.log('📄 Step 2: Creating settings file with environment variable references...');
  const initialSettings = {
    api: {
      key: '$API_KEY',
      endpoint: 'https://api.example.com/v1'
    },
    database: {
      password: '$DATABASE_PASSWORD',
      host: 'localhost'
    },
    security: {
      jwtSecret: '$JWT_SECRET',
      algorithm: 'HS256'
    },
    model: {
      name: 'gemini-pro'
    }
  };

  const settingsPath = path.join(__dirname, 'settings.json');
  fs.writeFileSync(settingsPath, JSON.stringify(initialSettings, null, 2));
  console.log('✅ Initial settings.json created:');
  console.log(fs.readFileSync(settingsPath, 'utf-8'));
  console.log();

  // Step 3: Simulate the settings loading process (with environment variable resolution)
  console.log('🔄 Step 3: Loading settings (simulating environment variable resolution)...');

  function resolveEnvVars(obj) {
    if (typeof obj === 'string') {
      // Simple environment variable resolution
      return obj.replace(/\$([A-Z_]+)/g, (match, varName) => {
        return process.env[varName] || match;
      });
    } else if (Array.isArray(obj)) {
      return obj.map(resolveEnvVars);
    } else if (obj && typeof obj === 'object') {
      const resolved = {};
      for (const [key, value] of Object.entries(obj)) {
        resolved[key] = resolveEnvVars(value);
      }
      return resolved;
    }
    return obj;
  }

  const loadedSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  const resolvedSettings = resolveEnvVars(loadedSettings);

  console.log('✅ Settings loaded and environment variables resolved in memory:');
  console.log('   Note: This is what the application sees internally\n');

  // Step 4: Simulate user modifying a setting
  console.log('👤 Step 4: User modifies a setting (changes model name)...');
  resolvedSettings.model.name = 'gemini-pro-vision';

  console.log('✅ User changed model.name from "gemini-pro" to "gemini-pro-vision"');
  console.log();

  // Step 5: Demonstrate the SECURITY VULNERABILITY - saving resolved settings
  console.log('💀 Step 5: CRITICAL SECURITY VULNERABILITY - Saving settings...');
  console.log('   ❌ BUG: Saving resolved values instead of preserving environment variable references');

  fs.writeFileSync(settingsPath, JSON.stringify(resolvedSettings, null, 2));

  console.log('✅ Settings saved. Let\'s check what was actually saved to disk:');
  console.log('='.repeat(70));
  const savedContent = fs.readFileSync(settingsPath, 'utf-8');
  console.log(savedContent);
  console.log('='.repeat(70));
  console.log();

  // Step 6: Analyze the security breach
  console.log('🔍 Step 6: SECURITY BREACH ANALYSIS');
  console.log('=====================================\n');

  const securityIssues = [];

  if (savedContent.includes('sk-1234567890abcdef-super-secret-key')) {
    securityIssues.push('❌ API_KEY leaked to plaintext in settings.json');
  }

  if (savedContent.includes('my-super-secret-db-password-2024')) {
    securityIssues.push('❌ DATABASE_PASSWORD leaked to plaintext in settings.json');
  }

  if (savedContent.includes('ultra-secret-jwt-signing-key-abcdef123456')) {
    securityIssues.push('❌ JWT_SECRET leaked to plaintext in settings.json');
  }

  if (savedContent.includes('$API_KEY') === false) {
    securityIssues.push('❌ Original $API_KEY reference lost');
  }

  if (savedContent.includes('$DATABASE_PASSWORD') === false) {
    securityIssues.push('❌ Original $DATABASE_PASSWORD reference lost');
  }

  if (savedContent.includes('$JWT_SECRET') === false) {
    securityIssues.push('❌ Original $JWT_SECRET reference lost');
  }

  if (securityIssues.length > 0) {
    console.log('🚨 CRITICAL SECURITY VULNERABILITIES DETECTED:');
    securityIssues.forEach(issue => console.log(`   ${issue}`));
    console.log();
    console.log('💥 IMPACT:');
    console.log('   • Sensitive credentials permanently exposed in configuration files');
    console.log('   • Secrets committed to version control if settings.json is tracked');
    console.log('   • Security breach occurs from normal user workflow (changing any setting)');
    console.log('   • No user interaction required - happens silently');
  } else {
    console.log('✅ No security issues detected');
  }

  console.log();
  console.log('🎯 CONCLUSION:');
  console.log('   This demonstrates the exact vulnerability described in Issue #8077.');
  console.log('   When users modify ANY setting, ALL environment variables get resolved');
  console.log('   to plaintext and saved permanently, creating a critical security breach.');
  console.log();
  console.log('🔧 REQUIRED FIX:');
  console.log('   The saveSettings function must preserve original environment variable');
  console.log('   references instead of saving resolved values.');

  // Cleanup
  try {
    fs.unlinkSync(settingsPath);
  } catch (e) {
    // Ignore cleanup errors
  }
}

// Run the demonstration
demonstrateSecurityRegression();