package auth

import (
	"context"
	"fmt"
	"os"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

const (
	oauthClientID = "733539399381-m8v23olicibo1l58g2hgsn0bh3f3a47a.apps.googleusercontent.com"
  oauthClientSecret = "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"
)

// Authenticator is the interface for different authentication methods.
type Authenticator interface {
	Authenticate() error
	// GetToken returns the authentication token.
	GetToken() (string, error)
}

// NewAuthenticator returns a new authenticator based on the provided type.
func NewAuthenticator(authType string) (Authenticator, error) {
	switch authType {
	case "oauth2":
		return &OAuth2Authenticator{}, nil
	case "cloud-shell":
		return &CloudShellAuthenticator{}, nil
	default:
		return nil, fmt.Errorf("unsupported authentication type: %s", authType)
	}
}

// OAuth2Authenticator handles OAuth2 authentication.
type OAuth2Authenticator struct {
	config *oauth2.Config
	token  *oauth2.Token
}

// Authenticate performs OAuth2 authentication.
func (a *OAuth2Authenticator) Authenticate() error {

	a.config = &oauth2.Config{
		ClientID:     oauthClientID,
		ClientSecret: oauthClientSecret,
		RedirectURL:  "urn:ietf:wg:oauth:2.0:oob",
		Scopes:       []string{"https://www.googleapis.com/auth/cloud-platform"},
		Endpoint:     google.Endpoint,
	}

	authURL := a.config.AuthCodeURL("state-token", oauth2.AccessTypeOffline)
	fmt.Printf("Go to the following link in your browser:\n\n%s\n\n", authURL)
	fmt.Print("Enter verification code: ")

	var code string
	if _, err := fmt.Scan(&code); err != nil {
		return fmt.Errorf("failed to read authorization code: %w", err)
	}

	token, err := a.config.Exchange(context.Background(), code)
	if err != nil {
		return fmt.Errorf("failed to exchange token: %w", err)
	}

	a.token = token
	return nil
}

// GetToken returns the OAuth2 token.
func (a *OAuth2Authenticator) GetToken() (string, error) {
	if a.token == nil {
		return "", fmt.Errorf("not authenticated")
	}
	return a.token.AccessToken, nil
}

// CloudShellAuthenticator handles Cloud Shell authentication.
type CloudShellAuthenticator struct {
	token *oauth2.Token
}

// Authenticate performs Cloud Shell authentication.
func (a *CloudShellAuthenticator) Authenticate() error {
	creds, err := google.FindDefaultCredentials(context.Background(), "https://www.googleapis.com/auth/cloud-platform")
	if err != nil {
		return fmt.Errorf("failed to find default credentials: %w", err)
	}

	token, err := creds.TokenSource.Token()
	if err != nil {
		return fmt.Errorf("failed to get token: %w", err)
	}

	a.token = token
	return nil
}

// GetToken returns the Cloud Shell token.
func (a *CloudShellAuthenticator) GetToken() (string, error) {
	if a.token == nil {
		return "", fmt.Errorf("not authenticated")
	}
	return a.token.AccessToken, nil
}
