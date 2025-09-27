package config

import (
	"dario.cat/mergo"
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/BurntSushi/toml"
	"github.com/tailscale/hujson"
)

const (
	settingsDirName            = ".gemini"
	settingsFileName           = "settings.toml"
	deprecatedSettingsDir      = ".config/gemini"
	deprecatedSettingsFileName = "settings.json"
)

var userHomeDir = os.UserHomeDir

// Load reads, parses, and merges the configuration files.
func Load() (*Settings, error) {
	userSettings, err := loadUserSettings()
	if err != nil {
		return nil, err
	}

	workspaceSettings, err := loadWorkspaceSettings()
	if err != nil {
		return nil, err
	}

	mergedSettings := mergeSettings(userSettings, workspaceSettings)

	return mergedSettings, nil
}

func loadUserSettings() (*Settings, error) {
	homeDir, err := userHomeDir()
	if err != nil {
		return nil, err
	}
	// New TOML config path
	configPath := filepath.Join(homeDir, settingsDirName, settingsFileName)
	if _, err := os.Stat(configPath); err == nil {
		return readSettingsFile(configPath)
	}

	// Deprecated JSON config path
	deprecatedConfigPath := filepath.Join(homeDir, deprecatedSettingsDir, deprecatedSettingsFileName)
	if _, err := os.Stat(deprecatedConfigPath); err == nil {
		return readSettingsFile(deprecatedConfigPath)
	}

	return &Settings{}, nil
}

// findUpDir searches for a directory in the directory tree, starting from startDir and going up.
func findUpDir(startDir, dirName string) (string, bool) {
	dir := startDir
	for {
		path := filepath.Join(dir, dirName)
		if fi, err := os.Stat(path); err == nil && fi.IsDir() {
			return path, true
		}

		parentDir := filepath.Dir(dir)
		if parentDir == dir { // Reached root
			return "", false
		}
		dir = parentDir
	}
}

func loadWorkspaceSettings() (*Settings, error) {
	wd, err := os.Getwd()
	if err != nil {
		return nil, err
	}

	configDir, found := findUpDir(wd, settingsDirName)
	if !found {
		return &Settings{}, nil
	}

	configPath := filepath.Join(configDir, settingsFileName)
	return readSettingsFile(configPath)
}

func readSettingsFile(path string) (*Settings, error) {
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return &Settings{}, nil
	}

	file, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var settings Settings
	if filepath.Ext(path) == ".toml" {
		if err := toml.Unmarshal(file, &settings); err != nil {
			return nil, err
		}
	} else if filepath.Ext(path) == ".json" {
		standardized, err := hujson.Standardize(file)
		if err != nil {
			return nil, err
		}
		if err := json.Unmarshal(standardized, &settings); err != nil {
			return nil, err
		}
	}

	return &settings, nil
}

func mergeSettings(base, override *Settings) *Settings {
	if base == nil {
		base = &Settings{}
	}
	if override == nil {
		override = &Settings{}
	}

	// In a real application, you might want to return an error.
	if err := mergo.Merge(base, override, mergo.WithOverride); err != nil {
		panic(err)
	}

	return base
}