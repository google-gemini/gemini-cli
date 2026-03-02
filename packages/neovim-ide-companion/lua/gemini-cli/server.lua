-- Copyright 2026 Google LLC
-- SPDX-License-Identifier: Apache-2.0

local auth = require("gemini-cli.auth")
local mcp = require("gemini-cli.mcp")

local M = {}

--- @class ServerState
--- @field tcp userdata libuv TCP handle
--- @field port number
--- @field auth_token string
--- @field sessions table<string, table> Session ID -> session data
--- @field sse_clients table<string, table> Session ID -> { client, response_written }
--- @field diff_contents table<string, string> filePath -> newContent
--- @field context_provider function|nil Returns current IDE context
--- @field diff_handler table|nil { open = fn, close = fn }
--- @field ping_timer userdata|nil Keep-alive timer

local state = nil

--- Parse an HTTP request from raw data.
--- Returns method, path, headers table, and body.
--- @param data string
--- @return string|nil method, string|nil path, table|nil headers, string|nil body
local function parse_http_request(data)
  local header_end = data:find("\r\n\r\n")
  if not header_end then
    return nil, nil, nil, nil
  end

  local header_section = data:sub(1, header_end - 1)
  local body = data:sub(header_end + 4)

  -- Parse request line
  local request_line = header_section:match("^([^\r\n]+)")
  if not request_line then
    return nil, nil, nil, nil
  end

  local method, path = request_line:match("^(%S+)%s+(%S+)")
  if not method or not path then
    return nil, nil, nil, nil
  end

  -- Parse headers
  local headers = {}
  for line in header_section:gmatch("\r\n([^\r\n]+)") do
    local key, value = line:match("^([^:]+):%s*(.+)")
    if key then
      headers[key:lower()] = value
    end
  end

  return method, path, headers, body
end

--- Build an HTTP response string.
--- @param status_code number
--- @param status_text string
--- @param headers table
--- @param body string|nil
--- @return string
local function http_response(status_code, status_text, headers, body)
  local parts = { string.format("HTTP/1.1 %d %s\r\n", status_code, status_text) }
  for k, v in pairs(headers) do
    table.insert(parts, string.format("%s: %s\r\n", k, v))
  end
  if body then
    table.insert(parts, string.format("Content-Length: %d\r\n", #body))
  end
  table.insert(parts, "\r\n")
  if body then
    table.insert(parts, body)
  end
  return table.concat(parts)
end

--- Send a JSON HTTP response.
--- @param client userdata
--- @param status_code number
--- @param body_table table|nil
local function send_json(client, status_code, body_table)
  local status_text = status_code == 200 and "OK"
    or status_code == 400 and "Bad Request"
    or status_code == 401 and "Unauthorized"
    or status_code == 403 and "Forbidden"
    or status_code == 500 and "Internal Server Error"
    or "Error"

  local body = body_table and vim.json.encode(body_table) or nil
  local headers = {
    ["Content-Type"] = "application/json",
    ["Connection"] = "close",
  }

  local response = http_response(status_code, status_text, headers, body)
  local ok = pcall(function()
    client:write(response)
  end)
  if ok then
    pcall(function() client:shutdown() end)
  end
  pcall(function() client:close() end)
end

--- Send a plain text HTTP error.
--- @param client userdata
--- @param status_code number
--- @param message string
local function send_error(client, status_code, message)
  local status_text = status_code == 401 and "Unauthorized"
    or status_code == 403 and "Forbidden"
    or status_code == 400 and "Bad Request"
    or "Error"

  local headers = {
    ["Content-Type"] = "text/plain",
    ["Connection"] = "close",
  }
  local response = http_response(status_code, status_text, headers, message)
  pcall(function() client:write(response) end)
  pcall(function() client:shutdown() end)
  pcall(function() client:close() end)
end

--- Generate a session ID.
--- @return string
local function new_session_id()
  return auth.generate_token()
end

--- Handle an initialize request.
--- @param request table
--- @return string JSON response
local function handle_initialize(request)
  local session_id = new_session_id()
  state.sessions[session_id] = {
    initialized = true,
    created_at = os.time(),
  }

  local result = {
    protocolVersion = "2025-03-26",
    capabilities = mcp.capabilities,
    serverInfo = mcp.server_info,
    _meta = { sessionId = session_id },
  }
  return mcp.response(request.id, result)
end

--- Handle a tools/list request.
--- @param request table
--- @return string JSON response
local function handle_tools_list(request)
  return mcp.response(request.id, { tools = mcp.tools })
end

--- Handle a tools/call request.
--- @param request table
--- @return string JSON response
local function handle_tools_call(request)
  local params = request.params or {}
  local tool_name = params.name
  local arguments = params.arguments or {}

  if tool_name == "openDiff" then
    local file_path = arguments.filePath
    local new_content = arguments.newContent
    if not file_path or not new_content then
      return mcp.error_response(request.id, -32602, "Invalid params: filePath and newContent required")
    end
    state.diff_contents[file_path] = new_content

    -- Delegate to diff handler if available
    if state.diff_handler and state.diff_handler.open then
      vim.schedule(function()
        state.diff_handler.open(file_path, new_content)
      end)
    end

    return mcp.response(request.id, { content = vim.empty_dict() })
  elseif tool_name == "closeDiff" then
    local file_path = arguments.filePath
    if not file_path then
      return mcp.error_response(request.id, -32602, "Invalid params: filePath required")
    end

    local content = state.diff_contents[file_path]
    state.diff_contents[file_path] = nil

    -- Delegate to diff handler if available
    if state.diff_handler and state.diff_handler.close then
      vim.schedule(function()
        state.diff_handler.close(file_path)
      end)
    end

    if content then
      return mcp.response(request.id, {
        content = {
          { type = "text", text = vim.json.encode({ content = content }) },
        },
      })
    else
      return mcp.response(request.id, {
        content = {
          { type = "text", text = vim.json.encode({ content = vim.NIL }) },
        },
      })
    end
  else
    return mcp.error_response(request.id, -32601, "Tool not found: " .. tostring(tool_name))
  end
end

--- MCP method handlers.
local handlers = {
  ["initialize"] = handle_initialize,
  ["tools/list"] = handle_tools_list,
  ["tools/call"] = handle_tools_call,
  ["notifications/initialized"] = function(request)
    -- Acknowledgement, no response needed for notifications
    return mcp.response(request.id, {})
  end,
  ["ping"] = function(request)
    return mcp.response(request.id, {})
  end,
}

--- Start an SSE stream for a session.
--- @param client userdata
--- @param session_id string
local function start_sse_stream(client, session_id)
  local headers = {
    ["Content-Type"] = "text/event-stream",
    ["Cache-Control"] = "no-cache",
    ["Connection"] = "keep-alive",
  }
  local header_str = "HTTP/1.1 200 OK\r\n"
  for k, v in pairs(headers) do
    header_str = header_str .. string.format("%s: %s\r\n", k, v)
  end
  header_str = header_str .. "\r\n"

  pcall(function() client:write(header_str) end)

  state.sse_clients[session_id] = {
    client = client,
    alive = true,
  }

  -- Send initial context update
  if state.context_provider then
    local context = state.context_provider()
    local notification = mcp.context_update(context)
    vim.defer_fn(function()
      M.send_sse_event(session_id, notification)
    end, 50)
  end
end

--- Send an SSE event to a specific session.
--- @param session_id string
--- @param data string JSON data
function M.send_sse_event(session_id, data)
  local sse = state and state.sse_clients[session_id]
  if not sse or not sse.alive then
    return
  end
  local event = string.format("data: %s\n\n", data)
  local ok = pcall(function()
    sse.client:write(event)
  end)
  if not ok then
    sse.alive = false
  end
end

--- Broadcast an SSE event to all sessions.
--- @param data string JSON data
function M.broadcast_sse(data)
  if not state then
    return
  end
  for session_id, _ in pairs(state.sse_clients) do
    M.send_sse_event(session_id, data)
  end
end

--- Handle an incoming HTTP connection.
--- @param client userdata
local function on_connection(client)
  local buffer = ""

  client:read_start(function(err, data)
    if err or not data then
      pcall(function() client:close() end)
      return
    end

    buffer = buffer .. data

    -- Check if we have complete headers
    local header_end = buffer:find("\r\n\r\n")
    if not header_end then
      return -- Wait for more data
    end

    local method, req_path, headers, body = parse_http_request(buffer)
    if not method then
      send_error(client, 400, "Bad Request")
      return
    end

    -- Check Content-Length for POST requests
    if method == "POST" then
      local content_length = tonumber(headers["content-length"] or "0")
      if body and #body < content_length then
        return -- Wait for more data
      end
    end

    -- Stop reading once we have a complete request
    pcall(function() client:read_stop() end)

    -- Only handle /mcp endpoint
    if req_path ~= "/mcp" then
      send_error(client, 404, "Not Found")
      return
    end

    -- CORS: reject requests with Origin header
    if headers["origin"] then
      send_json(client, 403, { error = "Request denied by CORS policy." })
      return
    end

    -- Host validation
    local host = headers["host"] or ""
    local valid_hosts = {
      ["localhost:" .. state.port] = true,
      ["127.0.0.1:" .. state.port] = true,
    }
    if not valid_hosts[host] then
      send_json(client, 403, { error = "Invalid Host header" })
      return
    end

    -- Auth validation
    if not auth.validate_bearer(headers["authorization"], state.auth_token) then
      send_error(client, 401, "Unauthorized")
      return
    end

    -- Route by method
    if method == "GET" then
      -- SSE streaming endpoint
      local session_id = headers["mcp-session-id"]
      if not session_id or not state.sessions[session_id] then
        send_error(client, 400, "Invalid or missing session ID")
        return
      end
      start_sse_stream(client, session_id)
    elseif method == "POST" then
      -- JSON-RPC endpoint
      local request, parse_err = mcp.parse_jsonrpc(body or "")
      if not request then
        send_json(client, 400, {
          jsonrpc = "2.0",
          error = { code = -32700, message = parse_err or "Parse error" },
          id = vim.NIL,
        })
        return
      end

      -- Session handling
      local session_id = headers["mcp-session-id"]

      -- For initialize requests, don't require a session
      if request.method == "initialize" then
        local response_json = handle_initialize(request)
        local response_table = vim.json.decode(response_json)
        -- Extract session ID from response
        local new_session_id = response_table.result
          and response_table.result._meta
          and response_table.result._meta.sessionId

        local resp_headers = {
          ["Content-Type"] = "application/json",
          ["Connection"] = "close",
        }
        if new_session_id then
          resp_headers["mcp-session-id"] = new_session_id
        end

        local resp_body = response_json
        local resp = http_response(200, "OK", resp_headers, resp_body)
        pcall(function() client:write(resp) end)
        pcall(function() client:shutdown() end)
        pcall(function() client:close() end)
        return
      end

      -- Non-initialize requests need a valid session
      if not session_id or not state.sessions[session_id] then
        send_json(client, 400, {
          jsonrpc = "2.0",
          error = {
            code = -32000,
            message = "Bad Request: No valid session ID provided for non-initialize request.",
          },
          id = vim.NIL,
        })
        return
      end

      -- Dispatch the request
      local response_json = mcp.dispatch(request, handlers)
      local resp_headers = {
        ["Content-Type"] = "application/json",
        ["Connection"] = "close",
        ["mcp-session-id"] = session_id,
      }
      local resp = http_response(200, "OK", resp_headers, response_json)
      pcall(function() client:write(resp) end)
      pcall(function() client:shutdown() end)
      pcall(function() client:close() end)
    else
      send_error(client, 405, "Method Not Allowed")
    end
  end)
end

--- Start the HTTP server.
--- @param opts table { auth_token: string, context_provider: function|nil, diff_handler: table|nil }
--- @return number port, string auth_token
function M.start(opts)
  opts = opts or {}
  local token = opts.auth_token or auth.generate_token()

  local tcp = vim.loop.new_tcp()
  tcp:bind("127.0.0.1", 0)

  state = {
    tcp = tcp,
    port = 0,
    auth_token = token,
    sessions = {},
    sse_clients = {},
    diff_contents = {},
    context_provider = opts.context_provider,
    diff_handler = opts.diff_handler,
    ping_timer = nil,
  }

  tcp:listen(128, function(err)
    if err then
      vim.schedule(function()
        vim.notify("[gemini-cli] Server listen error: " .. err, vim.log.levels.ERROR)
      end)
      return
    end

    local client = vim.loop.new_tcp()
    tcp:accept(client)
    on_connection(client)
  end)

  -- Get the assigned port
  local addr = tcp:getsockname()
  state.port = addr.port

  -- Start keep-alive ping timer (60s)
  state.ping_timer = vim.loop.new_timer()
  state.ping_timer:start(60000, 60000, function()
    if state then
      for session_id, sse in pairs(state.sse_clients) do
        if sse.alive then
          local ping_data = vim.json.encode({ jsonrpc = "2.0", method = "ping" })
          local event = string.format(": ping\ndata: %s\n\n", ping_data)
          local ok = pcall(function() sse.client:write(event) end)
          if not ok then
            sse.alive = false
            state.sse_clients[session_id] = nil
          end
        else
          state.sse_clients[session_id] = nil
        end
      end
    end
  end)

  return state.port, state.auth_token
end

--- Stop the HTTP server.
function M.stop()
  if not state then
    return
  end

  -- Stop ping timer
  if state.ping_timer then
    pcall(function()
      state.ping_timer:stop()
      state.ping_timer:close()
    end)
  end

  -- Close all SSE clients
  for _, sse in pairs(state.sse_clients) do
    pcall(function() sse.client:shutdown() end)
    pcall(function() sse.client:close() end)
  end

  -- Close the TCP server
  pcall(function()
    state.tcp:close()
  end)

  state = nil
end

--- Get the current server port.
--- @return number|nil
function M.get_port()
  return state and state.port
end

--- Get the current auth token.
--- @return string|nil
function M.get_auth_token()
  return state and state.auth_token
end

--- Get server state (for status display).
--- @return table|nil
function M.get_state()
  return state
end

return M
