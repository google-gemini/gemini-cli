/*
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

package com.google.geminicli.jetbrains.context

import com.intellij.openapi.editor.EditorFactory
import com.intellij.openapi.editor.event.CaretEvent
import com.intellij.openapi.editor.event.CaretListener
import com.intellij.openapi.editor.event.SelectionEvent
import com.intellij.openapi.editor.event.SelectionListener
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorManagerEvent
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import kotlinx.serialization.Serializable

/**
 * Tracks open files, cursor positions, and selected text in the IDE.
 * Mirrors the behavior of the VS Code companion's OpenFilesManager.
 */
class OpenFilesTracker(private val project: Project) {

    companion object {
        const val MAX_FILES = 10
        const val MAX_SELECTED_TEXT_LENGTH = 16384 // 16 KiB
    }

    @Serializable
    data class CursorPosition(
        val line: Int,
        val character: Int,
    )

    @Serializable
    data class TrackedFile(
        var path: String,
        var timestamp: Long,
        var isActive: Boolean = false,
        var selectedText: String? = null,
        var cursor: CursorPosition? = null,
    )

    private val openFiles = mutableListOf<TrackedFile>()
    private var changeCallback: (() -> Unit)? = null

    fun setChangeCallback(callback: () -> Unit) {
        this.changeCallback = callback
    }

    /**
     * Register all necessary listeners for tracking file state.
     */
    fun registerListeners() {
        val messageBus = project.messageBus.connect()

        // Track file open/close/selection changes
        messageBus.subscribe(
            FileEditorManagerListener.FILE_EDITOR_MANAGER,
            object : FileEditorManagerListener {
                override fun fileOpened(source: FileEditorManager, file: VirtualFile) {
                    if (isDiskFile(file)) {
                        addOrMoveToFront(file.path)
                        notifyChange()
                    }
                }

                override fun fileClosed(source: FileEditorManager, file: VirtualFile) {
                    if (isDiskFile(file)) {
                        removeFile(file.path)
                        notifyChange()
                    }
                }

                override fun selectionChanged(event: FileEditorManagerEvent) {
                    val newFile = event.newFile ?: return
                    if (isDiskFile(newFile)) {
                        addOrMoveToFront(newFile.path)
                        updateActiveContext()
                        notifyChange()
                    }
                }
            }
        )

        // Track cursor position changes
        EditorFactory.getInstance().eventMulticaster.addCaretListener(
            object : CaretListener {
                override fun caretPositionChanged(event: CaretEvent) {
                    val editor = event.editor
                    val file = FileDocumentManager.getInstance()
                        .getFile(editor.document) ?: return
                    if (!isDiskFile(file)) return

                    val tracked = openFiles.find { it.path == file.path && it.isActive }
                        ?: return

                    val caret = event.newPosition
                    tracked.cursor = CursorPosition(
                        line = caret.line + 1,     // 1-based
                        character = caret.column + 1, // 1-based
                    )
                    notifyChange()
                }
            },
            project,
        )

        // Track text selection changes
        EditorFactory.getInstance().eventMulticaster.addSelectionListener(
            object : SelectionListener {
                override fun selectionChanged(event: SelectionEvent) {
                    val editor = event.editor
                    val file = FileDocumentManager.getInstance()
                        .getFile(editor.document) ?: return
                    if (!isDiskFile(file)) return

                    val tracked = openFiles.find { it.path == file.path && it.isActive }
                        ?: return

                    val selectedText = editor.selectionModel.selectedText
                    tracked.selectedText = if (selectedText.isNullOrEmpty()) {
                        null
                    } else if (selectedText.length > MAX_SELECTED_TEXT_LENGTH) {
                        selectedText.substring(0, MAX_SELECTED_TEXT_LENGTH)
                    } else {
                        selectedText
                    }
                    notifyChange()
                }
            },
            project,
        )

        // Initialize with currently active file
        val activeFile = FileEditorManager.getInstance(project).selectedFiles.firstOrNull()
        if (activeFile != null && isDiskFile(activeFile)) {
            addOrMoveToFront(activeFile.path)
        }
    }

    /**
     * Get the current list of tracked files as a snapshot.
     */
    fun getOpenFiles(): List<TrackedFile> = openFiles.toList()

    private fun addOrMoveToFront(filePath: String) {
        // Deactivate current active file
        openFiles.find { it.isActive }?.apply {
            isActive = false
            cursor = null
            selectedText = null
        }

        // Remove if already tracked
        openFiles.removeAll { it.path == filePath }

        // Add to front as active
        openFiles.add(0, TrackedFile(
            path = filePath,
            timestamp = System.currentTimeMillis(),
            isActive = true,
        ))

        // Enforce max length
        while (openFiles.size > MAX_FILES) {
            openFiles.removeAt(openFiles.size - 1)
        }
    }

    private fun removeFile(filePath: String) {
        openFiles.removeAll { it.path == filePath }
    }

    private fun updateActiveContext() {
        val editor = FileEditorManager.getInstance(project).selectedTextEditor ?: return
        val file = FileDocumentManager.getInstance().getFile(editor.document) ?: return
        val tracked = openFiles.find { it.path == file.path && it.isActive } ?: return

        val caret = editor.caretModel.primaryCaret
        tracked.cursor = CursorPosition(
            line = caret.logicalPosition.line + 1,
            character = caret.logicalPosition.column + 1,
        )

        val selectedText = editor.selectionModel.selectedText
        tracked.selectedText = if (selectedText.isNullOrEmpty()) {
            null
        } else if (selectedText.length > MAX_SELECTED_TEXT_LENGTH) {
            selectedText.substring(0, MAX_SELECTED_TEXT_LENGTH)
        } else {
            selectedText
        }
    }

    /**
     * Filter out non-disk files (virtual files, settings, diff editors, etc.)
     */
    private fun isDiskFile(file: VirtualFile): Boolean {
        return file.isInLocalFileSystem && !file.path.contains("/.idea/")
    }

    private fun notifyChange() {
        changeCallback?.invoke()
    }
}
