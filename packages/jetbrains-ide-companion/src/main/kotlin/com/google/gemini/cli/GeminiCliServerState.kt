package com.google.gemini.cli

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import java.util.EventListener

@Service(Service.Level.PROJECT)
class GeminiCliServerState {
    var port: Int? = null
    var workspacePath: String? = null

    companion object {
        val ENV_VAR_SYNC_TOPIC = com.intellij.util.messages.Topic.create("Gemini CLI Environment Variable Sync", EnvVarSyncListener::class.java)
    }
}

interface EnvVarSyncListener : EventListener {
    fun onEnvVarsSyncRequired()
}
