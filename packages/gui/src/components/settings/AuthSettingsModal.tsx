/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAppStore } from '@/stores/appStore';
import { multiModelService } from '@/services/multiModelService';
import { X, Key, User, CheckCircle, AlertTriangle } from 'lucide-react';

interface AuthSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export const AuthSettingsModal: React.FC<AuthSettingsModalProps> = ({ open, onClose }) => {
  const { authConfig, updateAuthConfig } = useAppStore();
  const [authType, setAuthType] = useState<'oauth' | 'api_key'>('api_key');
  const [envApiKeyDetected, setEnvApiKeyDetected] = useState(false);
  const [oauthStatus, setOauthStatus] = useState<{ authenticated: boolean; userEmail?: string }>({ 
    authenticated: false 
  });
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (open) {
      loadCurrentSettings();
      checkOAuthStatus();
      setMessage(null);
    }
  }, [open]);

  const loadCurrentSettings = async () => {
    const geminiConfig = authConfig.gemini;
    if (geminiConfig) {
      setAuthType(geminiConfig.type || 'api_key');
    }
    
    // Check if GEMINI_API_KEY environment variable is set
    await checkEnvironmentApiKey();
  };
  
  const checkEnvironmentApiKey = async () => {
    try {
      const result = await multiModelService.checkEnvApiKey('gemini');
      setEnvApiKeyDetected(result.detected);
      console.log(`Environment API key check: ${result.detected ? 'detected' : 'not detected'} from ${result.source}`);
    } catch (error) {
      console.error('Failed to check environment API key:', error);
      setEnvApiKeyDetected(false);
    }
  };

  const checkOAuthStatus = async () => {
    try {
      const status = await multiModelService.getOAuthStatus('gemini');
      setOauthStatus(status);
    } catch (error) {
      console.error('Failed to check OAuth status:', error);
      setOauthStatus({ authenticated: false });
    }
  };

  const handleOAuthLogin = async () => {
    setIsAuthenticating(true);
    setMessage(null);
    
    try {
      console.log('Starting OAuth flow...');
      const result = await multiModelService.startOAuthFlow('gemini');
      
      if (result.success) {
        // Update configuration to use OAuth
        updateAuthConfig({
          gemini: {
            type: 'oauth',
            oauthToken: 'authenticated' // We don't store the actual token in frontend
          }
        });
        
        // Refresh OAuth status
        await checkOAuthStatus();
        
        setMessage({
          type: 'success',
          text: result.message || 'Authentication successful!'
        });
        
        // Auto-close modal after successful authentication
        setTimeout(() => {
          onClose();
        }, 1500); // Give user time to see the success message
      } else {
        throw new Error(result.error || 'OAuth authentication failed');
      }
    } catch (error) {
      console.error('OAuth authentication error:', error);
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Authentication failed'
      });
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleOAuthLogout = async () => {
    try {
      const result = await multiModelService.clearOAuthCredentials('gemini');
      
      if (result.success) {
        // Update configuration to remove OAuth
        updateAuthConfig({
          gemini: {
            type: 'api_key',
            oauthToken: undefined
          }
        });
        
        setOauthStatus({ authenticated: false });
        setMessage({
          type: 'success',
          text: 'Signed out successfully'
        });
      } else {
        throw new Error(result.error || 'Failed to sign out');
      }
    } catch (error) {
      console.error('Failed to clear OAuth credentials:', error);
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to sign out'
      });
    }
  };

  const handleSwitchToApiKey = () => {
    if (!envApiKeyDetected) {
      setMessage({
        type: 'error',
        text: 'No GEMINI_API_KEY environment variable detected. Please set the environment variable and restart the application.'
      });
      return;
    }

    updateAuthConfig({
      gemini: {
        type: 'api_key',
        oauthToken: undefined
      }
    });
    
    setMessage({
      type: 'success',
      text: 'Switched to API key authentication'
    });
    
    // Auto-close modal after successful switch
    setTimeout(() => {
      onClose();
    }, 1500);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card rounded-lg shadow-lg p-6 max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Google Gemini Authentication</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X size={20} />
          </Button>
        </div>

        {/* Message */}
        {message && (
          <div className={`flex items-center gap-2 p-3 rounded-md mb-4 ${
            message.type === 'success' 
              ? 'bg-green-50 text-green-800 border border-green-200' 
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {message.type === 'success' ? (
              <CheckCircle size={16} />
            ) : (
              <AlertTriangle size={16} />
            )}
            <span className="text-sm">{message.text}</span>
          </div>
        )}
        
        {/* Authentication Method Selection */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium mb-3">Authentication Method</label>
            <div className="space-y-3">
              <label className="flex items-center p-3 border rounded-md cursor-pointer hover:bg-accent/50 transition-colors">
                <input
                  type="radio"
                  value="api_key"
                  checked={authType === 'api_key'}
                  onChange={(e) => setAuthType(e.target.value as 'api_key')}
                  className="mr-3"
                />
                <Key size={16} className="mr-2 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">API Key</div>
                  <div className="text-xs text-muted-foreground">Use your Gemini API key</div>
                </div>
              </label>
              
              <label className="flex items-center p-3 border rounded-md cursor-pointer hover:bg-accent/50 transition-colors">
                <input
                  type="radio"
                  value="oauth"
                  checked={authType === 'oauth'}
                  onChange={(e) => setAuthType(e.target.value as 'oauth')}
                  className="mr-3"
                />
                <User size={16} className="mr-2 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">Google OAuth (Recommended)</div>
                  <div className="text-xs text-muted-foreground">Sign in with your Google account</div>
                </div>
              </label>
            </div>
          </div>

          {/* API Key Configuration */}
          {authType === 'api_key' && (
            <Card className="p-4">
              <div className="space-y-3">
                <label className="block text-sm font-medium">Environment API Key</label>
                <div className="p-3 bg-accent/30 rounded-md border">
                  {envApiKeyDetected ? (
                    <div className="flex items-center text-green-600">
                      <CheckCircle size={16} className="mr-2" />
                      <span className="text-sm">GEMINI_API_KEY environment variable detected</span>
                    </div>
                  ) : (
                    <div className="flex items-center text-amber-600">
                      <AlertTriangle size={16} className="mr-2" />
                      <span className="text-sm">GEMINI_API_KEY environment variable not found</span>
                    </div>
                  )}
                </div>
                
                {!envApiKeyDetected && (
                  <div className="text-xs text-muted-foreground">
                    To use API key authentication, set the <code className="bg-accent px-1 rounded">GEMINI_API_KEY</code> environment variable with your API key from{' '}
                    <a 
                      href="https://makersuite.google.com/app/apikey" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      Google AI Studio
                    </a>{' '}
                    and restart the application.
                  </div>
                )}
                
                <Button 
                  onClick={handleSwitchToApiKey} 
                  disabled={!envApiKeyDetected}
                  className="w-full"
                >
                  {envApiKeyDetected ? 'Use API Key Authentication' : 'API Key Not Available'}
                </Button>
              </div>
            </Card>
          )}

          {/* OAuth Configuration */}
          {authType === 'oauth' && (
            <Card className="p-4">
              <div className="space-y-4">
                {oauthStatus.authenticated ? (
                  <div className="text-sm">
                    <div className="flex items-center text-green-600 mb-2">
                      <CheckCircle size={16} className="mr-2" />
                      Authenticated
                    </div>
                    {oauthStatus.userEmail && (
                      <div className="text-muted-foreground mb-4">
                        Signed in as: <span className="font-medium">{oauthStatus.userEmail}</span>
                      </div>
                    )}
                    <Button 
                      onClick={handleOAuthLogout} 
                      variant="outline" 
                      className="w-full"
                    >
                      Sign Out
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Sign in with your Google account to access Gemini API. This will open your browser for authentication.
                    </p>
                    <Button 
                      onClick={handleOAuthLogin}
                      disabled={isAuthenticating}
                      className="w-full"
                    >
                      {isAuthenticating ? 'Authenticating...' : 'Sign in with Google'}
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};