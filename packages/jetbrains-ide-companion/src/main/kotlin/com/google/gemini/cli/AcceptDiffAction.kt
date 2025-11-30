package com.google.gemini.cli

import DiffManager
import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys

class AcceptDiffAction(private val diffManager: DiffManager, private val filePath: String) : AnAction("Accept", "Accept Gemini's changes", AllIcons.Actions.Checked) {
  override fun actionPerformed(e: AnActionEvent) {
    val file = e.getData(CommonDataKeys.VIRTUAL_FILE)
    diffManager.acceptDiff(filePath, file)
  }
}