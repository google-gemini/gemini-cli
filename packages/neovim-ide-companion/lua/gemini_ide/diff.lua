local M = {}

local bridge_dir = nil
local requests_dir = nil
local responses_dir = nil
local fs_event_handle = nil

local function ensure_dir(path)
  if vim.fn.isdirectory(path) == 0 then
    vim.fn.mkdir(path, 'p')
  end
end

local function read_json(path)
  local handle = io.open(path, 'r')
  if not handle then
    return nil
  end
  local content = handle:read('*a')
  handle:close()
  if not content or content == '' then
    return nil
  end
  local ok, decoded = pcall(vim.fn.json_decode, content)
  if not ok then
    return nil
  end
  return decoded
end

local function write_json(path, data)
  local encoded = vim.fn.json_encode(data)
  local handle = io.open(path, 'w')
  if not handle then
    return
  end
  handle:write(encoded)
  handle:close()
end

local function cleanup_buffers(state)
  if not state then
    return
  end
  if state.new_buf and vim.api.nvim_buf_is_valid(state.new_buf) then
    vim.api.nvim_buf_delete(state.new_buf, { force = true })
  end
  if state.original_buf and vim.api.nvim_buf_is_valid(state.original_buf) then
    pcall(function()
      vim.api.nvim_buf_call(state.original_buf, function()
        vim.cmd('diffoff')
      end)
    end)
  end
end

local function send_response(state, status, content)
  if not state or not state.request_id then
    return
  end
  ensure_dir(responses_dir)
  local response_path = string.format('%s/diff-response-%s.json', responses_dir, state.request_id)
  write_json(response_path, {
    id = state.request_id,
    filePath = state.file_path,
    status = status,
    content = content,
  })
end

local function accept_diff(bufnr)
  local state = vim.b[bufnr].gemini_diff_state
  if not state or state.status ~= 'pending' then
    return
  end
  state.status = 'accepted'
  local lines = vim.api.nvim_buf_get_lines(bufnr, 0, -1, false)
  vim.fn.writefile(lines, state.file_path)
  send_response(state, 'accepted', table.concat(lines, '\n'))
  cleanup_buffers(state)
end

local function reject_diff(bufnr)
  local state = vim.b[bufnr].gemini_diff_state
  if not state or state.status ~= 'pending' then
    return
  end
  state.status = 'rejected'
  send_response(state, 'rejected')
  cleanup_buffers(state)
end

local function close_diff_by_path(file_path, suppress_notification)
  for _, bufnr in ipairs(vim.api.nvim_list_bufs()) do
    local state = vim.b[bufnr].gemini_diff_state
    if state and state.file_path == file_path and state.status == 'pending' then
      if suppress_notification then
        state.status = 'rejected'
        cleanup_buffers(state)
      else
        reject_diff(bufnr)
      end
      return
    end
  end
end

function M.accept_current()
  local bufnr = vim.api.nvim_get_current_buf()
  accept_diff(bufnr)
end

function M.reject_current()
  local bufnr = vim.api.nvim_get_current_buf()
  reject_diff(bufnr)
end

local function open_diff(request)
  local file_path = request.filePath
  local new_content = request.newContent
  local request_id = request.id

  if not file_path or not new_content or not request_id then
    return
  end

  vim.cmd('tabnew ' .. vim.fn.fnameescape(file_path))
  local original_buf = vim.api.nvim_get_current_buf()

  vim.cmd('vsplit')
  local new_buf = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_win_set_buf(0, new_buf)

  vim.api.nvim_buf_set_lines(
    new_buf,
    0,
    -1,
    false,
    vim.split(new_content, '\n', { plain = true, trimempty = false })
  )
  vim.bo[new_buf].buftype = 'acwrite'
  vim.bo[new_buf].bufhidden = 'wipe'
  vim.bo[new_buf].swapfile = false
  vim.bo[new_buf].modifiable = true

  vim.b[new_buf].gemini_diff_state = {
    request_id = request_id,
    file_path = file_path,
    original_buf = original_buf,
    new_buf = new_buf,
    status = 'pending',
  }

  vim.cmd('diffthis')
  vim.api.nvim_set_current_buf(original_buf)
  vim.cmd('diffthis')
  vim.api.nvim_set_current_buf(new_buf)

  vim.api.nvim_create_autocmd('BufWritePost', {
    buffer = new_buf,
    callback = function()
      accept_diff(new_buf)
    end,
  })

  vim.api.nvim_create_autocmd('BufWipeout', {
    buffer = new_buf,
    callback = function()
      reject_diff(new_buf)
    end,
  })
end

local function poll_requests()
  if not requests_dir then
    return
  end
  ensure_dir(requests_dir)
  local handle = vim.loop.fs_scandir(requests_dir)
  if not handle then
    return
  end

  while true do
    local name = vim.loop.fs_scandir_next(handle)
    if not name then
      break
    end
    if name:match('^diff%-request%-') and name:match('%.json$') then
      local full_path = requests_dir .. '/' .. name
      local request = read_json(full_path)
      if request then
        open_diff(request)
      end
      os.remove(full_path)
    elseif name:match('^diff%-close%-') and name:match('%.json$') then
      local full_path = requests_dir .. '/' .. name
      local request = read_json(full_path)
      if request then
        close_diff_by_path(request.filePath, request.suppressNotification)
      end
      os.remove(full_path)
    end
  end
end

function M.start_request_poll(dir)
  bridge_dir = dir
  requests_dir = bridge_dir .. '/requests'
  responses_dir = bridge_dir .. '/responses'
  ensure_dir(requests_dir)
  ensure_dir(responses_dir)

  if fs_event_handle then
    return
  end

  fs_event_handle = vim.loop.new_fs_event()
  fs_event_handle:start(requests_dir, {}, vim.schedule_wrap(function(err)
    if err then
      return
    end
    poll_requests()
  end))
end

return M
