package com.google.gemini.cli.transport

import com.sun.net.httpserver.HttpExchange
import java.io.InputStream
import java.io.OutputStream

/**
 * An adapter to provide a server-agnostic interface for handling HTTP requests,
 * wrapping the `com.sun.net.httpserver.HttpExchange` object.
 */
class HttpExchangeAdapter(private val exchange: HttpExchange) {

  fun getRequestMethod(): String = exchange.requestMethod

  fun getRequestPath(): String = exchange.requestURI.path

  fun getRequestHeader(name: String): String? = exchange.requestHeaders.getFirst(name)

  fun getRequestBody(): InputStream = exchange.requestBody

  fun setResponseHeader(name: String, value: String) {
    exchange.responseHeaders.add(name, value)
  }

  fun sendResponseHeaders(code: Int, length: Long) {
    exchange.sendResponseHeaders(code, length)
  }

  fun getResponseBody(): OutputStream = exchange.responseBody

  fun close() {
    exchange.close()
  }
}
