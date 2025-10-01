package com.google.gemini.cli

import DiffManager
import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project

@Service(Service.Level.PROJECT)
class GeminiCliProjectService(private val project: Project) : Disposable {
  private var openFilesManager: OpenFilesManager? = null
  private var diffManager: DiffManager? = null
  private var ideServer: IDEServer? = null

  init {
    openFilesManager = project.service<OpenFilesManager>()
    diffManager = project.service<DiffManager>()
    diffManager?.let {
      ideServer = IDEServer(project, it)
      ideServer?.start()
    }
  }

  override fun dispose() {
    openFilesManager?.dispose()
    ideServer?.stop()
  }

  fun getServerPort(): Int? {
    return ideServer?.getServerPort()
  }

  fun notifyDiffAccepted(filePath: String, content: String) {
    ideServer?.notifyDiffAccepted(filePath, content)
  }

  fun notifyDiffClosed(filePath: String, content: String) {
    ideServer?.notifyDiffClosed(filePath, content)
  }
}
