#!/usr/bin/env bash
# 生成《決戰》三段配樂（每段跑多個 seed，之後挑最好的）。
# 用法：bash gen-kessen-music.sh [段名 council|battle|climax|all，預設 all] [seed 數，預設 3] [yue2.cpp 目錄，預設 ~/yue2/yue2.cpp]
set -euo pipefail
WHICH="${1:-all}"; N="${2:-3}"; ROOT="${3:-$HOME/yue2/yue2.cpp}"
cd "$ROOT"; mkdir -p out
gen() { # 段名 風格 秒數
  local name="$1" style="$2" dur="$3"
  for ((i = 1; i <= N; i++)); do
    local seed=$((100 + i))
    printf '{\n  "style": "%s",\n  "lyrics": "",\n  "duration": %s,\n  "seed": %d,\n  "output_format": "mp3",\n  "mp3_bitrate": 112\n}\n' "$style" "$dur" "$seed" > "out/$name-$seed.json"
    echo "== $name seed $seed"
    ./build/yue-synth --model models/YuE2-3B-Q8_0.gguf --vae models/YuE2-Vae-F32.gguf --request "out/$name-$seed.json" --out "out/$name-$seed.mp3"
  done
}
# 三段：軍議／出陣（沉穩）、交戰（太鼓急促）、別働隊抵達到結算（高潮）。都要求無人聲；有人聲就換 seed 或在 style 加 "no singing, no lyrics"
[ "$WHICH" = all -o "$WHICH" = council ] && gen council "instrumental, japanese traditional, shakuhachi, koto, biwa, slow, solemn, tense, cinematic, sengoku, no vocals" 100
[ "$WHICH" = all -o "$WHICH" = battle ]  && gen battle  "instrumental, japanese taiko drums, war drums, fast, driving, epic, cinematic, sengoku battle, no vocals" 110
[ "$WHICH" = all -o "$WHICH" = climax ]  && gen climax  "instrumental, japanese taiko, shakuhachi, brass, orchestral, triumphant, climax, epic, cinematic, no vocals" 100
echo "輸出在 $ROOT/out/。挑好的檔案改名成 council.mp3／battle.mp3／climax.mp3 丟給我，我接進遊戲"
