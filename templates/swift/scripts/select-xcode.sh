# Sourced by the devShell: pins DEVELOPER_DIR to the Xcode declared in .xcode-version.
_xcode_select_pinned() {
  local wanted app version
  wanted="$(tr -d '[:space:]' < .xcode-version)"
  for app in /Applications/Xcode*.app; do
    [[ -f "$app/Contents/version.plist" ]] || continue
    version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Contents/version.plist")"
    if [[ "$version" == "$wanted" ]]; then
      export DEVELOPER_DIR="$app/Contents/Developer"
      return 0
    fi
  done
  echo "error: Xcode $wanted (.xcode-version) not found in /Applications. Install it: xcodes install $wanted" >&2
  return 1
}
_xcode_select_pinned
