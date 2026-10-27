# Nix DevShells, Multi-Account Git & Helper Commands Workflow

Panduan komprehensif penggunaan toolchain **Nix Flake**, **Home Manager**, **Direnv**, dan **Nix Helper Commands** di dotfiles.

---

## 1. Arsitektur & Filosofi: Thin Global Core vs Ephemeral DevShells

Dotfiles ini menerapkan prinsip **Thin Global Core**:
* **Global Core Packages** ([`home.nix`](file:///Users/dwlhm/.dotfiles/home.nix)): Hanya memuat tool esensial harian (Search: `ripgrep`, `fd`, `bat`, `eza`, `fzf`, `zoxide`, `jq`, `btop`, `yazi`; Editors & Multiplexer: `neovim`, `tmux`; Toolchain & Security: `sops`, `age`, `ssh-to-age`, `peekaboo`, `mole`).
* **Zero Global Runtimes**: Bahasa pemrograman, compiler, dan SDK spesifik proyek (Node.js, pnpm, Odin, Swift tooling, Android SDK, Python/uv) **tidak di-install global**, melainkan diisolasi dalam ephemeral DevShells deklaratif ([`modules/devshells.nix`](file:///Users/dwlhm/.dotfiles/modules/devshells.nix)).

Keuntungan:
1. Tidak ada konflik versi pustaka/node/compiler antar proyek.
2. Lingkungan mesin host tetap bersih, cepat, dan terisolasi.
3. Disk space efisien dan dapat dibersihkan kapan saja dengan satu perintah GC.

---

## 2. Pergantian Stack Interaktif: `nix change`

Digunakan ketika antum ingin langsung masuk ke environment compiler tertentu di terminal saat ini tanpa harus membuat file konfigurasi `.envrc`.

### Perintah Dasar

* **Melihat daftar stack yang tersedia dan stack aktif**:
  ```bash
  nix change list
  ```
  Output menampilkan stack yang tersedia:
  `#web`, `#bun`, `#node20`, `#node16`, `#odin`, `#swift`, `#android`, `#python`.

* **Mengaktifkan stack tertentu**:
  ```bash
  nix change #web
  nix change #odin
  nix change #python
  ```

* **Mengaktifkan stack sekaligus mengikat identitas Git**:
  ```bash
  nix change #web --as komerce
  ```

* **Kembali ke Thin Global Core**:
  ```bash
  nix change off
  # atau
  nix change reset
  ```

### Mekanisme Internal & Caching
* **Instant In-Memory Caching**: Saat pertama kali dijalankan, `nix change` mengompilasi environment via `nix print-dev-env` dan menyimpannya ke `~/.cache/nix-envs/env-scripts/<stack>.sh`. Panggilan berikutnya berjalan instan ($<10\text{ ms}$) tanpa overhead evaluasi Nix. Cache otomatis di-invalidate jika `flake.lock` atau `modules/devshells.nix` diperbarui.
* **Auto-Directory Binding (`chpwd` hook)**: Pilihan stack dan identitas disimpan ke `~/.local/state/nix-envs/bindings.tsv`. Saat berpindah direktori (`cd`) ke folder proyek terkait, environment dan Git credentials otomatis disesuaikan.

---

## 3. Inisialisasi Proyek: `nix init`

Digunakan saat memulai atau mengonfigurasi proyek baru agar environment aktif otomatis saat membuka folder via `direnv`.

### 1. Stack Berbasis Template Mandiri (`#swift`, dll.)
Jika stack memiliki template mandiri di dotfiles flake (seperti `#swift`), `nix init` akan men-scaffold template lengkap yang **self-contained & reproducible** tanpa referensi ke dotfiles (`flake.nix` & `flake.lock` lokal):
```bash
cd ~/project/my-mac-app
nix init #swift --name MyMacApp --bundle-id com.example.mymacapp --as personal
```
Perintah ini otomatis:
1. Menjalankan `git init`.
2. Men-scaffold struktur proyek mandiri (`flake.nix`, `project.yml` XcodeGen, `justfile`, `.xcode-version`, dual-target Direct/AppStore, Sparkle updater, lint/format, CI GitHub Actions).
3. Melakukan substitusi placeholder identitas aplikasi.
4. Mengikat identitas Git jika diberikan `--as <id>`.
5. Menjalankan `direnv allow`.

### 2. Mode Standar (`.envrc` Terpusat)
Untuk stack yang belum memiliki template terpisah (seperti `#web`, `#python`, `#odin`), devshell langsung di-link dari dotfiles untuk kebutuhan cepat:
```bash
cd ~/project/my-app
nix init #web --as personal
```
Akan membuat file `.envrc` berisi `use flake ~/.dotfiles#web` dan mengikat identitas Git.

---

## 4. Multi-Account Git & Secret Identity: `nix id`

Pengelolaan kredensial Git dan SSH keys multi-identitas (`personal`, `komerce`, dll.) secara deklaratif dan terenkripsi menggunakan **SOPS** & **Age**.

### 1. Melihat Status Identitas
```bash
nix id list
```
Menampilkan seluruh identitas yang terdaftar pada [`secrets/accounts.json`](file:///Users/dwlhm/.dotfiles/secrets/accounts.json) serta identitas author Git aktif di direktori saat ini.

### 2. Mengikat Repositori ke Identitas Tertentu
* Menggunakan seleksi interaktif `fzf`:
  ```bash
  nix id use
  ```
* Menentukan langsung identitas:
  ```bash
  nix id use komerce
  ```
Perintah ini akan mengatur `include.path = ~/.config/git/identities/id-komerce.inc` pada konfigurasi lokal git repository (`.git/config`).

### 3. Menambahkan Identitas Baru (`nix id add`)
```bash
nix id add freelance
```
Wizard interaktif akan meminta input:
* `Git user.name`
* `Git user.email`
* `Git host` (default: `github.com`)
* `Git org/user`
* `Workspace dir` (misal: `~/project/freelance`)

Langkah otomatis yang dilakukan:
1. Membuat SSH Key Ed25519 baru secara aman.
2. Mengenkripsi private key dan konfigurasi Git langsung ke [`secrets/secrets.yaml`](file:///Users/dwlhm/.dotfiles/secrets/secrets.yaml) via SOPS.
3. Mendaftarkan ID ke [`secrets/accounts.json`](file:///Users/dwlhm/.dotfiles/secrets/accounts.json).
4. Menyalin SSH public key ke clipboard sistem (`pbcopy`).
5. Menjalankan `nix sync` untuk meregenerasi SSH keys dan include file di `~/.ssh/keys/` dan `~/.config/git/identities/`.

---

## 5. Manajemen Secrets & Sinkronisasi: `nix secret` & `nix sync`

* **Mengedit Secrets Terenkripsi**:
  ```bash
  nix secret
  ```
  Membuka [`secrets/secrets.yaml`](file:///Users/dwlhm/.dotfiles/secrets/secrets.yaml) menggunakan `$EDITOR` melalui `sops`. Begitu file disimpan dan ditutup, sistem otomatis menjalankan `nix sync`.

* **Sinkronisasi Home Manager**:
  ```bash
  nix sync
  ```
  Menjalankan `home-manager switch -b backup --flake ~/.dotfiles`. Otomatis melakukan `git add -N .` pada file-file baru di dotfiles agar Nix Flake dapat membaca seluruh file.

---

## 6. Pembersihan & Garbage Collection: `nix gc`

Seiring waktu, compiler dan pustaka dari devshell tersimpan di Nix store. Gunakan perintah ini untuk membebaskan ruang disk:

```bash
# Bersihkan cache direnv, script environment, generasi HM >7 hari, dan nix store
nix gc

# Sekaligus bersihkan system cache macOS via Mole (mo clean)
nix gc --mac
```

Output akan menampilkan kapasitas disk sebelum dan sesudah proses pembersihan.
