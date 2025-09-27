package auth

import (
	"testing"
)

func TestNewAuthenticator(t *testing.T) {
	// Test with a supported type
	auth, err := NewAuthenticator("cloud-shell")
	if err != nil {
		t.Errorf("Expected no error for supported auth type 'cloud-shell', but got %v", err)
	}
	if _, ok := auth.(*CloudShellAuthenticator); !ok {
		t.Errorf("Expected CloudShellAuthenticator, but got %T", auth)
	}

	// Test with another supported type
	auth, err = NewAuthenticator("oauth2")
	if err != nil {
		t.Errorf("Expected no error for supported auth type 'oauth2', but got %v", err)
	}
	if _, ok := auth.(*OAuth2Authenticator); !ok {
		t.Errorf("Expected OAuth2Authenticator, but got %T", auth)
	}

	// Test with an unsupported type
	_, err = NewAuthenticator("unsupported-type")
	if err == nil {
		t.Errorf("Expected an error for unsupported auth type, but got nil")
	}
}

func TestCloudShellAuthenticator_GetTokenUnauthenticated(t *testing.T) {
	auth := &CloudShellAuthenticator{}
	_, err := auth.GetToken()
	if err == nil {
		t.Errorf("Expected an error when getting token from unauthenticated authenticator, but got nil")
	}
	expectedError := "not authenticated"
	if err.Error() != expectedError {
		t.Errorf("Expected error message '%s', but got '%s'", expectedError, err.Error())
	}
}

func TestOAuth2Authenticator_GetTokenUnauthenticated(t *testing.T) {
	auth := &OAuth2Authenticator{}
	_, err := auth.GetToken()
	if err == nil {
		t.Errorf("Expected an error when getting token from unauthenticated authenticator, but got nil")
	}
	expectedError := "not authenticated"
	if err.Error() != expectedError {
		t.Errorf("Expected error message '%s', but got '%s'", expectedError, err.Error())
	}
}