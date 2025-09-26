package com.google.gemini.cli


import com.intellij.ide.impl.isTrusted
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorManagerEvent
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.util.Alarm
import com.intellij.util.messages.MessageBusConnection
import com.intellij.util.messages.Topic
import java.util.*

const val MAX_FILES = 10
const val MAX_SELECTED_TEXT_LENGTH = 16384 // 16 KiB limit

data class File(
    val path: String,
    var timestamp: Long,
    var isActive: Boolean,
    var cursor: Cursor? = null,
    var selectedText: String? = null
)

data class Cursor(
    val line: Int,
    val character: Int
)

data class IdeContext(
    val workspaceState: WorkspaceState?
)

data class WorkspaceState(
    val openFiles: List<File>,
    val isTrusted: Boolean
)

interface IdeContextListener : EventListener {
    fun onIdeContextUpdate()
}

class OpenFilesManager(private val project: Project) : Disposable {
    private val openFiles = mutableListOf<File>()
    private val connection: MessageBusConnection = project.messageBus.connect(this)
    private val alarm = Alarm(Alarm.ThreadToUse.POOLED_THREAD, this)
    private val publisher = project.messageBus.syncPublisher(IDE_CONTEXT_TOPIC)

    companion object {
        val IDE_CONTEXT_TOPIC = Topic.create("Gemini IDE Context Update", IdeContextListener::class.java)
    }

    init {
        connection.subscribe(FileEditorManagerListener.FILE_EDITOR_MANAGER, object : FileEditorManagerListener {
            override fun fileOpened(source: FileEditorManager, file: VirtualFile) {
                addOrMoveToFront(file)
                fireWithDebounce()
            }

            override fun fileClosed(source: FileEditorManager, file: VirtualFile) {
                remove(file)
                fireWithDebounce()
            }

            override fun selectionChanged(event: FileEditorManagerEvent) {
                event.newFile?.let {
                    addOrMoveToFront(it)
                    fireWithDebounce()
                }
            }
        })
    }

    private fun isFileUri(file: VirtualFile): Boolean {
        return file.isInLocalFileSystem
    }

    private fun addOrMoveToFront(file: VirtualFile) {
        if (!isFileUri(file)) return

        openFiles.find { it.isActive }?.apply {
            isActive = false
            cursor = null
            selectedText = null
        }

        val index = openFiles.indexOfFirst { it.path == file.path }
        if (index != -1) {
            openFiles.removeAt(index)
        }

        openFiles.add(0, File(
            path = file.path,
            timestamp = System.currentTimeMillis(),
            isActive = true
        ))

        if (openFiles.size > MAX_FILES) {
            openFiles.removeLast()
        }
    }

    private fun remove(file: VirtualFile) {
        openFiles.removeIf { it.path == file.path }
    }

    private fun fireWithDebounce() {
        alarm.cancelAllRequests()
        alarm.addRequest({
            publisher.onIdeContextUpdate()
        }, 50)
    }

    fun getState(): IdeContext {
        return IdeContext(
            workspaceState = WorkspaceState(
                openFiles = openFiles.toList(),
                isTrusted = project.isTrusted()
            )
        )
    }

    override fun dispose() {
        connection.disconnect()
    }
}
