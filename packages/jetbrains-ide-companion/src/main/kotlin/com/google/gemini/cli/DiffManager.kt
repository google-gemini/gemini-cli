import com.google.gemini.cli.AcceptDiffAction
import com.google.gemini.cli.CloseDiffAction
import com.intellij.diff.DiffContentFactory
import com.intellij.diff.DiffManager
import com.intellij.diff.requests.SimpleDiffRequest
import com.intellij.diff.util.DiffUserDataKeys
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.TextEditor
import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Key
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.util.messages.Topic
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import io.modelcontextprotocol.kotlin.sdk.JSONRPCNotification
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.util.EventListener

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

    val content2 = DiffContentFactory.getInstance().create(project, newContent, file?.fileType)

    val request = SimpleDiffRequest("Gemini Code Change", content1, content2, "Original", "Gemini's Suggestion")

    // Add custom actions to the diff viewer
    val actions = listOf(CloseDiffAction(this, filePath), AcceptDiffAction(this, filePath))
    request.putUserData(DiffUserDataKeys.CONTEXT_ACTIONS, actions)
    request.putUserData(GEMINI_FILE_PATH_KEY, filePath)

    DiffManager.getInstance().showDiff(project, request)

    // Add state tracking
    val originalContent = file?.let { VfsUtil.loadText(it) }
    diffDocuments[filePath] = DiffInfo(
      originalFilePath = filePath,
      originalContent = originalContent,
      newContent = newContent
    )
  }

  /**
   * Programmatically closes an open diff view for a specific file.
   *
   * @param filePath The path of the file whose diff view should be closed.
   * @param suppressNotification If true, a notification about the closure will not be sent.
   * @return The final content of the editor pane before it was closed, or null if not found.
   */
  fun rejectDiff(filePath: String, suppressNotification: Boolean = false) =
    rejectDiff(filePath, null, suppressNotification)

  fun rejectDiff(filePath: String, file: VirtualFile?, suppressNotification: Boolean = false): String? {
    val diffInfo = diffDocuments[filePath] ?: return null

    closeDiffEditor(file, filePath)

    diffDocuments.remove(filePath)

    if (!suppressNotification) {
      val notification = JSONRPCNotification(
        method = "ide/diffRejected",
        params = buildJsonObject {
          put("filePath", filePath)
          put("content", diffInfo.originalContent)
        }
      )
      publisher.onDiffNotification(notification)
    }

    return diffInfo.originalContent
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

  fun cancelDiff(filePath: String, file: VirtualFile?) {
    rejectDiff(filePath, file, suppressNotification = true)
  }

  private fun closeDiffEditor(fileToClose: VirtualFile?, filePath: String): String? {
    val fileEditorManager = FileEditorManager.getInstance(project)
    val actualFileToClose = fileToClose ?: fileEditorManager.openFiles.find {
      it.getUserData(GEMINI_FILE_PATH_KEY) == filePath
    }

    var content: String? = null
    actualFileToClose?.let { file ->
      // It's important to get the content before closing the editor.
      val editor = fileEditorManager.getSelectedEditor(file)
      if (editor is TextEditor) {
        // Must be run in a read action
        ApplicationManager.getApplication().runReadAction {
          content = editor.editor.document.text
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
