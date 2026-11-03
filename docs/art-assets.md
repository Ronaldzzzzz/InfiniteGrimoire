# 美術素材清單

遊戲目前用程式繪製的 placeholder 圖形；把下列 PNG 放到 `public/assets/<key>.png` 即可自動替換（缺檔則維持 placeholder）。

## 通則

- 格式：透明背景 PNG，像素風，不抗鋸齒，不要漸層。
- 背景色為 `#0d0f14`（近黑），素材要在深色背景上清晰可讀。
- 調色盤：統一使用 1-bit / Pico-8 風格的有限色盤；主色用下列屬性色，輔以白色與深灰描邊。
  - 符文綠 `#8fd16a`、琥珀 `#e8b84a`、中性 `#b8c7ff`
  - 火 `#e2643b`、風 `#7fd0c0`、雷 `#f3e36b`、土 `#c79a5a`、水 `#5aa0e8`
- Sprite sheet 排列：所有影格由左至右排成單一橫列，每格尺寸固定（32×32 或 64×64），不留間距；PNG 總寬 = 影格寬 × 影格數，總高 = 影格高。
- 現階段每個素材請只提供單一影格；下方每項的「尺寸」「影格數」是之後支援動畫時的建議規格（「之後」）。
- 單張靜態圖視為 1 格。目前程式把整張 PNG 當成單一圖使用，尚未實作切格播放；若要先替換上線，請只放單一影格（32×32 或 64×64），多影格 sheet 留待播放功能完成後使用。

## 角色

### hero_idle

- 檔名：`public/assets/hero_idle.png`
- 用途：玩家（法師）的待機角色，站在戰鬥畫面左側。
- 尺寸：現階段 32×32 單張；之後建議 4 格（輕微呼吸／法袍擺動），總尺寸 128×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, single static frame, idle pose, a small hooded mage holding a glowing grimoire, side view facing right, dark robe with #b8c7ff and #e8b84a accents, subtle breathing motion
```

## 魔物

### monster_mist_slime

- 檔名：`public/assets/monster_mist_slime.png`
- 用途：迷霧史萊姆（Mist Slime），水屬性，T1。
- 尺寸：現階段 32×32 單張；之後建議 2 格待機動畫，總尺寸 64×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, single static frame, idle pose, small fantasy monster "Mist Slime", water element themed, dominant color #5aa0e8, front-facing, menacing but cute silhouette
```

### monster_meadow_sprite

- 檔名：`public/assets/monster_meadow_sprite.png`
- 用途：草原精靈（Meadow Sprite），風屬性，T1。
- 尺寸：現階段 32×32 單張；之後建議 2 格待機動畫，總尺寸 64×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, single static frame, idle pose, small fantasy monster "Meadow Sprite", wind element themed, dominant color #7fd0c0, front-facing, menacing but cute silhouette
```

### monster_ember_bunny

- 檔名：`public/assets/monster_ember_bunny.png`
- 用途：餘燼兔（Ember Bunny），火屬性，T1。
- 尺寸：現階段 32×32 單張；之後建議 2 格待機動畫，總尺寸 64×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, single static frame, idle pose, small fantasy monster "Ember Bunny", fire element themed, dominant color #e2643b, front-facing, menacing but cute silhouette
```

### monster_mist_stag

- 檔名：`public/assets/monster_mist_stag.png`
- 用途：迷霧雄鹿（Mist Stag），風屬性，T2，魔王。
- 尺寸：現階段 64×64 單張；之後建議 4 格待機動畫，總尺寸 256×64。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 64x64 sprite, single static frame, idle pose, imposing boss monster "Mist Stag", wind element themed, dominant color #7fd0c0, front-facing, menacing but cute silhouette, larger and more detailed than regular monsters
```

### monster_gorge_hawk

- 檔名：`public/assets/monster_gorge_hawk.png`
- 用途：峽谷隼（Gorge Hawk），風屬性，T3。
- 尺寸：現階段 32×32 單張；之後建議 2 格待機動畫，總尺寸 64×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, single static frame, idle pose, small fantasy monster "Gorge Hawk", wind element themed, dominant color #7fd0c0, front-facing, menacing but cute silhouette
```

### monster_thunder_lizard

- 檔名：`public/assets/monster_thunder_lizard.png`
- 用途：雷鳴蜥蜴（Thunder Lizard），雷屬性，T3。
- 尺寸：現階段 32×32 單張；之後建議 2 格待機動畫，總尺寸 64×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, single static frame, idle pose, small fantasy monster "Thunder Lizard", thunder element themed, dominant color #f3e36b, front-facing, menacing but cute silhouette
```

### monster_stone_golem

- 檔名：`public/assets/monster_stone_golem.png`
- 用途：碎岩魔像（Stone Golem），土屬性，T3。
- 尺寸：現階段 32×32 單張；之後建議 2 格待機動畫，總尺寸 64×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, single static frame, idle pose, small fantasy monster "Stone Golem", earth element themed, dominant color #c79a5a, front-facing, menacing but cute silhouette
```

### monster_storm_roc

- 檔名：`public/assets/monster_storm_roc.png`
- 用途：暴風巨鵬（Storm Roc），雷屬性，T4，魔王。
- 尺寸：現階段 64×64 單張；之後建議 4 格待機動畫，總尺寸 256×64。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 64x64 sprite, single static frame, idle pose, imposing boss monster "Storm Roc", thunder element themed, dominant color #f3e36b, front-facing, menacing but cute silhouette, larger and more detailed than regular monsters
```

### monster_ash_wolf

- 檔名：`public/assets/monster_ash_wolf.png`
- 用途：灰燼狼（Ash Wolf），火屬性，T5。
- 尺寸：現階段 32×32 單張；之後建議 2 格待機動畫，總尺寸 64×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, single static frame, idle pose, small fantasy monster "Ash Wolf", fire element themed, dominant color #e2643b, front-facing, menacing but cute silhouette
```

### monster_magma_crab

- 檔名：`public/assets/monster_magma_crab.png`
- 用途：熔岩蟹（Magma Crab），土屬性，T5。
- 尺寸：現階段 32×32 單張；之後建議 2 格待機動畫，總尺寸 64×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, single static frame, idle pose, small fantasy monster "Magma Crab", earth element themed, dominant color #c79a5a, front-facing, menacing but cute silhouette
```

### monster_cinder_wisp

- 檔名：`public/assets/monster_cinder_wisp.png`
- 用途：餘燼火靈（Cinder Wisp），火屬性，T5。
- 尺寸：現階段 32×32 單張；之後建議 2 格待機動畫，總尺寸 64×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, single static frame, idle pose, small fantasy monster "Cinder Wisp", fire element themed, dominant color #e2643b, front-facing, menacing but cute silhouette
```

### monster_ash_dragon

- 檔名：`public/assets/monster_ash_dragon.png`
- 用途：灰燼龍（Ash Dragon），火屬性，T6，魔王。
- 尺寸：現階段 64×64 單張；之後建議 4 格待機動畫，總尺寸 256×64。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 64x64 sprite, single static frame, idle pose, imposing boss monster "Ash Dragon", fire element themed, dominant color #e2643b, front-facing, menacing but cute silhouette, larger and more detailed than regular monsters
```

### monster_dew_frog

- 檔名：`public/assets/monster_dew_frog.png`
- 用途：露水蛙（Dew Frog），水屬性，T2。
- 尺寸：現階段 32×32 單張；之後建議 2 格待機動畫，總尺寸 64×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, single static frame, idle pose, small fantasy monster "Dew Frog", water element themed, dominant color #5aa0e8, front-facing, menacing but cute silhouette
```

### monster_spark_beetle

- 檔名：`public/assets/monster_spark_beetle.png`
- 用途：電光甲蟲（Spark Beetle），雷屬性，T3。
- 尺寸：現階段 32×32 單張；之後建議 2 格待機動畫，總尺寸 64×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, single static frame, idle pose, small fantasy monster "Spark Beetle", thunder element themed, dominant color #f3e36b, front-facing, menacing but cute silhouette
```

### monster_cinder_hound

- 檔名：`public/assets/monster_cinder_hound.png`
- 用途：燼火獵犬（Cinder Hound），火屬性，T5。
- 尺寸：現階段 32×32 單張；之後建議 2 格待機動畫，總尺寸 64×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, single static frame, idle pose, small fantasy monster "Cinder Hound", fire element themed, dominant color #e2643b, front-facing, menacing but cute silhouette
```

### monster_salamander

- 檔名：`public/assets/monster_salamander.png`
- 用途：火蜥蜴（Salamander），火屬性，T6。
- 尺寸：現階段 32×32 單張；之後建議 2 格待機動畫，總尺寸 64×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, single static frame, idle pose, small fantasy monster "Salamander", fire element themed, dominant color #e2643b, front-facing, menacing but cute silhouette
```

### monster_magma_golem

- 檔名：`public/assets/monster_magma_golem.png`
- 用途：熔岩魔像（Magma Golem），土屬性，T6。
- 尺寸：現階段 32×32 單張；之後建議 2 格待機動畫，總尺寸 64×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, single static frame, idle pose, small fantasy monster "Magma Golem", earth element themed, dominant color #c79a5a, front-facing, menacing but cute silhouette
```

### monster_volcano_drake

- 檔名：`public/assets/monster_volcano_drake.png`
- 用途：火山飛龍（Volcano Drake），火屬性，T6，魔王。
- 尺寸：現階段 64×64 單張；之後建議 4 格待機動畫，總尺寸 256×64。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 64x64 sprite, single static frame, idle pose, imposing boss monster "Volcano Drake", fire element themed, dominant color #e2643b, front-facing, menacing but cute silhouette, larger and more detailed than regular monsters
```

### monster_temple_guardian

- 檔名：`public/assets/monster_temple_guardian.png`
- 用途：神殿石衛（Temple Guardian），土屬性，T7。
- 尺寸：現階段 32×32 單張；之後建議 2 格待機動畫，總尺寸 64×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, single static frame, idle pose, small fantasy monster "Temple Guardian", earth element themed, dominant color #c79a5a, front-facing, menacing but cute silhouette
```

### monster_abyss_eel

- 檔名：`public/assets/monster_abyss_eel.png`
- 用途：深淵鰻（Abyss Eel），水屬性，T7。
- 尺寸：現階段 32×32 單張；之後建議 2 格待機動畫，總尺寸 64×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, single static frame, idle pose, small fantasy monster "Abyss Eel", water element themed, dominant color #5aa0e8, front-facing, menacing but cute silhouette
```

### monster_coral_colossus

- 檔名：`public/assets/monster_coral_colossus.png`
- 用途：珊瑚巨像（Coral Colossus），土屬性，T8。
- 尺寸：現階段 32×32 單張；之後建議 2 格待機動畫，總尺寸 64×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, single static frame, idle pose, small fantasy monster "Coral Colossus", earth element themed, dominant color #c79a5a, front-facing, menacing but cute silhouette
```

### monster_sunken_titan

- 檔名：`public/assets/monster_sunken_titan.png`
- 用途：沉沒巨神（Sunken Titan），土屬性，T8，魔王。
- 尺寸：現階段 64×64 單張；之後建議 4 格待機動畫，總尺寸 256×64。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 64x64 sprite, single static frame, idle pose, imposing boss monster "Sunken Titan", earth element themed, dominant color #c79a5a, front-facing, menacing but cute silhouette, larger and more detailed than regular monsters
```

### monster_meteor_golem

- 檔名：`public/assets/monster_meteor_golem.png`
- 用途：隕鐵魔像（Meteor Golem），土屬性，T8。
- 尺寸：現階段 32×32 單張；之後建議 2 格待機動畫，總尺寸 64×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, single static frame, idle pose, small fantasy monster "Meteor Golem", earth element themed, dominant color #c79a5a, front-facing, menacing but cute silhouette
```

### monster_frost_griffin

- 檔名：`public/assets/monster_frost_griffin.png`
- 用途：霜翼獅鷲（Frost Griffin），風屬性，T9。
- 尺寸：現階段 32×32 單張；之後建議 2 格待機動畫，總尺寸 64×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, single static frame, idle pose, small fantasy monster "Frost Griffin", wind element themed, dominant color #7fd0c0, front-facing, menacing but cute silhouette
```

### monster_astral_ray

- 檔名：`public/assets/monster_astral_ray.png`
- 用途：星界鰩（Astral Ray），水屬性，T9。
- 尺寸：現階段 32×32 單張；之後建議 2 格待機動畫，總尺寸 64×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, single static frame, idle pose, small fantasy monster "Astral Ray", water element themed, dominant color #5aa0e8, front-facing, menacing but cute silhouette
```

### monster_fallen_star_wyrm

- 檔名：`public/assets/monster_fallen_star_wyrm.png`
- 用途：墮星龍（Fallen Star Wyrm），火屬性，T9，魔王。
- 尺寸：現階段 64×64 單張；之後建議 4 格待機動畫，總尺寸 256×64。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 64x64 sprite, single static frame, idle pose, imposing boss monster "Fallen Star Wyrm", fire element themed, dominant color #e2643b, front-facing, menacing but cute silhouette, larger and more detailed than regular monsters
```

### monster_ash_giant

- 檔名：`public/assets/monster_ash_giant.png`
- 用途：灰燼巨人（Ash Giant），火屬性，T9。
- 尺寸：現階段 32×32 單張；之後建議 2 格待機動畫，總尺寸 64×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, single static frame, idle pose, small fantasy monster "Ash Giant", fire element themed, dominant color #e2643b, front-facing, menacing but cute silhouette
```

### monster_chaos_wisp

- 檔名：`public/assets/monster_chaos_wisp.png`
- 用途：混沌雷靈（Chaos Wisp），雷屬性，T10。
- 尺寸：現階段 32×32 單張；之後建議 2 格待機動畫，總尺寸 64×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, single static frame, idle pose, small fantasy monster "Chaos Wisp", thunder element themed, dominant color #f3e36b, front-facing, menacing but cute silhouette
```

### monster_doom_knight

- 檔名：`public/assets/monster_doom_knight.png`
- 用途：終焉騎士（Doom Knight），土屬性，T10。
- 尺寸：現階段 32×32 單張；之後建議 2 格待機動畫，總尺寸 64×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, single static frame, idle pose, small fantasy monster "Doom Knight", earth element themed, dominant color #c79a5a, front-facing, menacing but cute silhouette
```

### monster_first_page_warden

- 檔名：`public/assets/monster_first_page_warden.png`
- 用途：太初守門者（First Page Warden），風屬性，T10，魔王。
- 尺寸：現階段 64×64 單張；之後建議 4 格待機動畫，總尺寸 256×64。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 64x64 sprite, single static frame, idle pose, imposing boss monster "First Page Warden", wind element themed, dominant color #7fd0c0, front-facing, menacing but cute silhouette, larger and more detailed than regular monsters
```

## 特效

特效（火星、風痕、閃電、碎石、水滴、龍捲、熔岩、冰霜等）全部由程式繪製（`src/render/element-fx.ts`、`src/render/battle-view.ts`），不需要貼圖。


## 書房與羊皮紙（魔法陣區，不是像素風）

這兩張是右欄魔法陣區的背景，風格是寫實手繪質感，不套用上面的像素風通則。由使用者用 AI 繪圖生成（2026-11-03 決定）；pngtree 的參考圖只作風格參考，不可放進版本庫。缺檔時程式用暫代的紙張與木桌，放進檔案就會自動換上。

### parchment

- 檔名：`public/assets/parchment.webp`
- 用途：魔法陣畫在這張紙上（直立）；中間要留白，程式會在上面畫陣。
- 尺寸：1024×1280（4:5 直立），透明背景（破邊外面要透明）。
- 提示詞：
```
top-down view of a single sheet of old parchment paper, portrait orientation 4:5, aged yellowed vellum with subtle brown stains and faint fibers, irregular torn and slightly burnt-looking ragged edges, the top and bottom edges gently curling upward like a scroll that was just unrolled, soft shadows under the curled edges, the center area plain and empty (no writing, no drawings, no symbols), even soft warm lighting, high detail, realistic painted texture, isolated on a transparent background
```
- 負面提示詞：
```
text, letters, runes, magic circle, drawings, watermark, logo, signature, frame, border, table, hands, objects, vignette, harsh shadows, blurry
```

### desk

- 檔名：`public/assets/desk.webp`
- 用途：右欄（元素表與魔法陣）的背景桌面，羊皮紙放在它上面。整體要暗，不能搶過紙與元素表的文字。
- 尺寸：1600×1000，不需要透明。
- 提示詞：
```
top-down view of a thick dark oak writing desk in a dim medieval wizard's study, rich wood grain, worn and scratched surface, warm candlelight coming from the top left corner, deep shadows and strong dark vignette toward the edges, the center of the desk empty and clear, moody, low key lighting, fantasy, realistic painted texture, high detail
```
- 負面提示詞：
```
paper, books, candles visible, quills, objects in the center, people, hands, text, watermark, logo, bright lighting, overexposed, blurry
```
- 小技巧：生成後若太亮，整張降低亮度約 30～40%；中間偏暗沒關係，紙張會蓋在上面。

## 符文圖示（魔法陣區的八個符文）

符文帶與符文圈用圖示顯示，缺檔時程式畫暫代線稿，放進檔案就會自動換上。

- 檔名：`public/assets/rune-<id>.webp`，id 對應：`bolt` 射、`blades` 刃、`ring` 波、`chain` 鏈、`zone` 域、`meteor` 墜、`storm` 嵐、`field` 臨。
- 尺寸：256×256，透明背景，深色墨線（要能放在羊皮紙上），單色為主，可帶一點金色點綴；小尺寸（約 14 px）也要看得出輪廓。
- 共用提示詞前綴：
```
a single arcane rune icon, hand-inked dark brown ink line art on transparent background, bold simple silhouette, slight gold leaf accent, medieval grimoire style, centered, no text, no border, flat, high contrast,
```
- 各符文接在前綴後面：
  - 射 `bolt`：`a straight arrow pointing right`
  - 刃 `blades`：`two crossed curved blades`
  - 波 `ring`：`concentric ripple arcs spreading outward`
  - 鏈 `chain`：`three interlocked chain rings`
  - 域 `zone`：`a circle filled with a square grid`
  - 墜 `meteor`：`a falling star with a streaking tail`
  - 嵐 `storm`：`a spiral whirlwind`
  - 臨 `field`：`an inverted triangle with a dot at its center`
- 負面提示詞：
```
text, letters, background, frame, border, color gradient, photo, realistic shading, watermark, logo, blurry
```
