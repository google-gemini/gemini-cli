/*
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

package com.google.geminicli.jetbrains.discovery

import com.google.geminicli.jetbrains.GeminiCliPlugin
import com.intellij.openapi.project.Project
import org.jetbrains.plugins.terminal.TerminalEnvironmentContributor
import java.nio.file.Path

/**
 * Injects environment variables into JetBrains integrated terminal sessions
 * so that Gemini CLI can auto-discover and connect to this companion plugin.
 *
 * Implements TerminalEnvironmentContributor which is available since IntelliJ 2024.1.
 */
class EnvironmentInjector : TerminalEnvironmentContributor {

    override fun contributeEnvironment(
        project: Project,
        envs: MutableMap<String, String>,
        localSession: Boolean,
        shellPath: Path?,
    ) {
        val plugin = project.getServiceIfCreated(GeminiCliPlugin::class.java) ?: return

        val port = plugin.getServerPort() ?: return
        val authToken = plugin.getAuthToken() ?: return
        val workspacePath = plugin.getWorkspacePath()

        envs["GEMINI_CLI_IDE_SERVER_PORT"] = port.toString()
        envs["GEMINI_CLI_IDE_WORKSPACE_PATH"] = workspacePath
        envs["GEMINI_CLI_IDE_AUTH_TOKEN"] = authToken
    }
}
