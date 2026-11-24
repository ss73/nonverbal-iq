#!/usr/bin/env bash
# App Store screenshots from the iPhone 17 Pro Max simulator (6.9", 1320×2868).
# Usage: scripts/screenshots.sh [light|dark]   → store/screenshots/6.9in-1320x2868/NN-<scene>.jpg,
# plus 1290×2796 (older 6.9") and 1284×2778 (6.5") copies for App Store Connect slots that reject 1320×2868.
set -euo pipefail
cd "$(dirname "$0")/.."

APPEARANCE="${1:-light}"
DEVICE="iPhone 17 Pro Max"
BUNDLE="com.ellangames.nonverbaliq"
SCENES=(home matrix series results review)
OUT="store/screenshots/6.9in-1320x2868"
mkdir -p "$OUT"

UDID=$(xcrun simctl list devices available | grep "$DEVICE (" | head -1 | grep -oE '[0-9A-F-]{36}')
xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" >/dev/null
# US region so the status bar clock reads "9:41" (Apple's convention) rather than "09:41".
if [ "$(xcrun simctl spawn "$UDID" defaults read -g AppleLocale 2>/dev/null)" != "en_US" ]; then
  xcrun simctl spawn "$UDID" defaults write -g AppleLocale en_US
  xcrun simctl spawn "$UDID" defaults write -g AppleLanguages -array en
  xcrun simctl shutdown "$UDID"; xcrun simctl boot "$UDID"; xcrun simctl bootstatus "$UDID" >/dev/null
fi
xcrun simctl ui "$UDID" appearance "$APPEARANCE"
xcrun simctl status_bar "$UDID" override --time "9:41" --dataNetwork wifi --wifiBars 3 \
  --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100

APP=ios/App/build/DerivedData/Build/Products/Debug-iphonesimulator/App.app
n=1
for scene in "${SCENES[@]}"; do
  echo "→ $scene"
  VITE_SHOT=$scene npx vite build --logLevel error
  npx cap copy ios >/dev/null
  (cd ios/App && xcodebuild -project App.xcodeproj -scheme App -configuration Debug -sdk iphonesimulator \
    -destination "id=$UDID" -derivedDataPath build/DerivedData -quiet build)
  xcrun simctl terminate "$UDID" "$BUNDLE" 2>/dev/null || true
  xcrun simctl uninstall "$UDID" "$BUNDLE" 2>/dev/null || true
  xcrun simctl install "$UDID" "$APP"
  xcrun simctl launch "$UDID" "$BUNDLE" >/dev/null
  sleep 7
  # JPEG: App Store Connect rejects PNGs with an alpha channel, which simulator screenshots have.
  xcrun simctl io "$UDID" screenshot --type=jpeg "$OUT/$(printf %02d $n)-$scene.jpg" 2>/dev/null
  n=$((n + 1))
done

# Other accepted sizes: scale to width, then trim the few extra pixels top and bottom.
for size in 1290x2796 1284x2778; do
  w=${size%x*}; h=${size#*x}; dir="store/screenshots/$( [ "$w" = 1284 ] && echo 6.5in || echo 6.9in )-$size"
  mkdir -p "$dir"
  for f in "$OUT"/*.jpg; do
    sips -s format jpeg -s formatOptions 95 --resampleWidth "$w" "$f" --out "$dir/$(basename "$f")" >/dev/null
    sips --cropToHeightWidth "$h" "$w" "$dir/$(basename "$f")" >/dev/null
  done
done

# Leave the simulator app as a normal build again.
npm run build --silent >/dev/null && npx cap copy ios >/dev/null
echo "Screenshots in $OUT"
