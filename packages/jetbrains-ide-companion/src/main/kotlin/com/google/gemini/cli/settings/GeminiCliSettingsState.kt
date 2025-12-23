package com.google.gemini.cli.settings

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.util.xmlb.XmlSerializerUtil

@State(
  name = "GeminiCliSettingsState",
  storages = [Storage("GeminiCliSettings.xml")]
)
class GeminiCliSettingsState : PersistentStateComponent<GeminiCliSettingsState> {
  var cliCommand: String = "gemini"

  override fun getState(): GeminiCliSettingsState {
    return this
  }

  override fun loadState(state: GeminiCliSettingsState) {
    XmlSerializerUtil.copyBean(state, this)
  }

  companion object {
    @JvmStatic
    fun getInstance(): GeminiCliSettingsState {
      val application = ApplicationManager.getApplication()
      if (application.isDisposed) {
        // 如果应用已销毁，返回默认实例
        return GeminiCliSettingsState()
      }

      // 确保服务被正确获取，如果不存在则创建
      return application.getService(GeminiCliSettingsState::class.java)
    }
  }
}
