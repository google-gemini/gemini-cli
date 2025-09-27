package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoad(t *testing.T) {
	// Create a temporary directory for our test configuration files
	tempDir, err := os.MkdirTemp("", "gemini-cli-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Mock the user home directory
	originalUserHomeDir := userHomeDir
	userHomeDir = func() (string, error) {
		return tempDir, nil
	}
	defer func() { userHomeDir = originalUserHomeDir }()

	// --- Test Case 1: Load from user's TOML config ---
	userGeminiDir := filepath.Join(tempDir, settingsDirName)
	if err := os.MkdirAll(userGeminiDir, 0755); err != nil {
		t.Fatalf("Failed to create user .gemini dir: %v", err)
	}
	userTomlConfig := filepath.Join(userGeminiDir, settingsFileName)
	if err := os.WriteFile(userTomlConfig, []byte("[general]\nvimMode = true"), 0644); err != nil {
		t.Fatalf("Failed to write user toml config: %v", err)
	}

	settings, err := Load()
	if err != nil {
		t.Fatalf("Load() failed: %v", err)
	}
	if !settings.General.VimMode {
		t.Errorf("Expected vimMode to be true, got false")
	}

	// Clean up for the next test
	os.Remove(userTomlConfig)

	// --- Test Case 2: Load from deprecated user JSON config ---
	deprecatedUserConfigDir := filepath.Join(tempDir, deprecatedSettingsDir)
	if err := os.MkdirAll(deprecatedUserConfigDir, 0755); err != nil {
		t.Fatalf("Failed to create deprecated user config dir: %v", err)
	}
	deprecatedUserJsonConfig := filepath.Join(deprecatedUserConfigDir, deprecatedSettingsFileName)
	if err := os.WriteFile(deprecatedUserJsonConfig, []byte(`{"general": {"vimMode": true}}`), 0644); err != nil {
		t.Fatalf("Failed to write deprecated user json config: %v", err)
	}

	settings, err = Load()
	if err != nil {
		t.Fatalf("Load() failed: %v", err)
	}
	if !settings.General.VimMode {
		t.Errorf("Expected vimMode to be true, got false")
	}

	// Clean up
	os.Remove(deprecatedUserJsonConfig)
	os.RemoveAll(deprecatedUserConfigDir)
	os.RemoveAll(userGeminiDir)

	// --- Test Case 3: Load and merge workspace config ---
	// Create a workspace directory inside the tempDir
	workspaceDir := filepath.Join(tempDir, "my-project")
	if err := os.MkdirAll(workspaceDir, 0755); err != nil {
		t.Fatalf("Failed to create workspace dir: %v", err)
	}
	// Change current working directory to the workspace
	originalWd, _ := os.Getwd()
	if err := os.Chdir(workspaceDir); err != nil {
		t.Fatalf("Failed to change dir: %v", err)
	}
	defer os.Chdir(originalWd)

	// Create user config
	if err := os.MkdirAll(userGeminiDir, 0755); err != nil {
		t.Fatalf("Failed to create user .gemini dir: %v", err)
	}
	if err := os.WriteFile(userTomlConfig, []byte(`
[general]
vimMode = true
[ui]
theme = "dark"
`), 0644); err != nil {
		t.Fatalf("Failed to write user toml config: %v", err)
	}

	// Create workspace config
	workspaceGeminiDir := filepath.Join(workspaceDir, settingsDirName)
	if err := os.MkdirAll(workspaceGeminiDir, 0755); err != nil {
		t.Fatalf("Failed to create workspace .gemini dir: %v", err)
	}
	workspaceTomlConfig := filepath.Join(workspaceGeminiDir, settingsFileName)
	if err := os.WriteFile(workspaceTomlConfig, []byte(`
[ui]
theme = "light"
`), 0644); err != nil {
		t.Fatalf("Failed to write workspace toml config: %v", err)
	}

	settings, err = Load()
	if err != nil {
		t.Fatalf("Load() with workspace config failed: %v", err)
	}
	if !settings.General.VimMode {
		t.Errorf("Expected merged vimMode to be true, got false")
	}
	if settings.UI.Theme != "light" {
		t.Errorf("Expected theme to be 'light' (from workspace), got '%s'", settings.UI.Theme)
	}

	// Clean up
	os.RemoveAll(userGeminiDir)
	os.RemoveAll(workspaceGeminiDir)
}