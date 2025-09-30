package com.google.gemini.cli

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project

@Service(Service.Level.PROJECT)
class GeminiCliProjectService(private val project: Project) : Disposable {
    private var openFilesManager: OpenFilesManager? = null

    init {
        openFilesManager = OpenFilesManager(project)
    }

    override fun dispose() {
        openFilesManager?.dispose()
    }
}
