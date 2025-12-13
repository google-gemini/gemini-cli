package com.google.gemini.cli

import com.google.gemini.cli.settings.GeminiCliSettingsState
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.wm.ToolWindowManager
import org.jetbrains.plugins.terminal.TerminalToolWindowManager

class RunGeminiCLIAction : AnAction() {
  override fun actionPerformed(e: AnActionEvent) {
    val project = e.project ?: return

    val settingsState = GeminiCliSettingsState.getInstance()
    val cliCommand = settingsState.cliCommand.ifEmpty { "gemini" }
    println("Gemini CLI Action: Using command: '$cliCommand'")

    val toolWindow = ToolWindowManager.getInstance(project).getToolWindow("Terminal")
    toolWindow?.show {
      val terminalManager = TerminalToolWindowManager.getInstance(project)
      val widget = terminalManager.createLocalShellWidget(project.basePath, "Gemini CLI")
      widget.executeCommand(cliCommand)
    }
  }
}
