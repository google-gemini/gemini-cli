" Copyright 2026 Google LLC
" SPDX-License-Identifier: Apache-2.0

if exists('g:loaded_gemini_cli')
  finish
endif
let g:loaded_gemini_cli = 1

lua require('gemini-cli').auto_start()
