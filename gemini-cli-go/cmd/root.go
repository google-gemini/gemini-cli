package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "gemini",
	Short: "A CLI for interacting with the Gemini API",
	Long:  `A command-line interface for Google's Gemini API.`,
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
}

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Print the version number of gemini-cli",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("gemini-cli-go v0.0.1")
	},
}

func init() {
	rootCmd.AddCommand(versionCmd)
	rootCmd.PersistentFlags().StringP("model", "m", "", "The model to use")
	rootCmd.PersistentFlags().StringP("prompt", "p", "", "The prompt to use (non-interactive)")
	rootCmd.PersistentFlags().StringP("prompt-interactive", "i", "", "Execute a prompt and then enter interactive mode")
	rootCmd.PersistentFlags().BoolP("sandbox", "s", false, "Run in a sandbox")
	rootCmd.PersistentFlags().String("sandbox-image", "", "The sandbox image to use")
	rootCmd.PersistentFlags().BoolP("all-files", "a", false, "Include all files in the context")
	rootCmd.PersistentFlags().Bool("show-memory-usage", false, "Show memory usage in the status bar")
	rootCmd.PersistentFlags().BoolP("yolo", "y", false, "Automatically accept all actions")
	rootCmd.PersistentFlags().String("approval-mode", "default", "Set the approval mode (`default`, `auto_edit`, `yolo`)")
	rootCmd.PersistentFlags().BoolP("checkpointing", "c", false, "Enable checkpointing of file edits")
	rootCmd.PersistentFlags().Bool("experimental-acp", false, "Start the agent in ACP mode")
	rootCmd.PersistentFlags().StringArray("allowed-mcp-server-names", []string{}, "Allowed MCP server names")
	rootCmd.PersistentFlags().StringArray("allowed-tools", []string{}, "Tools that are allowed to run without confirmation")
	rootCmd.PersistentFlags().StringArrayP("extensions", "e", []string{}, "A list of extensions to use")
	rootCmd.PersistentFlags().BoolP("list-extensions", "l", false, "List all available extensions and exit")
	rootCmd.PersistentFlags().StringArray("include-directories", []string{}, "Additional directories to include in the workspace")
	rootCmd.PersistentFlags().Bool("screen-reader", false, "Enable screen reader mode")
	rootCmd.PersistentFlags().StringP("output-format", "o", "text", "The format of the CLI output (`text`, `json`)")
}