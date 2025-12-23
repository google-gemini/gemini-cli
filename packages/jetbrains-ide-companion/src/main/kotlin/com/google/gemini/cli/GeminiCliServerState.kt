package com.google.gemini.cli

import com.intellij.openapi.components.Service

@Service(Service.Level.PROJECT)
class GeminiCliServerState {
    var port: Int? = null
    var token: String? = null
    var workspacePath: String? = null
}
