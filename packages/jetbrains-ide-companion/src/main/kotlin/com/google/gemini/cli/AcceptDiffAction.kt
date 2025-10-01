package com.google.gemini.cli

import DiffManager
import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.components.service

class AcceptDiffAction(private val filePath: String) : AnAction("Accept", "Accept Gemini's changes", AllIcons.Actions.Checked) {
  override fun actionPerformed(e: AnActionEvent) {
    val project = e.project ?: return
    val diffManager = project.service<DiffManager>()
    diffManager.acceptDiff(filePath)
  }
}
