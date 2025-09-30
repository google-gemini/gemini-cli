package com.google.gemini.cli

import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity

class GeminiCliStartupActivity : StartupActivity {
  override fun runActivity(project: Project) {
    // By getting the service, we are forcing it to be initialized.
    project.getService(GeminiCliProjectService::class.java)
  }
}
