package com.google.gemini.cli.settings

import com.intellij.openapi.options.Configurable
import com.intellij.ui.components.JBTextField
import com.intellij.util.ui.FormBuilder
import javax.swing.JComponent

class GeminiCliSettingsConfigurable : Configurable {
  private var commandField: JBTextField? = null

  override fun getDisplayName(): String {
    return "Gemini CLI"
  }

  override fun createComponent(): JComponent? {
    val settingsState = GeminiCliSettingsState.getInstance()

    // 创建字段并立即赋值给局部变量
    val field = JBTextField(settingsState.cliCommand, 30)
    commandField = field

    return FormBuilder.createFormBuilder()
      .addLabeledComponent("Gemini-CLI commands:", field)
      .addTooltip("Specify the command to run Gemini-CLI (e.g., 'gemini', '/usr/local/bin/gemini')")
      .panel
  }

  override fun isModified(): Boolean {
    val settingsState = GeminiCliSettingsState.getInstance()
    val currentText = commandField?.text
    return currentText != settingsState.cliCommand
  }

  override fun apply() {
    val settingsState = GeminiCliSettingsState.getInstance()
    val currentText = commandField?.text
    val newCommand = currentText?.trim() ?: "gemini"
    println("Gemini CLI Settings: Applying new command: '$newCommand'")
    settingsState.cliCommand = newCommand
  }

  override fun reset() {
    val settingsState = GeminiCliSettingsState.getInstance()
    commandField?.text = settingsState.cliCommand
  }

  override fun disposeUIResources() {
    commandField = null
  }
}
