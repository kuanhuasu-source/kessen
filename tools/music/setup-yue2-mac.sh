#!/usr/bin/env bash
# 在 macOS（Apple Silicon）架設 yue2.cpp 並生成一段 60 秒測試曲。
# 用法：bash setup-yue2-mac.sh [安裝目錄，預設 ~/yue2]
# 依 https://github.com/ServeurpersoCom/yue2.cpp README 整理，尚未在 Mac 上實跑過；哪一步失敗請把畫面貼給我。
set -euo pipefail
DIR="${1:-$HOME/yue2}"
say() { printf '\n\033[1;33m== %s\033[0m\n' "$*"; }

say "1/5 前置工具（Xcode 命令列工具、Homebrew、cmake、git、python）"
if ! xcode-select -p >/dev/null 2>&1; then xcode-select --install; echo "請先完成 Xcode 命令列工具的安裝視窗，再重新執行本腳本"; exit 1; fi
if ! command -v brew >/dev/null 2>&1; then
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi
brew list cmake >/dev/null 2>&1 || brew install cmake
brew list git >/dev/null 2>&1 || brew install git
brew list python >/dev/null 2>&1 || brew install python

say "2/5 下載 yue2.cpp 原始碼 → $DIR/yue2.cpp"
mkdir -p "$DIR"; cd "$DIR"
if [ ! -d yue2.cpp ]; then git clone --recurse-submodules https://github.com/ServeurpersoCom/yue2.cpp.git; fi
cd yue2.cpp
git submodule update --init --recursive

say "3/5 建置（macOS 會自動啟用 Metal 與 Accelerate）"
./buildcpu.sh
test -x build/yue-synth || { echo "找不到 build/yue-synth，建置失敗"; exit 1; }

say "4/5 下載模型（約 4.3 GB，放在 models/）"
mkdir -p models
dl() { # 檔名
  [ -s "models/$1" ] && { echo "已有 $1"; return; }
  curl -L -C - --progress-bar -o "models/$1.part" "https://huggingface.co/Serveurperso/YuE2-GGUF/resolve/main/$1" && mv "models/$1.part" "models/$1"
}
dl YuE2-3B-Q8_0.gguf
dl YuE2-Vae-F32.gguf

say "5/5 生成 60 秒測試曲（看 Metal 跑不跑得動、速度多少）"
cat > request-test.json <<'J'
{
  "style": "instrumental, japanese taiko drums, shakuhachi, biwa, war drums, epic, cinematic, sengoku, no vocals",
  "lyrics": "",
  "duration": 60.0,
  "seed": 7,
  "output_format": "mp3",
  "mp3_bitrate": 128
}
J
time ./build/yue-synth --model models/YuE2-3B-Q8_0.gguf --vae models/YuE2-Vae-F32.gguf --request request-test.json --out test.mp3
echo
echo "完成：$DIR/yue2.cpp/test.mp3"
echo "接著可以用 gen-kessen-music.sh 生成三段配樂，或執行 ./server.sh 開 http://localhost:8087 用網頁介面"
