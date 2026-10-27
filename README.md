# dotfiles

Personal macOS dotfiles dikelola secara deklaratif menggunakan kombinasi **[Chezmoi](https://www.chezmoi.io/)** dan **[Nix Flake (Home Manager)](https://nix-community.github.io/home-manager/)** dengan enkripsi rahasia **[SOPS](https://github.com/getsops/sops)** & **[Age](https://github.com/FiloSottile/age)**.

---

## 1. Arsitektur Dual-System

Sistem ini memisahkan tanggung jawab konfigurasi menjadi dua pilar:

| Komponen | Alat | Tanggung Jawab |
|---|---|---|
| **User Dotfiles & AI Toolchain** | **Chezmoi** | Konfigurasi terminal (Ghostty, Tmux, Zsh), editor (Neovim, Zed), dan AI rules/skills (`~/.config/ai/`). |
| **Packages, Runtimes & Secrets** | **Nix Flake + SOPS** | CLI core packages (Thin Global Core), ephemeral devShells proyek, enkripsi identitas multi-akun Git dan SSH private keys. |

---

## 2. Setup pada Mesin Baru (Bootstrap)

Ikuti langkah-langkah berikut saat menyiapkan mesin baru:

### Langkah 1: Install Homebrew & Chezmoi
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install chezmoi
```

### Langkah 2: Inisialisasi Dotfiles via Chezmoi
```bash
chezmoi init --apply --source ~/.dotfiles
```

### Langkah 3: Install Determinate Nix
```bash
curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install
```
Pastikan Nix daemon profile sudah termuat pada shell:
```bash
. /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh
```

### Langkah 4: Setup Kunci Private Age (SOPS)
Tempatkan file private key Age antum pada path:
```bash
mkdir -p ~/.config/sops/age
# Salin kunci age antum ke file keys.txt
chmod 0600 ~/.config/sops/age/keys.txt
```

### Langkah 5: Sinkronisasi Home Manager & Secrets
Jalankan perintah sync untuk membangun environment Home Manager, mendekripsi SSH keys, dan menghasilkan konfigurasi Git:
```bash
nix sync
# atau: home-manager switch -b backup --flake ~/.dotfiles
```

---

## 3. Daily Usage Cheat Sheet

### Chezmoi (Dotfiles & AI Context)
* **Melihat perbedaan konfigurasi**:
  ```bash
  chezmoi diff
  ```
* **Menerapkan perubahan ke sistem**:
  ```bash
  chezmoi apply
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
