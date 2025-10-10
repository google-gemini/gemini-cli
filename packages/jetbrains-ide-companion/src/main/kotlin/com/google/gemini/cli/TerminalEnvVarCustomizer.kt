package com.google.gemini.cli

import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import org.jetbrains.plugins.terminal.LocalTerminalCustomizer

class TerminalEnvVarCustomizer : LocalTerminalCustomizer() {
    override fun customizeCommandAndEnvironment(
        project: Project,
        workingDirectory: String?,
        command: Array<String>,
        env: MutableMap<String, String>
    ): Array<String> {
        val serverState = project.service<GeminiCliServerState>()
        serverState.port?.let {
            env["GEMINI_CLI_IDE_SERVER_PORT"] = it.toString()
        }
        serverState.token?.let {
            env["GEMINI_CLI_IDE_SERVER_AUTH_TOKEN"] = it
        }
        serverState.workspacePath?.let {
            env["GEMINI_CLI_IDE_WORKSPACE_PATH"] = it
        }
        return command
    }
}
