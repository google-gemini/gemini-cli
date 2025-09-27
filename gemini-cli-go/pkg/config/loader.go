package config

import (
	"dario.cat/mergo"
	"encoding/json"
	"io/ioutil"
	"os"
	"path/filepath"

	"github.com/tailscale/hujson"
)

const (
	settingsDirName  = ".gemini"
	settingsFileName = "settings.json"
)

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
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	configPath := filepath.Join(homeDir, ".config", "gemini", settingsFileName)
	return readSettingsFile(configPath)
}

func loadWorkspaceSettings() (*Settings, error) {
	wd, err := os.Getwd()
	if err != nil {
		return nil, err
	}
	configPath := filepath.Join(wd, settingsDirName, settingsFileName)
	return readSettingsFile(configPath)
}

func readSettingsFile(path string) (*Settings, error) {
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return &Settings{}, nil
	}

	file, err := ioutil.ReadFile(path)
	if err != nil {
		return nil, err
	}

	standardized, err := hujson.Standardize(file)
	if err != nil {
		return nil, err
	}

	var settings Settings
	if err := json.Unmarshal(standardized, &settings); err != nil {
		return nil, err
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

	if err := mergo.Merge(base, override, mergo.WithOverride); err != nil {
		// For simplicity, we'll panic here. In a real application, you might want to return an error.
		panic(err)
	}

	return base
}