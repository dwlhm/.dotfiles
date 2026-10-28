# dotfiles

Personal macOS dotfiles dikelola secara deklaratif menggunakan **[Nix Flake (Home Manager)](https://nix-community.github.io/home-manager/)** dengan enkripsi rahasia **[SOPS](https://github.com/getsops/sops)** & **[Age](https://github.com/FiloSottile/age)**.

---

## 1. Arsitektur Terpadu (Single Source of Truth)

Seluruh konfigurasi dikelola terpusat oleh Nix Flake & Home Manager:

| Komponen | Alat | Tanggung Jawab |
|---|---|---|
| **User Dotfiles & Shell** | **Home Manager** | Konfigurasi Zsh (`modules/zsh`), Tmux (`modules/tmux`), dan Zed Editor (`modules/zed`). |
| **AI Toolchain & Prompts** | **Home Manager** | Base prompt `core.md`, agent instructions (Codex, Zed, Opencode, Gemini, Pi), skills (`better-ui`, `context-sync`), dan CLI `ai-outline`. |
| **Packages, Runtimes & Secrets** | **Nix Flake + SOPS** | CLI core packages (Thin Global Core), ephemeral devShells proyek (`modules/devshells.nix`), enkripsi identitas multi-akun Git dan SSH private keys. |

---

## 2. Setup pada Mesin Baru (Bootstrap)

Ikuti langkah-langkah berikut saat menyiapkan mesin baru:

### Langkah 1: Install Determinate Nix
```bash
curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install
```
Pastikan Nix daemon profile sudah termuat pada shell:
```bash
. /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh
```

### Langkah 2: Clone Repositori Dotfiles
```bash
git clone git@github.com:dwlhm/dotfiles.git ~/.dotfiles
# atau via HTTPS jika SSH belum aktif
```

### Langkah 3: Setup Kunci Private Age (SOPS)
Tempatkan file private key Age antum pada path:
```bash
mkdir -p ~/.config/sops/age
# Salin kunci age antum ke file keys.txt
chmod 0600 ~/.config/sops/age/keys.txt
```

### Langkah 4: Sinkronisasi Awal Home Manager & Secrets
Jalankan aktivasi flake untuk membangun environment Home Manager, mendekripsi SSH keys, mengaitkan dotfiles & AI toolchain, serta menghasilkan konfigurasi Git:
```bash
nix run home-manager/master -- switch -b backup --flake ~/.dotfiles
# Setelah aktif dan shell di-reload, cukup jalankan:
nix sync
```

---

## 3. Daily Usage Cheat Sheet

### Dotfiles & Secrets Synchronization
Untuk menerapkan perubahan konfigurasi pada flake atau secrets:
* **Menerapkan perubahan ke sistem**:
  ```bash
  nix sync
  ```
* **Melihat status identitas & secret Git**:
  ```bash
  nix id list
  ```
* **Mengedit secret terenkripsi (otomatis sync setelah disimpan)**:
  ```bash
  nix secret
  ```

### Nix Helper Commands
Perintah wrapper `nix` terintegrasi di Zsh untuk memudahkan operasional harian:

| Perintah | Deskripsi |
|---|---|
| `nix change list` | Melihat daftar devshell yang tersedia dan devshell yang aktif. |
| `nix change #<stack>` | Beralih environment devshell in-memory (contoh: `#web`, `#odin`, `#python`). |
| `nix change #<stack> --as <id>` | Beralih environment sekaligus mengaktifkan identitas Git spesifik. |
| `nix change off` | Keluar dari devshell dan kembali ke Thin Global Core. |
| `nix init #<stack> [--as <id>]` | Inisialisasi proyek baru dengan `.envrc` berbasis dotfiles flake. |
| `nix id list` | Menampilkan seluruh identitas Git & SSH terdaftar serta identitas aktif di direktori saat ini. |
| `nix id use [<id>]` | Mengikat repositori saat ini ke identitas Git tertentu (via `fzf` prompt jika tanpa argumen). |
| `nix id add <id>` | Wizard interaktif membuat SSH key baru dan mengenkripsi ke SOPS secrets. |
| `nix secret` | Membuka `secrets/secrets.yaml` via `sops` lalu otomatis menjalankan `nix sync`. |
| `nix sync` | Melakukan `home-manager switch` terhadap konfigurasi dotfiles. |
| `nix gc [--mac]` | Membersihkan cache direnv, script env cache, generasi HM lama, dan nix store. |

---

## 4. Panduan & Dokumentasi Terkait

* 📘 [Nix DevShells & Multi-Account Git Workflow](docs/nix-workflow.md): Panduan lengkap penggunaan Nix helper commands, instant in-memory caching, dan secret identity.
* 📙 [Tmux + Neovim + AI Agent Workflow](docs/tmux-workflow.md): Panduan pairing terminal multiplexer, Ghostty, Neovim, dan AI Coding Agent CLI.
