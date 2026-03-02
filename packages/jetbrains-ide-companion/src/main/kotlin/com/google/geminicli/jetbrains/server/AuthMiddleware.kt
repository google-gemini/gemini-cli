/*
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

package com.google.geminicli.jetbrains.server

import com.sun.net.httpserver.HttpExchange

/**
 * Security middleware matching the VS Code companion's authentication behavior.
 *
 * Validates:
 * 1. No Origin header (CORS protection — reject browser requests)
 * 2. Host header is localhost or 127.0.0.1
 * 3. Bearer token matches the expected auth token
 */
object AuthMiddleware {

    /**
     * Validate the request. Returns null if valid, or an error response code
     * with message if invalid.
     */
    fun validate(exchange: HttpExchange, port: Int, authToken: String): AuthResult {
        // 1. CORS: reject requests with Origin header
        val origin = exchange.requestHeaders.getFirst("Origin")
        if (origin != null) {
            return AuthResult.Rejected(403, "Request denied by CORS policy.")
        }

        // 2. Host validation
        val host = exchange.requestHeaders.getFirst("Host") ?: ""
        val allowedHosts = setOf("localhost:$port", "127.0.0.1:$port")
        if (host !in allowedHosts) {
            return AuthResult.Rejected(403, "Invalid Host header")
        }

        // 3. Bearer token authentication
        val authHeader = exchange.requestHeaders.getFirst("Authorization")
        if (authHeader == null) {
            return AuthResult.Rejected(401, "Unauthorized")
        }

        val parts = authHeader.split(" ", limit = 2)
        if (parts.size != 2 || parts[0] != "Bearer") {
            return AuthResult.Rejected(401, "Unauthorized")
        }

        if (parts[1] != authToken) {
            return AuthResult.Rejected(401, "Unauthorized")
        }

        return AuthResult.Accepted
    }
}

sealed class AuthResult {
    data object Accepted : AuthResult()
    data class Rejected(val statusCode: Int, val message: String) : AuthResult()
}
