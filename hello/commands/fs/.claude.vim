let g:claude = 1

function! ClaudeGotoLine()
	let l:target = input('Line: ')
	if l:target =~# '^\d\+$'
		execute l:target
		normal! zz
	endif
endfunction

nnoremap <silent> <leader>co gx
nnoremap <silent> <leader>cg :call ClaudeGotoLine()<CR>
xnoremap <silent> <leader>cu U
xnoremap <silent> <leader>cl u
xnoremap <silent> <leader>ct :s/\.net\>/.com/g<CR>
nnoremap <silent> <leader>cr :e grep-code.toml<CR>
nnoremap <silent> <leader>cp :e post.toml<CR>