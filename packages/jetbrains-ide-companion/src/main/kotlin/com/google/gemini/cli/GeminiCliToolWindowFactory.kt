package com.google.gemini.cli

import com.intellij.openapi.project.Project
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory

class GeminiCliToolWindowFactory : ToolWindowFactory, DumbAware {
  override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
    val toolWindowContent = GeminiCliToolWindowContent()
    val content = ContentFactory.SERVICE.getInstance().createContent(toolWindowContent.contentPanel, "", false)
    toolWindow.contentManager.addContent(content)
  }
}
