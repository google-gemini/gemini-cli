-- Copyright 2026 Google LLC
-- SPDX-License-Identifier: Apache-2.0

local M = {}

--- Tool definitions for the IDE companion protocol.
M.tools = {
  {
    name = "openDiff",
    description = "(IDE Tool) Open a diff view to create or modify a file.",
    inputSchema = {
      type = "object",
      properties = {
        filePath = { type = "string", description = "The absolute path to the file to be diffed." },
        newContent = { type = "string", description = "The proposed new content for the file." },
      },
      required = { "filePath", "newContent" },
    },
  },
  {
    name = "closeDiff",
    description = "(IDE Tool) Close an open diff view for a specific file.",
    inputSchema = {
      type = "object",
      properties = {
        filePath = { type = "string", description = "The absolute path to the file to be diffed." },
        suppressNotification = { type = "boolean" },
      },
      required = { "filePath" },
    },
  },
}

--- Server info for MCP initialize response.
M.server_info = {
  name = "gemini-cli-neovim-companion",
  version = "1.0.0",
}

M.capabilities = {
  logging = {},
  tools = {},
}

--- Parse a JSON-RPC request body.
--- @param body string
--- @return table|nil parsed, string|nil error
function M.parse_jsonrpc(body)
  local ok, parsed = pcall(vim.json.decode, body)
  if not ok or type(parsed) ~= "table" then
    return nil, "Parse error"
  end
  if parsed.jsonrpc ~= "2.0" then
    return nil, "Invalid JSON-RPC version"
  end
  return parsed, nil
end

--- Build a JSON-RPC response.
--- @param id any
--- @param result table
--- @return string
function M.response(id, result)
  return vim.json.encode({
    jsonrpc = "2.0",
    id = id,
    result = result,
  })
end

--- Build a JSON-RPC error response.
--- @param id any
--- @param code number
--- @param message string
--- @return string
function M.error_response(id, code, message)
  return vim.json.encode({
    jsonrpc = "2.0",
    id = id,
    error = { code = code, message = message },
  })
end

--- Build a JSON-RPC notification.
--- @param method string
--- @param params table
--- @return string
function M.notification(method, params)
  return vim.json.encode({
    jsonrpc = "2.0",
    method = method,
    params = params,
  })
end

--- Build a context update notification.
--- @param context table
--- @return string
function M.context_update(context)
  return M.notification("ide/contextUpdate", context)
end

--- Build a diff accepted notification.
--- @param file_path string
--- @param content string
--- @return string
function M.diff_accepted(file_path, content)
  return M.notification("ide/diffAccepted", {
    filePath = file_path,
    content = content,
  })
end

--- Build a diff rejected notification.
--- @param file_path string
--- @return string
function M.diff_rejected(file_path)
  return M.notification("ide/diffRejected", {
    filePath = file_path,
  })
end

--- Dispatch a JSON-RPC request to the appropriate handler.
--- @param request table Parsed JSON-RPC request
--- @param handlers table Map of method names to handler functions
--- @return string JSON response
function M.dispatch(request, handlers)
  local method = request.method
  if not method then
    return M.error_response(request.id, -32600, "Invalid Request: missing method")
  end

  local handler = handlers[method]
  if not handler then
    return M.error_response(request.id, -32601, "Method not found: " .. method)
  end

  local ok, result = pcall(handler, request)
  if not ok then
    return M.error_response(request.id, -32603, "Internal error: " .. tostring(result))
  end
  return result
end

return M
