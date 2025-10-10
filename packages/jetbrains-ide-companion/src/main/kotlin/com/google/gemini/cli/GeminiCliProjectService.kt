package com.google.gemini.cli

import DiffManager
import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import kotlinx.coroutines.*

@Service(Service.Level.PROJECT)
class GeminiCliProjectService(private val project: Project) : Disposable {
  private val coroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
  private var openFilesManager: OpenFilesManager? = null
  private var diffManager: DiffManager? = null
  private var ideServer: IdeServer? = null

  init {
    openFilesManager = project.service<OpenFilesManager>()
    diffManager = project.service<DiffManager>()
    diffManager?.let {
      ideServer = IdeServer(project, it)
      coroutineScope.launch {
        ideServer?.start()
      }
    }
  }

  override fun dispose() {
    openFilesManager?.dispose()
    ideServer?.stop()
    coroutineScope.cancel()
  }

}
