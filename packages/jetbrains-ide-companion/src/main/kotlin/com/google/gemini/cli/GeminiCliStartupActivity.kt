package com.google.gemini.cli

import com.intellij.ide.plugins.PluginManagerCore
import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.extensions.PluginId
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity

class GeminiCliStartupActivity : StartupActivity {
  override fun runActivity(project: Project) {
    // By getting the service, we are forcing it to be initialized.
    project.getService(GeminiCliProjectService::class.java)

    // Check for updates
    ApplicationManager.getApplication().getService(UpdateChecker::class.java).checkForUpdates(project)

    // Show installation welcome message if this is the first run
    showInstallationWelcome(project)
  }

  private fun showInstallationWelcome(project: Project) {
    val pluginId = PluginId.getId("com.google.gemini-cli")
    val plugin = PluginManagerCore.getPlugin(pluginId)

    if (plugin != null) {
      // Check if this is the first run using persistent state
      val welcomeState = ApplicationManager.getApplication().getService(WelcomeState::class.java)

      if (!welcomeState.welcomeShown) {
        ApplicationManager.getApplication().invokeLater {
          val notification = Notification(
            "Gemini CLI",
            "Gemini CLI Companion Installed",
            "Gemini CLI Companion plugin successfully installed. You can now use Gemini CLI with direct access to your IDE workspace.",
            NotificationType.INFORMATION
          )
          notification.notify(project)

          // Mark as shown
          welcomeState.welcomeShown = true
        }
      }
    }
  }
}

@Service(Service.Level.APP)
@State(name = "GeminiCliWelcomeState", storages = [Storage("gemini-cli-welcome.xml")])
class WelcomeState : PersistentStateComponent<WelcomeState.State> {
  data class State(var welcomeShown: Boolean = false)

  private var state = State()

  var welcomeShown: Boolean
    get() = state.welcomeShown
    set(value) {
      state.welcomeShown = value
    }

  override fun getState(): State = state

  override fun loadState(state: State) {
    this.state = state
  }
}
