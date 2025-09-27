package config

// Settings represents the top-level configuration structure.
type Settings struct {
	General      *GeneralSettings      `json:"general,omitempty"`
	UI           *UISettings           `json:"ui,omitempty"`
	IDE          *IDESettings          `json:"ide,omitempty"`
	Privacy      *PrivacySettings      `json:"privacy,omitempty"`
	Telemetry    *TelemetrySettings    `json:"telemetry,omitempty"`
	Model        *ModelSettings        `json:"model,omitempty"`
	Context      *ContextSettings      `json:"context,omitempty"`
	Tools        *ToolsSettings        `json:"tools,omitempty"`
	MCP          *MCPSettings          `json:"mcp,omitempty"`
	MCPServers   map[string]MCPServer `json:"mcpServers,omitempty"`
	Security     *SecuritySettings     `json:"security,omitempty"`
	Advanced     *AdvancedSettings     `json:"advanced,omitempty"`
	Experimental *ExperimentalSettings `json:"experimental,omitempty"`
	Extensions   *ExtensionsSettings   `json:"extensions,omitempty"`
}

// GeneralSettings represents the general application settings.
type GeneralSettings struct {
	PreferredEditor       string         `json:"preferredEditor,omitempty"`
	VimMode               bool           `json:"vimMode,omitempty"`
	DisableAutoUpdate     bool           `json:"disableAutoUpdate,omitempty"`
	DisableUpdateNag      bool           `json:"disableUpdateNag,omitempty"`
	Checkpointing         *Checkpointing `json:"checkpointing,omitempty"`
	EnablePromptCompletion bool          `json:"enablePromptCompletion,omitempty"`
	DebugKeystrokeLogging bool           `json:"debugKeystrokeLogging,omitempty"`
}

// Checkpointing represents the session checkpointing settings.
type Checkpointing struct {
	Enabled bool `json:"enabled,omitempty"`
}

// UISettings represents the user interface settings.
type UISettings struct {
	Theme              string                `json:"theme,omitempty"`
	CustomThemes       map[string]any        `json:"customThemes,omitempty"` // Using 'any' for now.
	HideWindowTitle    bool                  `json:"hideWindowTitle,omitempty"`
	HideTips           bool                  `json:"hideTips,omitempty"`
	HideBanner         bool                  `json:"hideBanner,omitempty"`
	HideContextSummary bool                  `json:"hideContextSummary,omitempty"`
	Footer             *FooterSettings       `json:"footer,omitempty"`
	HideFooter         bool                  `json:"hideFooter,omitempty"`
	ShowMemoryUsage    bool                  `json:"showMemoryUsage,omitempty"`
	ShowLineNumbers    bool                  `json:"showLineNumbers,omitempty"`
	ShowCitations      bool                  `json:"showCitations,omitempty"`
	CustomWittyPhrases []string              `json:"customWittyPhrases,omitempty"`
	Accessibility      *AccessibilitySettings `json:"accessibility,omitempty"`
}

// FooterSettings represents the settings for the footer.
type FooterSettings struct {
	HideCWD           bool `json:"hideCWD,omitempty"`
	HideSandboxStatus bool `json:"hideSandboxStatus,omitempty"`
	HideModelInfo     bool `json:"hideModelInfo,omitempty"`
}

// AccessibilitySettings represents the accessibility settings.
type AccessibilitySettings struct {
	DisableLoadingPhrases bool `json:"disableLoadingPhrases,omitempty"`
	ScreenReader          bool `json:"screenReader,omitempty"`
}

// IDESettings represents the IDE integration settings.
type IDESettings struct {
	Enabled      bool `json:"enabled,omitempty"`
	HasSeenNudge bool `json:"hasSeenNudge,omitempty"`
}

// PrivacySettings represents the privacy-related settings.
type PrivacySettings struct {
	UsageStatisticsEnabled bool `json:"usageStatisticsEnabled,omitempty"`
}

// TelemetrySettings represents the telemetry configuration.
type TelemetrySettings struct {
	// This will be defined based on gemini-cli-core
}

// ModelSettings represents the settings related to the generative model.
type ModelSettings struct {
	Name                 string         `json:"name,omitempty"`
	MaxSessionTurns      int            `json:"maxSessionTurns,omitempty"`
	SummarizeToolOutput  map[string]any `json:"summarizeToolOutput,omitempty"` // Using 'any' for now.
	ChatCompression      any            `json:"chatCompression,omitempty"`      // Using 'any' for now.
	SkipNextSpeakerCheck bool           `json:"skipNextSpeakerCheck,omitempty"`
}

// ContextSettings represents the settings for managing context provided to the model.
type ContextSettings struct {
	FileName                       any                  `json:"fileName,omitempty"` // string or []string
	ImportFormat                   string               `json:"importFormat,omitempty"`
	DiscoveryMaxDirs               int                  `json:"discoveryMaxDirs,omitempty"`
	IncludeDirectories             []string             `json:"includeDirectories,omitempty"`
	LoadMemoryFromIncludeDirectories bool              `json:"loadMemoryFromIncludeDirectories,omitempty"`
	FileFiltering                  *FileFilteringSettings `json:"fileFiltering,omitempty"`
}

// FileFilteringSettings represents the settings for git-aware file filtering.
type FileFilteringSettings struct {
	RespectGitIgnore          bool `json:"respectGitIgnore,omitempty"`
	RespectGeminiIgnore       bool `json:"respectGeminiIgnore,omitempty"`
	EnableRecursiveFileSearch bool `json:"enableRecursiveFileSearch,omitempty"`
	DisableFuzzySearch        bool `json:"disableFuzzySearch,omitempty"`
}

// ToolsSettings represents the settings for built-in and custom tools.
type ToolsSettings struct {
	Sandbox                     any            `json:"sandbox,omitempty"` // bool or string
	Shell                       *ShellSettings `json:"shell,omitempty"`
	AutoAccept                  bool           `json:"autoAccept,omitempty"`
	Core                        []string       `json:"core,omitempty"`
	Allowed                     []string       `json:"allowed,omitempty"`
	Exclude                     []string       `json:"exclude,omitempty"`
	DiscoveryCommand            string         `json:"discoveryCommand,omitempty"`
	CallCommand                 string         `json:"callCommand,omitempty"`
	UseRipgrep                  bool           `json:"useRipgrep,omitempty"`
	EnableToolOutputTruncation  bool           `json:"enableToolOutputTruncation,omitempty"`
	TruncateToolOutputThreshold int            `json:"truncateToolOutputThreshold,omitempty"`
	TruncateToolOutputLines     int            `json:"truncateToolOutputLines,omitempty"`
	EnableMessageBusIntegration bool           `json:"enableMessageBusIntegration,omitempty"`
}

// ShellSettings represents the settings for shell execution.
type ShellSettings struct {
	EnableInteractiveShell bool   `json:"enableInteractiveShell,omitempty"`
	Pager                  string `json:"pager,omitempty"`
	ShowColor              bool   `json:"showColor,omitempty"`
}

// MCPSettings represents the settings for Model Context Protocol (MCP) servers.
type MCPSettings struct {
	ServerCommand string   `json:"serverCommand,omitempty"`
	Allowed       []string `json:"allowed,omitempty"`
	Excluded      []string `json:"excluded,omitempty"`
}

// MCPServer represents the configuration for an MCP server.
type MCPServer struct {
	// This will be defined based on gemini-cli-core
}

// SecuritySettings represents the security-related settings.
type SecuritySettings struct {
	FolderTrust *FolderTrustSettings `json:"folderTrust,omitempty"`
	Auth        *AuthSettings        `json:"auth,omitempty"`
}

// FolderTrustSettings represents the settings for folder trust.
type FolderTrustSettings struct {
	Enabled bool `json:"enabled,omitempty"`
}

// AuthSettings represents the authentication settings.
type AuthSettings struct {
	SelectedType string `json:"selectedType,omitempty"`
	EnforcedType string `json:"enforcedType,omitempty"`
	UseExternal  bool   `json:"useExternal,omitempty"`
}

// AdvancedSettings represents the advanced settings for power users.
type AdvancedSettings struct {
	AutoConfigureMemory bool     `json:"autoConfigureMemory,omitempty"`
	DNSResolutionOrder  string   `json:"dnsResolutionOrder,omitempty"`
	ExcludedEnvVars     []string `json:"excludedEnvVars,omitempty"`
	BugCommand          any      `json:"bugCommand,omitempty"` // Using 'any' for now.
}

// ExperimentalSettings represents the setting to enable experimental features.
type ExperimentalSettings struct {
	ExtensionManagement bool `json:"extensionManagement,omitempty"`
	UseModelRouter      bool `json:"useModelRouter,omitempty"`
}

// ExtensionsSettings represents the settings for extensions.
type ExtensionsSettings struct {
	Disabled                     []string `json:"disabled,omitempty"`
	WorkspacesWithMigrationNudge []string `json:"workspacesWithMigrationNudge,omitempty"`
}