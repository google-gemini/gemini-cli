package com.google.gemini.cli


import com.intellij.ide.impl.isTrusted
import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.EditorFactory
import com.intellij.openapi.editor.event.CaretEvent
import com.intellij.openapi.editor.event.CaretListener
import com.intellij.openapi.editor.event.SelectionEvent
import com.intellij.openapi.editor.event.SelectionListener
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorManagerEvent
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.fileEditor.TextEditor
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.vfs.VirtualFileManager
import com.intellij.openapi.vfs.newvfs.BulkFileListener
import com.intellij.openapi.vfs.newvfs.events.VFileDeleteEvent
import com.intellij.openapi.vfs.newvfs.events.VFileEvent
import com.intellij.openapi.vfs.newvfs.events.VFilePropertyChangeEvent
import com.intellij.util.Alarm
import com.intellij.util.messages.MessageBusConnection
import com.intellij.util.messages.Topic
import java.util.*

import kotlinx.serialization.Serializable

const val MAX_FILES = 10
const val MAX_SELECTED_TEXT_LENGTH = 16384 // 16 KiB limit

@Serializable
data class File(
  var path: String,
  var timestamp: Long,
  var isActive: Boolean,
  var cursor: Cursor? = null,
  var selectedText: String? = null
)

@Serializable
data class Cursor(
  val line: Int,
  val character: Int
)

@Serializable
data class IdeContext(
  val workspaceState: WorkspaceState?
)

@Serializable
data class WorkspaceState(
  val openFiles: List<File>,
  val isTrusted: Boolean
)

interface IdeContextListener : EventListener {
  fun onIdeContextUpdate()
}

@Service(Service.Level.PROJECT)
class OpenFilesManager(private val project: Project) : Disposable {
  private val openFiles = mutableListOf<File>()
  private val connection: MessageBusConnection = project.messageBus.connect(this)
  private val alarm = Alarm(Alarm.ThreadToUse.POOLED_THREAD, this)
  private val publisher = project.messageBus.syncPublisher(IDE_CONTEXT_TOPIC)

  companion object {
    private val LOG = Logger.getInstance(OpenFilesManager::class.java)
    val IDE_CONTEXT_TOPIC = Topic.create("Gemini IDE Context Update", IdeContextListener::class.java)
  }

  init {
    LOG.info("Initializing OpenFilesManager for project: ${project.name}")
    connection.subscribe(FileEditorManagerListener.FILE_EDITOR_MANAGER, object : FileEditorManagerListener {
      override fun fileOpened(source: FileEditorManager, file: VirtualFile) {
        LOG.info("File opened: ${file.path}")
        addOrMoveToFront(file)
        fireWithDebounce()
      }

      override fun fileClosed(source: FileEditorManager, file: VirtualFile) {
        LOG.info("File closed: ${file.path}")
        remove(file)
        fireWithDebounce()
      }

      override fun selectionChanged(event: FileEditorManagerEvent) {
        event.newFile?.let {
          LOG.info("Selection changed to new file: ${it.path}")
          addOrMoveToFront(it)
          fireWithDebounce()
        }
      }
    })

    EditorFactory.getInstance().eventMulticaster.addCaretListener(object : CaretListener {
      override fun caretPositionChanged(event: CaretEvent) {
        val file = event.editor.virtualFile ?: return
        val activeFile = openFiles.firstOrNull { it.isActive } ?: return

        if (file.path == activeFile.path) {
          val logicalPosition = event.newPosition
          activeFile.cursor = Cursor(logicalPosition.line + 1, logicalPosition.column)
          LOG.info("Caret position changed in ${file.path} to L:${activeFile.cursor?.line} C:${activeFile.cursor?.character}")
          fireWithDebounce()
        }
      }
    }, this)

    EditorFactory.getInstance().eventMulticaster.addSelectionListener(object : SelectionListener {
      override fun selectionChanged(event: SelectionEvent) {
        val file = event.editor.virtualFile ?: return
        val activeFile = openFiles.firstOrNull { it.isActive } ?: return

        if (file.path == activeFile.path) {
          var selectedText: String? = event.editor.selectionModel.selectedText
          if (selectedText != null && selectedText.length > MAX_SELECTED_TEXT_LENGTH) {
            var cutIndex = MAX_SELECTED_TEXT_LENGTH
            // Avoid cutting a surrogate pair in half
            if (cutIndex > 0 && Character.isHighSurrogate(selectedText[cutIndex - 1])) {
              cutIndex--
            }
            selectedText = selectedText.take(cutIndex) + "... [TRUNCATED]"
          }
          activeFile.selectedText = selectedText
          LOG.info("Selection changed in ${file.path}: ${selectedText?.take(50)}...")
          fireWithDebounce()
        }
      }
    }, this)

    connection.subscribe(VirtualFileManager.VFS_CHANGES, object : BulkFileListener {
      override fun after(events: List<VFileEvent>) {
        var changed = false
        for (event in events) {
          when (event) {
            is VFileDeleteEvent -> {
              if (openFiles.removeIf { it.path == event.file.path }) {
                LOG.info("File deleted and removed from list: ${event.file.path}")
                changed = true
              }
            }
            is VFilePropertyChangeEvent -> {
              if (event.propertyName == VirtualFile.PROP_NAME) {
                val parentPath = event.file.parent?.path
                val oldFileName = event.oldValue as? String
                if (parentPath != null && oldFileName != null) {
                  val oldAbsolutePath = "$parentPath/$oldFileName"
                  val file = openFiles.find { it.path == oldAbsolutePath }
                  if (file != null) {
                    val newAbsolutePath = event.file.path
                    file.path = newAbsolutePath
                    file.timestamp = System.currentTimeMillis()
                    LOG.info("File rename detected and path updated. From: $oldAbsolutePath, To: $newAbsolutePath")
                    changed = true
                  }
                }
              }
            }
          }
        }
        if (changed) {
          fireWithDebounce()
        }
      }
    })

    // Populate initial state
    val fileEditorManager = FileEditorManager.getInstance(project)
    fileEditorManager.selectedFiles.forEach { file ->
      addOrMoveToFront(file)
    }
    if (openFiles.isNotEmpty()) {
      fireWithDebounce()
    }
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

    updateActiveContext(file)
  }

  private fun remove(file: VirtualFile) {
    openFiles.removeIf { it.path == file.path }
  }

  private fun updateActiveContext(file: VirtualFile) {
    val activeFile = openFiles.firstOrNull { it.path == file.path && it.isActive } ?: return
    val fileEditor = FileEditorManager.getInstance(project).getEditors(file).firstOrNull()

    if (fileEditor is TextEditor) {
      val editor = fileEditor.editor

      // Update cursor
      val caret = editor.caretModel.currentCaret
      activeFile.cursor = Cursor(caret.logicalPosition.line + 1, caret.logicalPosition.column)

      // Update selection
      var selectedText: String? = editor.selectionModel.selectedText
      if (selectedText != null && selectedText.length > MAX_SELECTED_TEXT_LENGTH) {
        selectedText = selectedText.substring(0, MAX_SELECTED_TEXT_LENGTH) + "... [TRUNCATED]"
      }
      activeFile.selectedText = selectedText
    }
  }

  private fun fireWithDebounce() {
    alarm.cancelAllRequests()
    alarm.addRequest(({
      publisher.onIdeContextUpdate()
    }), 50)
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
