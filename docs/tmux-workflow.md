# Tmux Workflow: Neovim + AI Agent CLI di Ghostty

Panduan workflow terminal modern yang memadukan **Ghostty**, **Tmux**, **Neovim**, dan **AI Coding Agent CLI** (Aider, Claude Code, Goose, dll.).

---

## 1. Instalasi & Penerapan

### A. Terapkan Konfigurasi via Chezmoi
File konfigurasi disimpan sebagai `dot_tmux.conf` di dotfiles antum. Terapkan ke sistem:

```bash
chezmoi diff
chezmoi apply
```

Jika Tmux sudah berjalan, muat ulang konfigurasinya:
* Tekan `Ctrl + a`, lalu tekan `r` (akan muncul notifikasi *"Tmux config reloaded!"*).

---

## 2. Layout & Arsitektur Workflow

```text
┌──────────────────────────────┬──────────────────────────────┐
│           Pane 1             │           Pane 2             │
│                              │                              │
│          NEOVIM              │       AI AGENT CLI           │
│   (Editing, Navigation)      │  (Aider / Claude Code / agy) │
│                              │                              │
│  Highlight baris & tekan     │  Menerima context & instruksi│
│  <leader>ai ───────────────> │  secara otomatis via socket  │
│                              │                              │
└──────────────────────────────┴──────────────────────────────┘
```

1. Buka Ghostty, mulai session Tmux di folder proyek:
   ```bash
   tmux new -s dev
   ```
2. Buka Neovim di pane utama (Pane 1):
   ```bash
   nvim .
   ```
3. Tekan `Ctrl + a`, lalu `|` (pipa) untuk split layar secara vertikal (membuka Pane 2 di direktori yang sama).
4. Di Pane 2, jalankan CLI agent favorit antum:
   ```bash
   aider # atau claude, goose, dll.
   ```

---

## 3. Integrasi ke Neovim (Kirim Highlight Langsung ke Agent)

Tambahkan snippet Lua berikut ke konfigurasi Neovim antum (misal di `~/.config/nvim/lua/config/keymaps.lua` atau `init.lua`):

```lua
-- =============================================================================
-- TMUX -> AI AGENT INTER-PROCESS COMMUNICATION (IPC)
-- =============================================================================

--- Kirim teks/instruksi ke pane Tmux sebelah (default pane 2)
local function send_to_tmux_pane(text, target_pane)
  target_pane = target_pane or "2"
  -- Escape petik untuk shell command
  local escaped_text = text:gsub("'", "'\\''")
  local cmd = string.format("tmux send-keys -t :.%s '%s' Enter", target_pane, escaped_text)
  vim.fn.system(cmd)
end

-- 1. [Visual Mode] Kirim highlight kode beserta path & line range ke Agent
vim.keymap.set("v", "<leader>ai", function()
  local filepath = vim.fn.expand("%:~:.")
  local start_line = vim.fn.line("v")
  local end_line = vim.fn.line(".")
  if start_line > end_line then start_line, end_line = end_line, start_line end

  -- Ambil isi teks yang di-highlight
  local lines = vim.api.nvim_buf_get_lines(0, start_line - 1, end_line, false)
  local code = table.concat(lines, "\n")
  local ft = vim.bo.filetype

  -- Format context yang siap dibaca oleh CLI Agent
  local payload = string.format(
    "Lihat file `%s` (baris %d-%d):\n```%s\n%s\n```\n",
    filepath,
    start_line,
    end_line,
    ft,
    code
  )

  send_to_tmux_pane(payload)
  vim.notify(string.format("Terkirim ke agent: %s:%d-%d", filepath, start_line, end_line), vim.log.levels.INFO)
end, { desc = "Kirim highlight visual ke AI Agent (Tmux Pane 2)" })

-- 2. [Normal Mode] Tambahkan file aktif ke context Agent
vim.keymap.set("n", "<leader>af", function()
  local filepath = vim.fn.expand("%:~:.")
  send_to_tmux_pane(string.format("/add %s", filepath)) -- syntax '/add' umum di Aider
  vim.notify("File ditambahkan ke agent: " .. filepath, vim.log.levels.INFO)
end, { desc = "Add current file to AI agent" })
```

---

## 4. Navigasi Mulus Tanpa Berpikir (`vim-tmux-navigator`)

Agar antum bisa berpindah kursor antara split Neovim dan pane Tmux dengan tombol yang sama (`Ctrl+h/j/k/l`):

1. Pasang plugin di Neovim (misal via Lazy.nvim):
   ```lua
   {
     "christoomey/vim-tmux-navigator",
     cmd = {
       "TmuxNavigateLeft",
       "TmuxNavigateDown",
       "TmuxNavigateUp",
       "TmuxNavigateRight",
     },
     keys = {
       { "<c-h>", "<cmd><C-U>TmuxNavigateLeft<cr>" },
       { "<c-j>", "<cmd><C-U>TmuxNavigateDown<cr>" },
       { "<c-k>", "<cmd><C-U>TmuxNavigateUp<cr>" },
       { "<c-l>", "<cmd><C-U>TmuxNavigateRight<cr>" },
     },
   }
   ```
2. Tmux config (`dot_tmux.conf`) sudah dilengkapi dengan handler cerdas `is_vim` untuk merespons keybind ini.

---

## 5. Dukungan Gambar (Ghostty + Kitty Protocol)

Konfigurasi `dot_tmux.conf` sudah menyertakan:
```tmux
set -g allow-passthrough on
```
Ini memastikan aplikasi seperti `image.nvim`, `yazi`, atau `chafa` dapat merender gambar langsung di dalam terminal Ghostty saat berada di dalam session Tmux.

---

## 6. Cheat Sheet Tmux Terpenting

> **Prefix**: `Ctrl + a` (bukan `Ctrl + b`)

| Tombol | Aksi |
| :--- | :--- |
| `Ctrl + a` lalu `\|` | Split pane **vertikal** (kanan-kiri), di folder yang sama |
| `Ctrl + a` lalu `-` | Split pane **horizontal** (atas-bawah), di folder yang sama |
| `Ctrl + h / j / k / l` | Pindah fokus pane secara langsung (seamless Nvim $\leftrightarrow$ Tmux) |
| `Alt + Arrow Keys` | Resize ukuran pane |
| `Ctrl + a` lalu `z` | Zoom / Maximise pane aktif (tekan lagi untuk unzoom) |
| `Ctrl + a` lalu `c` | Buat window (tab) baru |
| `Ctrl + a` lalu `1..9` | Pindah ke window nomor 1..9 |
| `Ctrl + a` lalu `d` | Detach session (session tetap jalan di background) |
| `Ctrl + a` lalu `r` | Reload konfigurasi `~/.tmux.conf` |
| `Ctrl + a` lalu `[` | Masuk copy/scroll mode (navigasi ala Vim: `hjkl`, `v` seleksi, `y` salin) |
| **Mouse Click / Drag** | Klik pane untuk fokus, drag garis pembatas untuk resize |
