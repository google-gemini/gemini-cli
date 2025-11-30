package com.google.gemini.cli

import com.intellij.ui.components.JBPanel
import javax.swing.JLabel
import java.awt.BorderLayout

class GeminiCliToolWindowContent {
  val contentPanel: JBPanel<*>

  init {
    contentPanel = JBPanel<JBPanel<*>>(BorderLayout())
    contentPanel.add(JLabel("Gemini CLI Companion"), BorderLayout.CENTER)
  }
}
