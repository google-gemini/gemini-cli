/*
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

package com.google.geminicli.jetbrains

import com.google.geminicli.jetbrains.context.ContextNotifier
import com.google.geminicli.jetbrains.context.OpenFilesTracker
import com.google.geminicli.jetbrains.diff.DiffTool
import com.google.geminicli.jetbrains.diff.DiffViewManager
import com.google.geminicli.jetbrains.discovery.DiscoveryFileManager
import com.google.geminicli.jetbrains.server.McpServer
import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManagerListener
import java.io.File

/**
 * Main plugin entry point. Registered as a project-level service.
 *
 * On project open:
 * 1. Starts the MCP HTTP server
 * 2. Writes the discovery file
 * 3. Registers context tracking listeners
 * 4. Wires up diff management
 *
 * On project close:
 * 1. Stops the MCP server
 * 2. Cleans up the discovery file
 */
@Service(Service.Level.PROJECT)
class GeminiCliPlugin(private val project: Project) : Disposable {
    private val log = Logger.getInstance(GeminiCliPlugin::class.java)

    private var mcpServer: McpServer? = null
    private var discoveryFileManager: DiscoveryFileManager? = null
    private var openFilesTracker: OpenFilesTracker? = null
    private var contextNotifier: ContextNotifier? = null
    private var diffViewManager: DiffViewManager? = null
    private var diffTool: DiffTool? = null

    fun activate() {
        log.info("Activating Gemini CLI companion for project: ${project.name}")

        try {
            // 1. Create components
            val diffViewMgr = DiffViewManager(project)
            val diffToolInstance = DiffTool(diffViewMgr)
            val server = McpServer(diffToolInstance)

            // Wire up circular reference
            diffToolInstance.mcpServer = server

            // 2. Start MCP server
            server.start()

            // 3. Set up context tracking
            val tracker = OpenFilesTracker(project)
            val notifier = ContextNotifier(server, tracker)

            tracker.setChangeCallback { notifier.scheduleUpdate() }
            tracker.registerListeners()

            // When a new session connects, send the current context
            server.onNewSession = { transport ->
                val notification = notifier.buildContextNotification()
                transport.sendNotification(notification)
            }

            // 4. Write discovery file
            val discovery = DiscoveryFileManager()
            val workspacePath = getWorkspacePath()
            discovery.write(server.port, workspacePath, server.authToken)

            // Store references for cleanup and env injection
            this.mcpServer = server
            this.discoveryFileManager = discovery
            this.openFilesTracker = tracker
            this.contextNotifier = notifier
            this.diffViewManager = diffViewMgr
            this.diffTool = diffToolInstance

            log.info("Gemini CLI companion activated on port ${server.port}")
        } catch (e: Exception) {
            log.error("Failed to activate Gemini CLI companion", e)
        }
    }

    fun deactivate() {
        log.info("Deactivating Gemini CLI companion for project: ${project.name}")

        contextNotifier?.dispose()
        mcpServer?.stop()
        discoveryFileManager?.cleanup()

        mcpServer = null
        discoveryFileManager = null
        openFilesTracker = null
        contextNotifier = null
        diffViewManager = null
        diffTool = null
    }

    /**
     * Get the MCP server port for environment injection.
     */
    fun getServerPort(): Int? = mcpServer?.port

    /**
     * Get the auth token for environment injection.
     */
    fun getAuthToken(): String? = mcpServer?.authToken

    /**
     * Get the workspace path(s) for this project.
     */
    fun getWorkspacePath(): String {
        val basePath = project.basePath
        return if (basePath != null) {
            File(basePath).absolutePath
        } else {
            ""
        }
    }

    override fun dispose() {
        deactivate()
    }

    /**
     * Listener that activates/deactivates the plugin on project open/close.
     * Registered in plugin.xml as a projectManagerListener.
     */
    class ProjectOpenCloseListener : ProjectManagerListener {
        override fun projectOpened(project: Project) {
            val plugin = project.getService(GeminiCliPlugin::class.java)
            plugin.activate()
        }

        override fun projectClosing(project: Project) {
            val plugin = project.getServiceIfCreated(GeminiCliPlugin::class.java)
            plugin?.deactivate()
        }
    }
}
