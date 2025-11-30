package com.google.gemini.cli

import DiffManager
import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys

class CloseDiffAction(private val diffManager: DiffManager, private val filePath: String) : AnAction("Close", "Close the diff view", AllIcons.Actions.Cancel) {
  override fun actionPerformed(e: AnActionEvent) {
    val file = e.getData(CommonDataKeys.VIRTUAL_FILE)
    diffManager.cancelDiff(filePath, file)
  }
}