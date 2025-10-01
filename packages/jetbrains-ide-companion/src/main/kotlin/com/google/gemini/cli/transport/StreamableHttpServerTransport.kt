package com.google.gemini.cli.transport

import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.request.contentType
import io.ktor.server.request.header
import io.ktor.server.request.host
import io.ktor.server.request.httpMethod
import io.ktor.server.request.receiveText
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondNullable
import io.ktor.server.sse.ServerSSESession
import io.ktor.util.collections.ConcurrentMap
import io.modelcontextprotocol.kotlin.sdk.ErrorCode
import io.modelcontextprotocol.kotlin.sdk.JSONRPCError
import io.modelcontextprotocol.kotlin.sdk.JSONRPCMessage
import io.modelcontextprotocol.kotlin.sdk.JSONRPCRequest
import io.modelcontextprotocol.kotlin.sdk.JSONRPCResponse
import io.modelcontextprotocol.kotlin.sdk.LATEST_PROTOCOL_VERSION
import io.modelcontextprotocol.kotlin.sdk.Method
import io.modelcontextprotocol.kotlin.sdk.RequestId
import io.modelcontextprotocol.kotlin.sdk.SUPPORTED_PROTOCOL_VERSIONS
import io.modelcontextprotocol.kotlin.sdk.shared.AbstractTransport
import io.modelcontextprotocol.kotlin.sdk.shared.McpJson
import kotlinx.coroutines.job
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlin.concurrent.atomics.AtomicBoolean
import kotlin.concurrent.atomics.ExperimentalAtomicApi
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

internal const val MCP_SESSION_ID_HEADER = "mcp-session-id"
private const val MCP_PROTOCOL_VERSION_HEADER = "mcp-protocol-version"
private const val MCP_RESUMPTION_TOKEN_HEADER = "Last-Event-ID"

/**
 * Interface for resumability support via event storage
 */
public interface EventStore {
    /**
     * Stores an event for later retrieval
     * @param streamId ID of the stream the event belongs to
     * @param message The JSON-RPC message to store
     * @returns The generated event ID for the stored event
     */
    public suspend fun storeEvent(streamId: String, message: JSONRPCMessage): String

    /**
     * Replays events after the specified event ID
     * @param lastEventId The last event ID that was received
     * @param sender Function to send events
     * @return The stream ID for the replayed events
     */
    public suspend fun replayEventsAfter(
        lastEventId: String,
        sender: suspend (eventId: String, message: JSONRPCMessage) -> Unit,
    ): String
}

/**
 * A holder for an active request call.
 * If enableJsonResponse is true, session is null.
 * Otherwise, session is not null.
 */
private data class SessionContext(val session: ServerSSESession?, val call: ApplicationCall)

/**
 * Server transport for Streamable HTTP: this implements the MCP Streamable HTTP transport specification.
 * It supports both SSE streaming and direct HTTP responses.
 *
 * In stateful mode:
 * - Session ID is generated and included in response headers
 * - Session ID is always included in initialization responses
 * - Requests with invalid session IDs are rejected with 404 Not Found
 * - Non-initialization requests without a session ID are rejected with 400 Bad Request
 * - State is maintained in-memory (connections, message history)
 *
 * In stateless mode:
 * - No Session ID is included in any responses
 * - No session validation is performed
 *
 * @param enableJsonResponse If true, the server will return JSON responses instead of starting an SSE stream.
 * This can be useful for simple request/response scenarios without streaming.
 * Default is false (SSE streams are preferred).
 * @param enableDnsRebindingProtection Enable DNS rebinding protection (requires allowedHosts and/or allowedOrigins to be configured).
 * Default is false for backwards compatibility.
 * @param allowedHosts List of allowed host header values for DNS rebinding protection.
 * If not specified, host validation is disabled.
 * @param allowedOrigins List of allowed origin header values for DNS rebinding protection.
 * If not specified, origin validation is disabled.
 * @param eventStore Event store for resumability support
 * If provided, resumability will be enabled, allowing clients to reconnect and resume messages
 */
@OptIn(ExperimentalUuidApi::class, ExperimentalAtomicApi::class)
public class StreamableHttpServerTransport(
    private val enableJsonResponse: Boolean = false,
    private val enableDnsRebindingProtection: Boolean = false,
    private val allowedHosts: List<String>? = null,
    private val allowedOrigins: List<String>? = null,
    private val eventStore: EventStore? = null,
) : AbstractTransport() {
    public var sessionId: String? = null
        private set

    private var sessionIdGenerator: (() -> String)? = { Uuid.random().toString() }
    private var onSessionInitialized: ((sessionId: String) -> Unit)? = null
    private var onSessionClosed: ((sessionId: String) -> Unit)? = null

    private val started: AtomicBoolean = AtomicBoolean(false)
    private val initialized: AtomicBoolean = AtomicBoolean(false)

    private val streamsMapping: ConcurrentMap<String, SessionContext> = ConcurrentMap()
    private val requestToStreamMapping: ConcurrentMap<RequestId, String> = ConcurrentMap()
    private val requestToResponseMapping: ConcurrentMap<RequestId, JSONRPCMessage> = ConcurrentMap()

    private val sessionMutex = Mutex()
    private val streamMutex = Mutex()

    private companion object {
        const val STANDALONE_SSE_STREAM_ID = "_GET_stream"
    }

    /**
     * Function that generates a session ID for the transport.
     * The session ID SHOULD be globally unique and cryptographically secure
     * (e.g., a securely generated UUID, a JWT, or a cryptographic hash)
     *
     * Set undefined to disable session management.
     */
    public fun setSessionIdGenerator(block: (() -> String)?) {
        sessionIdGenerator = block
    }

    /**
     * A callback for session initialization events
     * This is called when the server initializes a new session.
     * Useful in cases when you need to register multiple mcp sessions
     * and need to keep track of them.
     */
    public fun setOnSessionInitialized(block: ((String) -> Unit)?) {
        onSessionInitialized = block
    }

    /**
     * A callback for session close events
     * This is called when the server closes a session due to a DELETE request.
     * Useful in cases when you need to clean up resources associated with the session.
     * Note that this is different from the transport closing, if you are handling
     * HTTP requests from multiple nodes you might want to close each
     * StreamableHTTPServerTransport after a request is completed while still keeping the
     * session open/running.
     */
    public fun setOnSessionClosed(block: ((String) -> Unit)?) {
        onSessionClosed = block
    }

    override suspend fun start() {
        check(started.compareAndSet(expectedValue = false, newValue = true)) {
            "StreamableHttpServerTransport already started! If using Server class, note that connect() calls start() automatically."
        }
    }

    override suspend fun send(message: JSONRPCMessage) {
        val requestId: RequestId? = when (message) {
            is JSONRPCResponse -> message.id
            else -> null
        }

        // Standalone SSE stream
        if (requestId == null) {
            require(message !is JSONRPCResponse && message !is JSONRPCError) {
                "Cannot send a response on a standalone SSE stream unless resuming a previous client request"
            }
            val standaloneStream = streamsMapping[STANDALONE_SSE_STREAM_ID] ?: return
            emitOnStream(STANDALONE_SSE_STREAM_ID, standaloneStream.session!!, message)
            return
        }

        val streamId = requestToStreamMapping[requestId]
            ?: error("No connection established for request ID: $requestId")
        val activeStream = streamsMapping[streamId]

        if (!enableJsonResponse) {
            activeStream?.let { stream ->
                emitOnStream(streamId, stream.session!!, message)
            }
        }

        val isTerminated = message is JSONRPCResponse || message is JSONRPCError
        if (!isTerminated) return

        requestToResponseMapping[requestId] = message
        val relatedIds = requestToStreamMapping.filterValues { it == streamId }.keys

        val allResponseReady = relatedIds.all { it in requestToResponseMapping }
        if (!allResponseReady) return

        streamMutex.withLock {
            if (activeStream == null) error("No connection established for request ID: $requestId")

            if (enableJsonResponse) {
                activeStream.call.response.header(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                sessionId?.let { activeStream.call.response.header(MCP_SESSION_ID_HEADER, it) }
                val responses = relatedIds
                    .mapNotNull { requestToResponseMapping[it] }
                    .map { McpJson.encodeToString(it) }
                val payload = if (responses.size == 1) {
                    responses.first()
                } else {
                    responses
                }
                activeStream.call.respond(payload)
            }

            // Clean up
            relatedIds.forEach { requestId ->
                requestToResponseMapping.remove(requestId)
                requestToStreamMapping.remove(requestId)
            }
        }
    }

    override suspend fun close() {
        streamMutex.withLock {
            streamsMapping.values.forEach {
                try {
                    it.session?.close()
                } catch (_: Exception) {}
            }
            streamsMapping.clear()
            requestToResponseMapping.clear()
            _onClose()
        }
    }

    /**
     * Handles an incoming HTTP request, whether GET, POST or DELETE
     */
    public suspend fun handleRequest(session: ServerSSESession?, call: ApplicationCall) {
        validateHeaders(call)?.let { reason ->
            call.reject(HttpStatusCode.Forbidden, ErrorCode.Unknown(-32000), reason)
            _onError(Error(reason))
            return
        }

        when (call.request.httpMethod) {
            HttpMethod.Post -> handlePostRequest(session, call)

            HttpMethod.Get -> handleGetRequest(session, call)

            HttpMethod.Delete -> handleDeleteRequest(session, call)

            else -> call.run {
                response.header(HttpHeaders.Allow, "GET, POST, DELETE")
                reject(HttpStatusCode.MethodNotAllowed, ErrorCode.Unknown(-32000), "Method not allowed.")
            }
        }
    }

    /**
     * Handles POST requests containing JSON-RPC messages
     */
    public suspend fun handlePostRequest(session: ServerSSESession?, call: ApplicationCall) {
        try {
            val acceptHeader = call.request.header(HttpHeaders.Accept)
            val isAcceptEventStream = acceptHeader.accepts(ContentType.Text.EventStream)
            val isAcceptJson = acceptHeader.accepts(ContentType.Application.Json)

            if (!isAcceptEventStream || !isAcceptJson) {
                call.reject(
                    HttpStatusCode.NotAcceptable,
                    ErrorCode.Unknown(-32000),
                    "Not Acceptable: Client must accept both application/json and text/event-stream",
                )
                return
            }

            if (!call.request.contentType().match(ContentType.Application.Json)) {
                call.reject(
                    HttpStatusCode.UnsupportedMediaType,
                    ErrorCode.Unknown(-32000),
                    "Unsupported Media Type: Content-Type must be application/json",
                )
                return
            }

            val messages = parseBody(call) ?: return
            val isInitializationRequest = messages.any {
                it is JSONRPCRequest && it.method == Method.Defined.Initialize.value
            }

            if (isInitializationRequest) {
                if (initialized.load() && sessionId != null) {
                    call.reject(
                        HttpStatusCode.BadRequest,
                        ErrorCode.Defined.InvalidRequest,
                        "Invalid Request: Server already initialized",
                    )
                    return
                }
                if (messages.size > 1) {
                    call.reject(
                        HttpStatusCode.BadRequest,
                        ErrorCode.Defined.InvalidRequest,
                        "Invalid Request: Only one initialization request is allowed",
                    )
                    return
                }

                sessionMutex.withLock {
                    if (sessionId != null) return@withLock
                    sessionId = sessionIdGenerator?.invoke()
                    initialized.store(true)
                    sessionId?.let { onSessionInitialized?.invoke(it) }
                }
            } else {
                if (!validateSession(call) || !validateProtocolVersion(call)) return
            }

            val hasRequest = messages.any { it is JSONRPCRequest }
            if (!hasRequest) {
                call.respondNullable(status = HttpStatusCode.Accepted, message = null)
                messages.forEach { message -> _onMessage(message) }
                return
            }

            val streamId = Uuid.random().toString()
            if (!enableJsonResponse) {
                call.appendSseHeaders()
            }

            streamMutex.withLock {
                streamsMapping[streamId] = SessionContext(session, call)
                messages.filterIsInstance<JSONRPCRequest>().forEach { requestToStreamMapping[it.id] = streamId }
            }
            call.coroutineContext.job.invokeOnCompletion { streamsMapping.remove(streamId) }

            messages.forEach { message -> _onMessage(message) }
        } catch (e: Exception) {
            call.reject(
                HttpStatusCode.BadRequest,
                ErrorCode.Defined.ParseError,
                "Parse error: ${e.message}",
            )
            _onError(e)
        }
    }

    public suspend fun handleGetRequest(session: ServerSSESession?, call: ApplicationCall) {
        if (enableJsonResponse) {
            call.reject(
                HttpStatusCode.MethodNotAllowed,
                ErrorCode.Unknown(-32000),
                "Method not allowed.",
            )
            return
        }
        session!!

        val acceptHeader = call.request.header(HttpHeaders.Accept)
        if (!acceptHeader.accepts(ContentType.Text.EventStream)) {
            call.reject(
                HttpStatusCode.NotAcceptable,
                ErrorCode.Unknown(-32000),
                "Not Acceptable: Client must accept text/event-stream",
            )
            return
        }

        if (!validateSession(call) || !validateProtocolVersion(call)) return

        eventStore?.let { store ->
            call.request.header(MCP_RESUMPTION_TOKEN_HEADER)?.let { lastEventId ->
                replayEvents(store, lastEventId, session)
                return
            }
        }

        if (STANDALONE_SSE_STREAM_ID in streamsMapping) {
            call.reject(
                HttpStatusCode.Conflict,
                ErrorCode.Unknown(-32000),
                "Conflict: Only one SSE stream is allowed per session",
            )
            return
        }

        call.appendSseHeaders()
        session.send(data = "") // flush headers immediately
        streamsMapping[STANDALONE_SSE_STREAM_ID] = SessionContext(session, call)
        session.coroutineContext.job.invokeOnCompletion { streamsMapping.remove(STANDALONE_SSE_STREAM_ID) }
    }

    public suspend fun handleDeleteRequest(session: ServerSSESession?, call: ApplicationCall) {
        if (enableJsonResponse) {
            call.reject(
                HttpStatusCode.MethodNotAllowed,
                ErrorCode.Unknown(-32000),
                "Method not allowed.",
            )
        }

        if (!validateSession(call) || !validateProtocolVersion(call)) return
        sessionId?.let { onSessionClosed?.invoke(it) }
        close()
        call.respondNullable(status = HttpStatusCode.OK, message = null)
    }

    private suspend fun replayEvents(store: EventStore, lastEventId: String, session: ServerSSESession) {
        val call: ApplicationCall = session.call

        try {
            call.appendSseHeaders()
            val streamId = store.replayEventsAfter(lastEventId) { eventId, message ->
                try {
                    session.send(
                        event = "message",
                        id = eventId,
                        data = McpJson.encodeToString(message),
                    )
                } catch (e: Exception) {
                    _onError(e)
                }
            }
            streamsMapping[streamId] = SessionContext(session, call)
        } catch (e: Exception) {
            _onError(e)
        }
    }

    private suspend fun validateSession(call: ApplicationCall): Boolean {
        if (sessionIdGenerator == null) return true

        if (!initialized.load()) {
            call.reject(
                HttpStatusCode.BadRequest,
                ErrorCode.Unknown(-32000),
                "Bad Request: Server not initialized",
            )
            return false
        }

        val headerId = call.request.header(MCP_SESSION_ID_HEADER)

        return when {
            headerId == null -> {
                call.reject(
                    HttpStatusCode.BadRequest,
                    ErrorCode.Unknown(-32000),
                    "Bad Request: Mcp-Session-Id header is required",
                )
                false
            }

            headerId != sessionId -> {
                call.reject(
                    HttpStatusCode.NotFound,
                    ErrorCode.Unknown(-32001),
                    "Session not found",
                )
                false
            }

            else -> true
        }
    }

    private suspend fun validateProtocolVersion(call: ApplicationCall): Boolean {
        val version = call.request.header(MCP_PROTOCOL_VERSION_HEADER) ?: LATEST_PROTOCOL_VERSION

        return when (version) {
            !in SUPPORTED_PROTOCOL_VERSIONS -> {
                call.reject(
                    HttpStatusCode.BadRequest,
                    ErrorCode.Unknown(-32000),
                    "Bad Request: Unsupported protocol version (supported versions: ${
                        SUPPORTED_PROTOCOL_VERSIONS.joinToString(
                            ", ",
                        )
                    })",
                )
                false
            }

            else -> true
        }
    }

    private fun validateHeaders(call: ApplicationCall): String? {
        if (!enableDnsRebindingProtection) return null

        allowedHosts?.let { hosts ->
            val hostHeader = call.request.host().substringBefore(':').lowercase()
            if (hostHeader !in hosts.map { it.substringBefore(':').lowercase() }) {
                return "Invalid Host header: $hostHeader"
            }
        }

        allowedOrigins?.let { origins ->
            val originHeader = call.request.headers[HttpHeaders.Origin]?.removeSuffix("/")?.lowercase()
            if (originHeader !in origins.map { it.removeSuffix("/").lowercase() }) {
                return "Invalid Origin header: $originHeader"
            }
        }

        return null
    }

    private suspend fun parseBody(call: ApplicationCall): List<JSONRPCMessage>? {
        val body = call.receiveText()
        return when (val element = McpJson.parseToJsonElement(body)) {
            is JsonObject -> listOf(McpJson.decodeFromJsonElement(element))

            is JsonArray -> McpJson.decodeFromJsonElement<List<JSONRPCMessage>>(element)

            else -> {
                call.reject(
                    HttpStatusCode.BadRequest,
                    ErrorCode.Defined.InvalidRequest,
                    "Invalid Request: unable to parse JSON body",
                )
                return null
            }
        }
    }

    private fun String?.accepts(mime: ContentType): Boolean {
        if (this == null) return false

        val escaped = Regex.escape(mime.toString())
        val pattern = Regex("""(^|,\s*)$escaped(\s*(;|,|$))""", RegexOption.IGNORE_CASE)
        return pattern.containsMatchIn(this)
    }

    private suspend fun emitOnStream(streamId: String, session: ServerSSESession, message: JSONRPCMessage) {
        val eventId = eventStore?.storeEvent(streamId, message)
        try {
            session.send(event = "message", id = eventId, data = McpJson.encodeToString(message))
        } catch (_: Exception) {
            streamsMapping.remove(streamId)
        }
    }

    private fun ApplicationCall.appendSseHeaders() {
        this.response.headers.append(HttpHeaders.ContentType, ContentType.Text.EventStream.toString())
        this.response.headers.append(HttpHeaders.CacheControl, "no-cache, no-transform")
        this.response.headers.append(HttpHeaders.Connection, "keep-alive")
        sessionId?.let { this.response.headers.append(MCP_SESSION_ID_HEADER, it) }
        this.response.status(HttpStatusCode.OK)
    }
}

internal suspend fun ApplicationCall.reject(status: HttpStatusCode, code: ErrorCode, message: String) {
    this.response.status(status)
    this.respond(
        JSONRPCResponse(
            id = RequestId.StringId("-1"),
            error = JSONRPCError(message = message, code = code),
        ),
    )
}
