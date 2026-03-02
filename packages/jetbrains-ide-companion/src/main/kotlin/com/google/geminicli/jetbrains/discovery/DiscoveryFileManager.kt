/*
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

package com.google.geminicli.jetbrains.discovery

import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.diagnostic.Logger
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.attribute.PosixFilePermissions

/**
 * Manages the discovery JSON file that allows Gemini CLI to find and connect
 * to this companion plugin.
 *
 * File location: {tmpdir}/gemini/ide/gemini-ide-server-{PID}-{PORT}.json
 */
class DiscoveryFileManager {
    private val log = Logger.getInstance(DiscoveryFileManager::class.java)
    private var discoveryFile: Path? = null

    private val json = Json {
        encodeDefaults = true
        prettyPrint = false
    }

    @Serializable
    data class IdeInfoData(
        val name: String,
        val displayName: String,
    )

    @Serializable
    data class DiscoveryData(
        val port: Int,
        val workspacePath: String,
        val authToken: String,
        val ideInfo: IdeInfoData? = null,
    )

    /**
     * Write the discovery file with connection information.
     */
    fun write(port: Int, workspacePath: String, authToken: String) {
        try {
            val tmpDir = System.getProperty("java.io.tmpdir")
            val portDir = Path.of(tmpDir, "gemini", "ide")
            Files.createDirectories(portDir)

            val pid = ProcessHandle.current().pid()
            val fileName = "gemini-ide-server-$pid-$port.json"
            val filePath = portDir.resolve(fileName)

            val ideInfo = detectIdeInfo()
            val data = DiscoveryData(
                port = port,
                workspacePath = workspacePath,
                authToken = authToken,
                ideInfo = ideInfo,
            )

            val content = json.encodeToString(data)
            Files.writeString(filePath, content)

            // Set file permissions to 0600 (owner read/write only)
            try {
                Files.setPosixFilePermissions(
                    filePath,
                    PosixFilePermissions.fromString("rw-------")
                )
            } catch (_: UnsupportedOperationException) {
                // Windows doesn't support POSIX permissions
            }

            discoveryFile = filePath
            log.info("Discovery file written to: $filePath")
        } catch (e: Exception) {
            log.warn("Failed to write discovery file", e)
        }
    }

    /**
     * Delete the discovery file on shutdown.
     */
    fun cleanup() {
        val file = discoveryFile ?: return
        try {
            Files.deleteIfExists(file)
            log.info("Discovery file deleted: $file")
        } catch (e: Exception) {
            log.warn("Failed to delete discovery file", e)
        }
        discoveryFile = null
    }

    /**
     * Detect the current JetBrains IDE product info.
     */
    private fun detectIdeInfo(): IdeInfoData {
        val appInfo = ApplicationInfo.getInstance()
        val fullName = appInfo.fullApplicationName.lowercase()

        // Map known product names to their CLI identifiers
        val productMapping = listOf(
            "android studio" to ("androidstudio" to "Android Studio"),
            "intellij idea" to ("intellijidea" to "IntelliJ IDEA"),
            "webstorm" to ("webstorm" to "WebStorm"),
            "pycharm" to ("pycharm" to "PyCharm"),
            "goland" to ("goland" to "GoLand"),
            "clion" to ("clion" to "CLion"),
            "rustrover" to ("rustrover" to "RustRover"),
            "datagrip" to ("datagrip" to "DataGrip"),
            "phpstorm" to ("phpstorm" to "PhpStorm"),
        )

        for ((searchTerm, idAndName) in productMapping) {
            if (fullName.contains(searchTerm)) {
                return IdeInfoData(name = idAndName.first, displayName = idAndName.second)
            }
        }

        // Fallback to generic JetBrains
        return IdeInfoData(name = "jetbrains", displayName = "JetBrains IDE")
    }
}
