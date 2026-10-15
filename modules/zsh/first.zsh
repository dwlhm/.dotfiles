### 🖥️ Terminal Greeting (harus sebelum instant prompt!)
_terminal_greeting() {
  local reset="\033[0m"
  local bold="\033[1m"
  local cyan="\033[36m"
  local green="\033[32m"
  local yellow="\033[33m"
  local blue="\033[34m"
  local magenta="\033[35m"

  local hostname_val=$(hostname -s)
  local os_val=$(sw_vers -productName 2>/dev/null)
  local os_ver=$(sw_vers -productVersion 2>/dev/null)
  local uptime_val=$(uptime | sed 's/.*up //' | sed 's/,.*//')
  local ip_val=$(ipconfig getifaddr en0 2>/dev/null || echo "N/A")
  local disk_val=$(df -h / 2>/dev/null | awk 'NR==2 {print $3 " / " $2 " (" $5 " used)"}')
  local shell_ver=$(zsh --version | awk '{print $2}')

  # Sapaan dinamis berdasarkan waktu
  local hour=$(date +%-H)
  local greet_msg=""

  if (( hour >= 3 && hour < 6 )); then
    greet_msg="Shabahul khair, dwlhm! 🌙 (Berkah fajar & shubuh)"
  elif (( hour >= 6 && hour < 11 )); then
    greet_msg="Shabahul khair, dwlhm! ☀️ (Awali ikhtiar dengan bismillah)"
  elif (( hour >= 11 && hour < 15 )); then
    greet_msg="Ahlan wa Sahlan, dwlhm! ☀️ (Semangat & jangan lupa shalat tepat waktu)"
  elif (( hour >= 15 && hour < 18 )); then
    greet_msg="Masa'ul khair, dwlhm! 🌇 (Petang barakah, perbanyak dzikir)"
  elif (( hour >= 18 && hour < 22 )); then
    greet_msg="Masa'ul khair, dwlhm! 🌌 (Evaluasi diri & selamat beristirahat)"
  else
    greet_msg="Ahlan wa Sahlan, dwlhm! 🌟 (Waktu sepertiga malam yang mustajab)"
  fi

  # Pembelajaran / Mutiara Hikmah Islami
  local reminders=(
    "\"Innamal a'malu bin-niyyat\" — Sesungguhnya setiap amalan tergantung pada niatnya. (HR. Bukhari & Muslim)"
    "\"Khairunnas anfa'uhum linnas\" — Sebaik-baik manusia adalah yang paling bermanfaat bagi sesama. (HR. Ahmad)"
    "\"Man salaka thariqan yaltamisu fihi 'ilman sahhallahu lahu bihi thariqan ilal jannah\" — Barangsiapa menempuh jalan mencari ilmu, Allah mudahkan jalannya ke surga. (HR. Muslim)"
    "\"Innallaha yuhibbu idza 'amila ahadukum 'amalan an yutqinahu\" — Allah mencintai hamba yang bekerja secara itqan (profesional & tuntas). (HR. Baihaqi)"
    "\"Ittaqillaha haitsuma kunta\" — Bertakwalah kepada Allah di mana pun engkau berada. (HR. Tirmidzi)"
    "\"Al-mu'minul qawiyyu khairun wa ahabbu ilallah minal mu'minidh dha'if\" — Mukmin yang kuat lebih dicintai Allah daripada mukmin yang lemah. (HR. Muslim)"
    "\"La taghdhab wa lakal jannah\" — Janganlah engkau mudah marah, niscaya bagimu surga. (HR. Thabrani)"
    "\"Al-waqtu kassaif, in lam taqtha'hu qatha'ak\" — Waktu laksana pedang; jika tidak kau gunakan dalam kebaikan, ia yang akan memotongmu."
    "\"Man kana yu'minu billahi wal yaumil akhir falyaqul khairan au liyasmut\" — Siapa yang beriman kepada Allah & hari akhir, hendaklah berkata baik atau diam. (HR. Bukhari)"
    "\"Afshus salam, wa ath'imut tha'am, wa shallu bil laili wan nasu niyam\" — Tebarkan salam, berilah makan, dan shalatlah di malam hari ketika manusia terlelap. (HR. Tirmidzi)"
    "\"Yassiru wa la tu'assiru, wa basysyiru wa la tunaffiru\" — Permudahlah dan jangan mempersulit, berilah kabar gembira dan jangan membuat lari. (HR. Bukhari)"
    "\"Man lam yasykurin-nas lam yasykurillah\" — Barangsiapa tidak berterima kasih kepada manusia, ia belum bersyukur kepada Allah. (HR. Tirmidzi)"
  )
  local rand_idx=$(( RANDOM % ${#reminders[@]} + 1 ))
  local reminder="${reminders[$rand_idx]}"

  echo ""
  echo -e "  ${bold}👋 ${greet_msg}${reset}"

  # Format Tadabbur dengan batasan lebar (max width ~65 karakter)
  local max_w=65
  if [[ -n "$COLUMNS" && "$COLUMNS" -gt 35 ]]; then
    local dyn_w=$(( COLUMNS - 18 ))
    (( dyn_w < max_w )) && max_w=$dyn_w
  fi
  local lines=("${(@f)$(echo "$reminder" | fmt -w "$max_w")}")
  for i in {1..${#lines[@]}}; do
    if (( i == 1 )); then
      echo -e "  ${yellow}📖 Tadabbur :${reset} ${cyan}${lines[$i]}${reset}"
    else
      echo -e "                ${cyan}${lines[$i]}${reset}"
    fi
  done
  echo ""
  echo -e "  ${bold}${blue}💻 Sistem${reset}"
  echo -e "  ${magenta}├─${reset} Host    : ${bold}${hostname_val}${reset}"
  echo -e "  ${magenta}├─${reset} OS      : ${os_val} ${os_ver}"
  echo -e "  ${magenta}├─${reset} Uptime  : ${uptime_val}"
  echo -e "  ${magenta}├─${reset} IP      : ${bold}${ip_val}${reset}"
  echo -e "  ${magenta}├─${reset} Storage : ${disk_val}"
  echo -e "  ${magenta}╰─${reset} Shell   : zsh ${shell_ver}"
  echo ""
}

# Jalankan hanya sekali saat sesi baru (tidak saat reload)
if [[ -z "$_GREETING_SHOWN" ]]; then
  export _GREETING_SHOWN=1
  _terminal_greeting
fi

### 🟢 fnm (Node.js manager) — harus di atas instant prompt
if command -v fnm &>/dev/null; then
  eval "$(fnm env --use-on-cd --shell zsh)"
fi

# Enable Powerlevel10k instant prompt. Should stay close to the top of ~/.zshrc.
# Initialization code that may require console input (password prompts, [y/n]
# confirmations, etc.) must go above this block; everything else may go below.
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi
