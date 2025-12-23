package com.google.gemini.cli

import com.intellij.ide.plugins.PluginManagerCore
import com.intellij.notification.Notification
import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationType
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.extensions.PluginId
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.intellij.ide.actions.ShowSettingsUtilImpl
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean

@Service(Service.Level.APP)
class UpdateChecker {
    private val log = Logger.getInstance(UpdateChecker::class.java)
    private val pluginId = "com.google.gemini-cli"
    private val pluginMarketplaceUrl = "https://plugins.jetbrains.com/api/plugins/${pluginId}"
    private val checkedForUpdates = AtomicBoolean(false)

    fun checkForUpdates(project: Project) {
        if (checkedForUpdates.getAndSet(true)) {
            return
        }

        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                val currentPlugin = PluginManagerCore.getPlugin(PluginId.getId(pluginId))
                if (currentPlugin == null) {
                    log.warn("Gemini CLI plugin not found")
                    return@executeOnPooledThread
                }

                val currentVersion = currentPlugin.version
                val latestVersion = fetchLatestVersion()

                if (latestVersion != null && isNewerVersion(latestVersion, currentVersion)) {
                    ApplicationManager.getApplication().invokeLater {
                        showUpdateNotification(project, currentVersion, latestVersion)
                    }
                } else {
                    log.debug("Gemini CLI plugin is up to date (current: $currentVersion)")
                }
            } catch (e: Exception) {
                log.warn("Failed to check for updates: ${e.message}")
            }
        }
    }

    private fun fetchLatestVersion(): String? {
        try {
            val connection = URL(pluginMarketplaceUrl).openConnection()
            connection.setRequestProperty("User-Agent", "Gemini-CLI-Plugin/1.0")
            connection.connectTimeout = 10000
            connection.readTimeout = 10000

            val response = connection.getInputStream().bufferedReader().use { it.readText() }
            val pluginInfo = Json.decodeFromString<PluginInfo>(response)
            return pluginInfo.version
        } catch (e: Exception) {
            log.debug("Failed to fetch latest version from marketplace: ${e.message}")
            return null
        }
    }

    private fun isNewerVersion(latestVersion: String, currentVersion: String): Boolean {
        return try {
            val latest = parseVersion(latestVersion)
            val current = parseVersion(currentVersion)

            // Compare major, minor, patch versions
            for (i in 0 until minOf(latest.size, current.size)) {
                if (latest[i] > current[i]) return true
                if (latest[i] < current[i]) return false
            }

            // If all components are equal but latest has more components, it's newer
            latest.size > current.size
        } catch (e: Exception) {
            log.debug("Failed to compare versions: $currentVersion vs $latestVersion")
            false
        }
    }

    private fun parseVersion(version: String): List<Int> {
        return version.split('.').map { it.toIntOrNull() ?: 0 }
    }

    private fun showUpdateNotification(project: Project, currentVersion: String, latestVersion: String) {
        val notification = Notification(
            "Gemini CLI",
            "Gemini CLI Update Available",
            "A new version ($latestVersion) of the Gemini CLI Companion is available (current: $currentVersion).",
            NotificationType.INFORMATION
        )

        notification.addAction(NotificationAction.createSimple("Update Now") {
            updatePlugin(project)
            notification.expire()
        })

        notification.addAction(NotificationAction.createSimple("Later") {
            notification.expire()
        })

        notification.notify(project)
    }

    private fun updatePlugin(project: Project) {
        object : Task.Backgroundable(project, "Updating Gemini CLI Plugin", true) {
            override fun run(indicator: ProgressIndicator) {
                indicator.text = "Checking for plugin updates..."

                try {
                    // For JetBrains plugins, we can't directly update from code
                    // Instead, we'll open the plugin manager and let the user update manually
                    ApplicationManager.getApplication().invokeLater {
                        val notification = Notification(
                            "Gemini CLI",
                            "Update Available",
                            "Please open the Plugin Manager to update Gemini CLI plugin to the latest version.",
                            NotificationType.INFORMATION
                        )

                        notification.addAction(NotificationAction.createSimple("Open Plugin Manager") {
                            // Open plugin settings
                            ShowSettingsUtilImpl.showSettingsDialog(project, "Plugins", null)
                            notification.expire()
                        })

                        notification.notify(project)
                    }
                } catch (e: Exception) {
                    log.error("Failed to update plugin: ${e.message}", e)
                    ApplicationManager.getApplication().invokeLater {
                        val errorNotification = Notification(
                            "Gemini CLI",
                            "Update Error",
                            "An error occurred while trying to update the plugin: ${e.message}",
                            NotificationType.ERROR
                        )
                        errorNotification.notify(project)
                    }
                }
            }
        }.queue()
    }
}

@Serializable
private data class PluginInfo(
    val version: String
)