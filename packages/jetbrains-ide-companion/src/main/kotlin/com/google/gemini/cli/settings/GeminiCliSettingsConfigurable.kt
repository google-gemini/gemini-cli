package com.google.gemini.cli.settings

import com.intellij.openapi.options.Configurable
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.JTextField

class GeminiCliSettingsConfigurable : Configurable {
    private var myTextField: JTextField? = null

    override fun getDisplayName(): String {
        return "Gemini CLI"
    }

    override fun createComponent(): JComponent? {
        val panel = JPanel()
        myTextField = JTextField(20)
        panel.add(myTextField)
        return panel
    }

    override fun isModified(): Boolean {
        return false
    }

    override fun apply() {
        // Save settings
    }

    override fun reset() {
        // Reset settings
    }

    override fun disposeUIResources() {
        myTextField = null
    }
}