import com.google.gemini.cli.AcceptDiffAction
import com.google.gemini.cli.CloseDiffAction
import com.intellij.diff.DiffContentFactory
import com.intellij.diff.DiffManager
import com.intellij.diff.requests.SimpleDiffRequest
import com.intellij.diff.util.DiffUserDataKeys
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Key
import com.intellij.openapi.vfs.LocalFileSystem

class DiffManager(private val project: Project) {

    companion object {
        val GEMINI_FILE_PATH_KEY: Key<String> = Key.create("gemini.filePath")
    }

    fun showDiff(filePath: String, newContent: String) {
        val file = LocalFileSystem.getInstance().findFileByPath(filePath)

        val content1 = if (file != null) {
            DiffContentFactory.getInstance().create(project, file)
        } else {
            // For new files, the original content is empty.
            DiffContentFactory.getInstance().create("")
        }

        val content2 = DiffContentFactory.getInstance().create(newContent)

        val request = SimpleDiffRequest("Gemini Code Change", content1, content2, "Original", "Gemini's Suggestion")

        // Add custom actions to the diff viewer
        val actions = listOf(CloseDiffAction(filePath), AcceptDiffAction(filePath))
        request.putUserData(DiffUserDataKeys.CONTEXT_ACTIONS, actions)
        request.putUserData(GEMINI_FILE_PATH_KEY, filePath)

        DiffManager.getInstance().showDiff(project, request)
    }
}
