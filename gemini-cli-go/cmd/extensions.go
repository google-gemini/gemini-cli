package cmd

import (
	"fmt"
	"github.com/spf13/cobra"
)

var extensionsCmd = &cobra.Command{
	Use:   "extensions",
	Short: "Manage Gemini CLI extensions",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("extensions command")
	},
}

var extensionsInstallCmd = &cobra.Command{
	Use:   "install <name>",
	Short: "Install an extension",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("extensions install command")
	},
}

var extensionsUninstallCmd = &cobra.Command{
	Use:   "uninstall <name>",
	Short: "Uninstall an extension",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("extensions uninstall command")
	},
}

var extensionsListCmd = &cobra.Command{
	Use:   "list",
	Short: "List all installed extensions",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("extensions list command")
	},
}

var extensionsUpdateCmd = &cobra.Command{
	Use:   "update [name]",
	Short: "Update an extension",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("extensions update command")
	},
}

var extensionsDisableCmd = &cobra.Command{
	Use:   "disable <name>",
	Short: "Disable an extension",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("extensions disable command")
	},
}

var extensionsEnableCmd = &cobra.Command{
	Use:   "enable <name>",
	Short: "Enable an extension",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("extensions enable command")
	},
}

var extensionsLinkCmd = &cobra.Command{
	Use:   "link [path]",
	Short: "Link a local directory as an extension",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("extensions link command")
	},
}

var extensionsNewCmd = &cobra.Command{
	Use:   "new",
	Short: "Create a new extension",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("extensions new command")
	},
}

func init() {
	rootCmd.AddCommand(extensionsCmd)
	extensionsCmd.AddCommand(extensionsInstallCmd)
	extensionsCmd.AddCommand(extensionsUninstallCmd)
	extensionsCmd.AddCommand(extensionsListCmd)
	extensionsCmd.AddCommand(extensionsUpdateCmd)
	extensionsCmd.AddCommand(extensionsDisableCmd)
	extensionsCmd.AddCommand(extensionsEnableCmd)
	extensionsCmd.AddCommand(extensionsLinkCmd)
	extensionsCmd.AddCommand(extensionsNewCmd)
}