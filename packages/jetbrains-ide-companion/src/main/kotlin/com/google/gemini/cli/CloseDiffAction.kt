package com.google.gemini.cli

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.fileEditor.FileEditorManager

class CloseDiffAction(private val filePath: String) : AnAction("Close", "Close the diff view", AllIcons.Actions.Cancel) {
  override fun actionPerformed(e: AnActionEvent) {
    val logger = Logger.getInstance(javaClass)
    logger.info("Close action performed for file: $filePath")

    val project = e.project ?: return
    val editor = e.getData(CommonDataKeys.EDITOR)
    val file = e.getData(CommonDataKeys.VIRTUAL_FILE) // This is the diff view file

    if (editor != null) {
      val content = editor.document.text
      project.getService(GeminiCliProjectService::class.java)?.notifyDiffClosed(filePath, content)
    }

    if (file != null) {
      FileEditorManager.getInstance(project).closeFile(file)
    }
  }
}
