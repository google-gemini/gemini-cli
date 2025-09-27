package cmd

import (
	"fmt"
	"github.com/spf13/cobra"
)

var mcpCmd = &cobra.Command{
	Use:   "mcp",
	Short: "Manage MCP servers",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("mcp command")
	},
}

var mcpAddCmd = &cobra.Command{
	Use:   "add <name> <commandOrUrl> [args...]",
	Short: "Add a server",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("mcp add command")
	},
}

var mcpRemoveCmd = &cobra.Command{
	Use:   "remove <name>",
	Short: "Remove a server",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("mcp remove command")
	},
}

var mcpListCmd = &cobra.Command{
	Use:   "list",
	Short: "List all configured MCP servers",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("mcp list command")
	},
}

func init() {
	rootCmd.AddCommand(mcpCmd)
	mcpCmd.AddCommand(mcpAddCmd)
	mcpCmd.AddCommand(mcpRemoveCmd)
	mcpCmd.AddCommand(mcpListCmd)

	mcpAddCmd.Flags().StringP("scope", "s", "project", "Configuration scope (user or project)")
	mcpAddCmd.Flags().StringP("transport", "t", "stdio", "Transport type (stdio, sse, or http)")
	mcpAddCmd.Flags().StringArrayP("env", "e", []string{}, "Environment variables for stdio transport")
	mcpAddCmd.Flags().StringArrayP("header", "H", []string{}, "HTTP headers for sse and http transports")
	mcpAddCmd.Flags().Int("timeout", 0, "Connection timeout in milliseconds")
	mcpAddCmd.Flags().Bool("trust", false, "Trust the server and bypass tool call confirmations")
	mcpAddCmd.Flags().String("description", "", "A description for the server")
	mcpAddCmd.Flags().StringArray("include-tools", []string{}, "A comma-separated list of tools to include")
	mcpAddCmd.Flags().StringArray("exclude-tools", []string{}, "A comma-separated list of tools to exclude")

	mcpRemoveCmd.Flags().StringP("scope", "s", "project", "Configuration scope (user or project)")
}