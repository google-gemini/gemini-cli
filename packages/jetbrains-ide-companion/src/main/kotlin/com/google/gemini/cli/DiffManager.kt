import com.google.gemini.cli.AcceptDiffAction
import com.google.gemini.cli.CloseDiffAction
import com.intellij.diff.DiffContentFactory
import com.intellij.diff.DiffManager
import com.intellij.diff.chains.SimpleDiffRequestChain
import com.intellij.diff.contents.DocumentContent
import com.intellij.diff.editor.ChainDiffVirtualFile
import com.intellij.diff.requests.ContentDiffRequest
import com.intellij.diff.requests.SimpleDiffRequest
import com.intellij.diff.util.DiffUserDataKeys
import com.intellij.diff.util.DiffUserDataKeysEx
import com.intellij.diff.util.Side
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Key
import com.intellij.openapi.diff.DiffBundle
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.wm.IdeFocusManager
import com.intellij.util.messages.Topic
import io.modelcontextprotocol.kotlin.sdk.JSONRPCNotification
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.nio.file.Paths
import java.util.*

/**
 * Manages the state and lifecycle of Gemini diff views within the IDE.
 */
@Service(Service.Level.PROJECT)
class DiffManager(private val project: Project) : Disposable {

  private data class DiffInfo(
    val originalFilePath: String,
    val originalContent: String?,
    val newContent: String
  )

  private val diffDocuments = mutableMapOf<String, DiffInfo>()
  private val publisher = project.messageBus.syncPublisher(DIFF_MANAGER_TOPIC)

  /**
   * Listener for events originating from the DiffManager.
   */
  interface DiffManagerListener : EventListener {
    /**
     * Fired when a diff-related event should be sent as a notification.
     */
    fun onDiffNotification(notification: JSONRPCNotification)
  }

  companion object {
    val GEMINI_FILE_PATH_KEY: Key<String> = Key.create("gemini.filePath")
    val DIFF_MANAGER_TOPIC = Topic.create("Gemini DiffManager Update", DiffManagerListener::class.java)
  }

  /**
   * Creates and shows a new diff view.
   *
   * @param filePath The absolute path to the file. For new files, this path is used for the editor tab title.
   * @param newContent The new content to be displayed in the right panel of the diff.
   */
  fun showDiff(filePath: String, newContent: String) {
    val file = LocalFileSystem.getInstance().findFileByPath(filePath)

    val content1 = if (file != null) {
      DiffContentFactory.getInstance().create(project, file)
    } else {
      // For new files, the original content is empty.
      DiffContentFactory.getInstance().create("")
    }

    val content2 = DiffContentFactory.getInstance().createEditable(project, newContent, file?.fileType)

    val diffTitle = "${Paths.get(filePath).fileName} ↔ Modified"
    val request = SimpleDiffRequest(diffTitle, content1, content2, "Original", "Gemini's suggestion")

    // Make left side read-only and right side editable to enable revert button behavior
    request.putUserData(DiffUserDataKeys.MASTER_SIDE, Side.RIGHT)
    request.putUserData(DiffUserDataKeys.PREFERRED_FOCUS_SIDE, Side.RIGHT)
    request.putUserData(DiffUserDataKeys.FORCE_READ_ONLY_CONTENTS, booleanArrayOf(true, false))
    request.putUserData(DiffUserDataKeysEx.LAST_REVISION_WITH_LOCAL, true)
    request.putUserData(DiffUserDataKeysEx.VCS_DIFF_ACCEPT_LEFT_ACTION_TEXT, DiffBundle.message("action.presentation.diff.revert.text"))
    // Add custom actions to the diff viewer
    val actions = listOf(CloseDiffAction(this, filePath), AcceptDiffAction(this, filePath))
    request.putUserData(DiffUserDataKeys.CONTEXT_ACTIONS, actions)
    request.putUserData(GEMINI_FILE_PATH_KEY, filePath)

    // 1. Before showing the diff, get the component that currently has focus.
    val lastFocusedComponent = IdeFocusManager.getInstance(project).focusOwner

    DiffManager.getInstance().showDiff(project, request)

    // 2. After showing the diff, request focus to be returned to the component that had it before.
    ApplicationManager.getApplication().invokeLater {
      lastFocusedComponent?.let {
        IdeFocusManager.getInstance(project).requestFocus(it, true)
      }
    }

    // Add state tracking
    val originalContent = file?.let { VfsUtil.loadText(it) }
    diffDocuments[filePath] = DiffInfo(
      originalFilePath = filePath,
      originalContent = originalContent,
      newContent = newContent
    )
  }

  /**
   * Closes a diff view and returns its final content, sending an `ide/diffClosed` notification.
   * This is used by the `closeDiff` tool.
   *
   * @param filePath The path of the file whose diff view should be closed.
   * @param suppressNotification If true, a notification about the closure will not be sent.
   * @return The final content of the editor pane before it was closed, or null if not found.
   */
  fun closeDiff(filePath: String, suppressNotification: Boolean = false): String? {
    val diffInfo = diffDocuments[filePath] ?: return null
    val modifiedContent = closeDiffEditor(null, filePath)
    diffDocuments.remove(filePath)
    val finalContent = modifiedContent ?: diffInfo.newContent

    if (!suppressNotification) {
      val notification = JSONRPCNotification(
          method = "ide/diffClosed",
          params = buildJsonObject {
              put("filePath", filePath)
              put("content", finalContent)
          }
      )
      publisher.onDiffNotification(notification)
    }

    return finalContent
  }

  /**
   * Handles the user accepting the changes in a diff view.
   * Closes the editor and publishes an `ide/diffAccepted` notification.
   *
   * @param filePath The path of the file whose diff was accepted.
   */
  fun acceptDiff(filePath: String, file: VirtualFile?) {
    val diffInfo = diffDocuments[filePath] ?: return

    val modifiedContent = closeDiffEditor(file, filePath)

    diffDocuments.remove(filePath)

    val notification = JSONRPCNotification(
      method = "ide/diffAccepted",
      params = buildJsonObject {
        put("filePath", filePath)
        put("content", modifiedContent ?: diffInfo.newContent)
      }
    )
    publisher.onDiffNotification(notification)
  }

  /**
   * Handles the user closing/canceling the diff view from the UI.
   * Closes the editor and publishes an `ide/diffClosed` notification.
   */
  fun cancelDiff(filePath: String, file: VirtualFile?) {
    val diffInfo = diffDocuments[filePath] ?: return

    val modifiedContent = closeDiffEditor(file, filePath)
    diffDocuments.remove(filePath)

    val notification = JSONRPCNotification(
        method = "ide/diffClosed",
        params = buildJsonObject {
            put("filePath", filePath)
            put("content", modifiedContent ?: diffInfo.newContent)
        }
    )
    publisher.onDiffNotification(notification)
  }

  private fun closeDiffEditor(fileToClose: VirtualFile?, filePath: String): String? {
    val fileEditorManager = FileEditorManager.getInstance(project)
    val actualFileToClose = fileToClose ?: run {
      var foundFile: VirtualFile? = null
      for (file in fileEditorManager.openFiles) {
        if (file is ChainDiffVirtualFile) {
          val producer = file.chain.requests.firstOrNull()
          if (producer is SimpleDiffRequestChain.DiffRequestProducerWrapper) {
            val request = producer.request
            val userData = request.getUserData(GEMINI_FILE_PATH_KEY)
            if (userData == filePath) {
              foundFile = file
              break
            }
          }
        }
      }
      foundFile
    }

    var content: String? = null
    actualFileToClose?.let { file ->
      if (file is ChainDiffVirtualFile) {
        val producer = file.chain.requests.firstOrNull()
        if (producer is SimpleDiffRequestChain.DiffRequestProducerWrapper) {
          val request = producer.request
          if (request is ContentDiffRequest && request.contents.size > 1) {
            val centerDiffContent = request.contents.getOrNull(1)
            if (centerDiffContent is DocumentContent) {
              ApplicationManager.getApplication().runReadAction {
                content = centerDiffContent.document.text
              }
            }
          }
        }
      }

      ApplicationManager.getApplication().invokeLater {
        fileEditorManager.closeFile(file)
      }
    }
    return content
  }

  /**
   * Cleans up the internal state of the manager.
   */
  override fun dispose() {
    diffDocuments.clear()
  }
}
