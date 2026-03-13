/*
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

package com.google.geminicli.jetbrains.diff

import com.intellij.diff.DiffDialogHints
import com.intellij.diff.DiffManager
import com.intellij.diff.DiffRequestPanel
import com.intellij.diff.chains.SimpleDiffRequestChain
import com.intellij.diff.contents.DiffContent
import com.intellij.diff.contents.DocumentContentImpl
import com.intellij.diff.requests.SimpleDiffRequest
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.EditorFactory
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * Manages diff views in the IntelliJ IDE.
 *
 * Opens side-by-side diff views showing original vs. proposed content,
 * and handles accept/reject actions.
 */
class DiffViewManager(private val project: Project) {
    private val log = Logger.getInstance(DiffViewManager::class.java)

    // Track open diffs: filePath -> (newContent, callback)
    private val openDiffs = ConcurrentHashMap<String, DiffState>()

    private data class DiffState(
        val newContent: String,
        val callback: (DiffResult) -> Unit,
    )

    /**
     * Show a diff view comparing the original file content with the proposed new content.
     */
    fun showDiff(filePath: String, newContent: String, onResult: (DiffResult) -> Unit) {
        // Store the diff state
        openDiffs[filePath] = DiffState(newContent, onResult)

        ApplicationManager.getApplication().invokeLater {
            try {
                val originalContent = readFileContent(filePath)
                val fileName = File(filePath).name

                val leftContent = createDocumentContent(originalContent)
                val rightContent = createDocumentContent(newContent)

                val request = SimpleDiffRequest(
                    "Gemini CLI: $fileName",
                    leftContent,
                    rightContent,
                    "Original",
                    "Proposed Changes",
                )

                // Add custom data for accept/reject actions
                request.putUserData(DIFF_FILE_PATH_KEY, filePath)
                request.putUserData(DIFF_VIEW_MANAGER_KEY, this)

                DiffManager.getInstance().showDiff(project, request, DiffDialogHints.DEFAULT)
            } catch (e: Exception) {
                log.warn("Failed to show diff for $filePath", e)
                openDiffs.remove(filePath)
                onResult(DiffResult.Rejected)
            }
        }
    }

    /**
     * Close the diff view for a file and return the modified content if available.
     */
    fun closeDiff(filePath: String): String? {
        val state = openDiffs.remove(filePath) ?: return null
        return state.newContent
    }

    /**
     * Accept the diff — write content to file and notify.
     */
    fun acceptDiff(filePath: String, content: String) {
        val state = openDiffs.remove(filePath) ?: return

        ApplicationManager.getApplication().invokeLater {
            try {
                // Write the accepted content to the file
                ApplicationManager.getApplication().runWriteAction {
                    val virtualFile = LocalFileSystem.getInstance()
                        .refreshAndFindFileByPath(filePath)
                    if (virtualFile != null) {
                        val document = FileDocumentManager.getInstance().getDocument(virtualFile)
                        document?.let {
                            it.setText(content)
                            FileDocumentManager.getInstance().saveDocument(it)
                        }
                    } else {
                        // New file — create it
                        val file = File(filePath)
                        file.parentFile?.mkdirs()
                        file.writeText(content)
                        LocalFileSystem.getInstance().refreshAndFindFileByPath(filePath)
                    }
                }
            } catch (e: Exception) {
                log.warn("Failed to write accepted diff for $filePath", e)
            }
        }

        state.callback(DiffResult.Accepted(content))
    }

    /**
     * Reject the diff.
     */
    fun rejectDiff(filePath: String) {
        val state = openDiffs.remove(filePath) ?: return
        state.callback(DiffResult.Rejected)
    }

    private fun readFileContent(filePath: String): String {
        return try {
            runReadAction {
                val virtualFile = LocalFileSystem.getInstance().findFileByPath(filePath)
                if (virtualFile != null) {
                    val document = FileDocumentManager.getInstance().getDocument(virtualFile)
                    document?.text ?: ""
                } else {
                    ""
                }
            }
        } catch (_: Exception) {
            ""
        }
    }

    private fun createDocumentContent(text: String): DiffContent {
        val document = EditorFactory.getInstance().createDocument(text)
        return DocumentContentImpl(document)
    }

    companion object {
        val DIFF_FILE_PATH_KEY = com.intellij.openapi.util.Key.create<String>("GEMINI_DIFF_FILE_PATH")
        val DIFF_VIEW_MANAGER_KEY = com.intellij.openapi.util.Key.create<DiffViewManager>("GEMINI_DIFF_VIEW_MANAGER")
    }
}
