package com.google.gemini.cli

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.wm.ToolWindowManager
import org.jetbrains.plugins.terminal.TerminalView

class RunGeminiCLIAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return

        val toolWindow = ToolWindowManager.getInstance(project).getToolWindow("Terminal")
        toolWindow?.show {
            val terminalView = TerminalView.getInstance(project)
            val widget = terminalView.createLocalShellWidget(project.basePath, "Gemini CLI")
            widget.executeCommand("gemini")
        }
    }
}