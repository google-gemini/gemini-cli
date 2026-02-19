local M = {}

local bridge_dir = nil
local buf_timestamps = {}
local pending_write = false
local last_payload = ''

local function now_ms()
  return vim.loop.now()
end

local function ensure_dir(path)
  if vim.fn.isdirectory(path) == 0 then
    vim.fn.mkdir(path, 'p')
  end
end

local function write_file(filepath, content)
  vim.loop.fs_open(filepath, 'w', 438, function(err_open, fd)
    if err_open or not fd then
      return
    end
    vim.loop.fs_write(fd, content, 0, function(err_write)
      if err_write then
        vim.loop.fs_close(fd, function() end)
        return
      end
      vim.loop.fs_close(fd, function() end)
    end)
  end)
end

local function map_severity(severity)
  local map = {
    [vim.diagnostic.severity.ERROR] = 'error',
    [vim.diagnostic.severity.WARN] = 'warning',
    [vim.diagnostic.severity.INFO] = 'info',
    [vim.diagnostic.severity.HINT] = 'hint',
  }
  return map[severity] or 'info'
end

local function get_selected_text(bufnr)
  local mode = vim.fn.mode()
  if mode ~= 'v' and mode ~= 'V' and mode ~= '\22' then
    return nil
  end

  local start_pos = vim.fn.getpos('v')
  local end_pos = vim.fn.getpos('.')

  local start_row = start_pos[2]
  local start_col = start_pos[3]
  local end_row = end_pos[2]
  local end_col = end_pos[3]

  if start_row > end_row or (start_row == end_row and start_col > end_col) then
    start_row, end_row = end_row, start_row
    start_col, end_col = end_col, start_col
  end

  local lines = vim.api.nvim_buf_get_text(
    bufnr,
    start_row - 1,
    start_col - 1,
    end_row - 1,
    end_col,
    {}
  )
  if not lines or #lines == 0 then
    return nil
  end
  return table.concat(lines, '\n')
end

local function collect_open_files()
  local open_files = {}
  local active_buf = vim.api.nvim_get_current_buf()

  for _, bufnr in ipairs(vim.api.nvim_list_bufs()) do
    if vim.api.nvim_buf_is_loaded(bufnr) then
      local name = vim.api.nvim_buf_get_name(bufnr)
      if name ~= '' and vim.loop.fs_stat(name) then
        local timestamp = buf_timestamps[bufnr] or now_ms()
        local entry = {
          path = name,
          timestamp = timestamp,
          isActive = bufnr == active_buf,
        }
        if bufnr == active_buf then
          local cursor = vim.api.nvim_win_get_cursor(0)
          entry.cursor = { line = cursor[1], character = cursor[2] + 1 }
          entry.selectedText = get_selected_text(bufnr)
        end
        table.insert(open_files, entry)
      end
    end
  end

  return open_files
end

local function collect_diagnostics()
  local diagnostic_files = {}
  for _, bufnr in ipairs(vim.api.nvim_list_bufs()) do
    local name = vim.api.nvim_buf_get_name(bufnr)
    if name ~= '' and vim.loop.fs_stat(name) then
      local diagnostics = vim.diagnostic.get(bufnr)
      if diagnostics and #diagnostics > 0 then
        local items = {}
        for _, diagnostic in ipairs(diagnostics) do
          local end_lnum = diagnostic.end_lnum or diagnostic.lnum
          local end_col = diagnostic.end_col or diagnostic.col
          table.insert(items, {
            range = {
              start = {
                line = diagnostic.lnum + 1,
                character = diagnostic.col + 1,
              },
              end = {
                line = end_lnum + 1,
                character = end_col + 1,
              },
            },
            severity = map_severity(diagnostic.severity),
            message = diagnostic.message,
            source = diagnostic.source,
            code = diagnostic.code,
          })
        end
        table.insert(diagnostic_files, {
          path = name,
          timestamp = now_ms(),
          items = items,
        })
      end
    end
  end
  return diagnostic_files
end

local function build_context()
  return {
    workspaceState = {
      openFiles = collect_open_files(),
      diagnostics = collect_diagnostics(),
    },
  }
end

local function write_context()
  if not bridge_dir then
    return
  end
  local context = build_context()
  local payload = vim.fn.json_encode(context)
  if payload == last_payload then
    return
  end
  last_payload = payload
  ensure_dir(bridge_dir)
  write_file(bridge_dir .. '/context.json', payload)
end

local function schedule_write()
  if pending_write then
    return
  end
  pending_write = true
  vim.defer_fn(function()
    pending_write = false
    write_context()
  end, 50)
end

function M.setup(dir)
  bridge_dir = dir
  ensure_dir(bridge_dir)

  vim.api.nvim_create_autocmd({ 'BufEnter', 'BufWinEnter' }, {
    callback = function(args)
      buf_timestamps[args.buf] = now_ms()
      schedule_write()
    end,
  })

  vim.api.nvim_create_autocmd({ 'CursorMoved', 'CursorMovedI', 'TextChanged' }, {
    callback = schedule_write,
  })

  vim.api.nvim_create_autocmd('DiagnosticChanged', {
    callback = schedule_write,
  })

  schedule_write()
end

return M
