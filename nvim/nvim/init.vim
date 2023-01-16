set scrolloff=8
set number
set relativenumber
set tabstop=4 softtabstop=4
set shiftwidth=4
set expandtab
set smartindent

call plug#begin('~/.vim/plugged')

Plug 'junegunn/fzf', { 'do': { -> fzf#install() } }
Plug 'junegunn/fzf.vim'
Plug 'sainnhe/sonokai'
Plug 'nvim-lualine/lualine.nvim'
Plug 'kyazdani42/nvim-web-devicons'
Plug 'neovim/nvim-lspconfig'
Plug 'neovim/nvim-lspconfig'
Plug 'hrsh7th/cmp-nvim-lsp'
Plug 'hrsh7th/cmp-buffer'
Plug 'hrsh7th/cmp-path'
Plug 'hrsh7th/cmp-cmdline'
Plug 'hrsh7th/nvim-cmp'
Plug 'L3MON4D3/LuaSnip'
Plug 'saadparwaiz1/cmp_luasnip'
Plug 'luochen1990/rainbow'

call plug#end()

let g:rainbow_active = 1

" Color Scheme
if has('termguicolors')
    set termguicolors
endif
let g:sonokai_style = 'andromeda'
let g:sonokai_better_performance = 1
let g:sonokai_transparent_background = 1
let g:sonokai_dim_inactive_windows = 1
colorscheme sonokai
hi Normal guibg=NONE ctermbg=NONE

" autocomplete
set completeopt=menu,menuone,noselect

" Remaps
let mapleader = " "
nnoremap <leader>pv :Vex<CR>
nnoremap <leader><CR> :so ~/.config/nvim/init.vim<CR>
nnoremap <C-p> :GFiles<CR>
nnoremap <C-f> :Files<CR>
" quickfix
nnoremap <C-h> :cprev<CR>
nnoremap <C-l> :cnext<CR>
nnoremap <C-E> :copen<CR>

lua << END
require'lspconfig'.tsserver.setup {}
require('lualine').setup {
    options = {
        theme = 'sonokai',
        section_separators = { left = '', right = '' }
    }
}

local cmp = require'cmp'

cmp.setup {
    snippet = {
        expand = function(args)
            require('luasnip').lsp_expand(args.body)
        end
    },
    mapping = cmp.mapping.preset.insert({
      ['<C-b>'] = cmp.mapping.scroll_docs(-4),
      ['<C-f>'] = cmp.mapping.scroll_docs(4),
      ['<C-Space>'] = cmp.mapping.complete(),
      ['<C-e>'] = cmp.mapping.abort(),
      ['<CR>'] = cmp.mapping.confirm({ select = true })
    }),
    sources = cmp.config.sources({
      { name = 'nvim_lsp' },
      -- { name = 'vsnip' }, -- For vsnip users.
      { name = 'luasnip' }, -- For luasnip users.
      -- { name = 'ultisnips' }, -- For ultisnips users.
      -- { name = 'snippy' }, -- For snippy users.
    }, {
      { name = 'buffer' },
    })
}

local capabilities = require('cmp_nvim_lsp').default_capabilities()

require'lspconfig'.tsserver.setup {
    capabilities = capabilities
}
END
