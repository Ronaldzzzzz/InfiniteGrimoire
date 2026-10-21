# 美術素材清單

遊戲目前用程式繪製的 placeholder 圖形；把下列 PNG 放到 `public/assets/<key>.png` 即可自動替換（缺檔則維持 placeholder）。

## 通則

- 格式：透明背景 PNG，像素風，不抗鋸齒，不要漸層。
- 背景色為 `#0d0f14`（近黑），素材要在深色背景上清晰可讀。
- 調色盤：統一使用 1-bit / Pico-8 風格的有限色盤；主色用下列屬性色，輔以白色與深灰描邊。
  - 符文綠 `#8fd16a`、琥珀 `#e8b84a`、中性 `#b8c7ff`
  - 火 `#e2643b`、風 `#7fd0c0`、雷 `#f3e36b`、土 `#c79a5a`、水 `#5aa0e8`
- Sprite sheet 排列：所有影格由左至右排成單一橫列，每格尺寸固定（32×32 或 64×64），不留間距；PNG 總寬 = 影格寬 × 影格數，總高 = 影格高。
- 單張靜態圖視為 1 格。目前程式把整張 PNG 當成單一圖使用，尚未實作切格播放；若要先替換上線，請只放單一影格（32×32 或 64×64），多影格 sheet 留待播放功能完成後使用。

## 角色

### hero_idle

- 檔名：`public/assets/hero_idle.png`
- 用途：玩家（法師）的待機角色，站在戰鬥畫面左側。
- 尺寸：32×32 每格；建議 4 格（輕微呼吸／法袍擺動），總尺寸 128×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, 4-frame idle animation sprite sheet laid out horizontally (128x32), a small hooded mage holding a glowing grimoire, side view facing right, dark robe with #b8c7ff and #e8b84a accents, subtle breathing motion
```

## 魔物

### monster_mist_slime

- 檔名：`public/assets/monster_mist_slime.png`
- 用途：迷霧史萊姆（Mist Slime），水屬性，T1。
- 尺寸：32×32 每格；建議 2 格待機動畫，總尺寸 64×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, 2-frame idle animation sprite sheet laid out horizontally (64x32), small fantasy monster "Mist Slime", water element themed, dominant color #5aa0e8, front-facing, menacing but cute silhouette
```

### monster_meadow_sprite

- 檔名：`public/assets/monster_meadow_sprite.png`
- 用途：草原精靈（Meadow Sprite），風屬性，T1。
- 尺寸：32×32 每格；建議 2 格待機動畫，總尺寸 64×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, 2-frame idle animation sprite sheet laid out horizontally (64x32), small fantasy monster "Meadow Sprite", wind element themed, dominant color #7fd0c0, front-facing, menacing but cute silhouette
```

### monster_ember_bunny

- 檔名：`public/assets/monster_ember_bunny.png`
- 用途：餘燼兔（Ember Bunny），火屬性，T1。
- 尺寸：32×32 每格；建議 2 格待機動畫，總尺寸 64×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, 2-frame idle animation sprite sheet laid out horizontally (64x32), small fantasy monster "Ember Bunny", fire element themed, dominant color #e2643b, front-facing, menacing but cute silhouette
```

### monster_mist_stag

- 檔名：`public/assets/monster_mist_stag.png`
- 用途：迷霧雄鹿（Mist Stag），風屬性，T2，魔王。
- 尺寸：64×64 每格；建議 4 格待機動畫，總尺寸 256×64。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 64x64 sprite, 4-frame idle animation sprite sheet laid out horizontally (256x64), imposing boss monster "Mist Stag", wind element themed, dominant color #7fd0c0, front-facing, menacing but cute silhouette, larger and more detailed than regular monsters
```

### monster_gorge_hawk

- 檔名：`public/assets/monster_gorge_hawk.png`
- 用途：峽谷隼（Gorge Hawk），風屬性，T3。
- 尺寸：32×32 每格；建議 2 格待機動畫，總尺寸 64×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, 2-frame idle animation sprite sheet laid out horizontally (64x32), small fantasy monster "Gorge Hawk", wind element themed, dominant color #7fd0c0, front-facing, menacing but cute silhouette
```

### monster_thunder_lizard

- 檔名：`public/assets/monster_thunder_lizard.png`
- 用途：雷鳴蜥蜴（Thunder Lizard），雷屬性，T3。
- 尺寸：32×32 每格；建議 2 格待機動畫，總尺寸 64×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, 2-frame idle animation sprite sheet laid out horizontally (64x32), small fantasy monster "Thunder Lizard", thunder element themed, dominant color #f3e36b, front-facing, menacing but cute silhouette
```

### monster_stone_golem

- 檔名：`public/assets/monster_stone_golem.png`
- 用途：碎岩魔像（Stone Golem），土屬性，T3。
- 尺寸：32×32 每格；建議 2 格待機動畫，總尺寸 64×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, 2-frame idle animation sprite sheet laid out horizontally (64x32), small fantasy monster "Stone Golem", earth element themed, dominant color #c79a5a, front-facing, menacing but cute silhouette
```

### monster_storm_roc

- 檔名：`public/assets/monster_storm_roc.png`
- 用途：暴風巨鵬（Storm Roc），雷屬性，T4，魔王。
- 尺寸：64×64 每格；建議 4 格待機動畫，總尺寸 256×64。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 64x64 sprite, 4-frame idle animation sprite sheet laid out horizontally (256x64), imposing boss monster "Storm Roc", thunder element themed, dominant color #f3e36b, front-facing, menacing but cute silhouette, larger and more detailed than regular monsters
```

### monster_ash_wolf

- 檔名：`public/assets/monster_ash_wolf.png`
- 用途：灰燼狼（Ash Wolf），火屬性，T5。
- 尺寸：32×32 每格；建議 2 格待機動畫，總尺寸 64×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, 2-frame idle animation sprite sheet laid out horizontally (64x32), small fantasy monster "Ash Wolf", fire element themed, dominant color #e2643b, front-facing, menacing but cute silhouette
```

### monster_magma_crab

- 檔名：`public/assets/monster_magma_crab.png`
- 用途：熔岩蟹（Magma Crab），土屬性，T5。
- 尺寸：32×32 每格；建議 2 格待機動畫，總尺寸 64×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, 2-frame idle animation sprite sheet laid out horizontally (64x32), small fantasy monster "Magma Crab", earth element themed, dominant color #c79a5a, front-facing, menacing but cute silhouette
```

### monster_cinder_wisp

- 檔名：`public/assets/monster_cinder_wisp.png`
- 用途：餘燼火靈（Cinder Wisp），火屬性，T5。
- 尺寸：32×32 每格；建議 2 格待機動畫，總尺寸 64×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, 2-frame idle animation sprite sheet laid out horizontally (64x32), small fantasy monster "Cinder Wisp", fire element themed, dominant color #e2643b, front-facing, menacing but cute silhouette
```

### monster_ash_dragon

- 檔名：`public/assets/monster_ash_dragon.png`
- 用途：灰燼龍（Ash Dragon），火屬性，T6，魔王。
- 尺寸：64×64 每格；建議 4 格待機動畫，總尺寸 256×64。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 64x64 sprite, 4-frame idle animation sprite sheet laid out horizontally (256x64), imposing boss monster "Ash Dragon", fire element themed, dominant color #e2643b, front-facing, menacing but cute silhouette, larger and more detailed than regular monsters
```

## 特效

特效為 32×32 每格的橫向 sprite sheet，建議 4–6 格，總尺寸 128×32 至 192×32。中性色 `#b8c7ff` 為主，程式會依法術屬性上色，因此建議以接近白／淺色繪製。

### fx_bolt

- 檔名：`public/assets/fx_bolt.png`
- 用途：魔彈：單體射彈的飛行與命中。
- 尺寸：32×32 每格；建議 6 格，總尺寸 192×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, 6-frame effect animation sprite sheet laid out horizontally (192x32), a small glowing magic bolt projectile flying right with a short trailing tail, then impact burst in the last frame, white and pale #b8c7ff colors so it can be tinted
```

### fx_beam

- 檔名：`public/assets/fx_beam.png`
- 用途：光束：持續照射的直線光束。
- 尺寸：32×32 每格；建議 6 格，總尺寸 192×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, 6-frame effect animation sprite sheet laid out horizontally (192x32), a straight horizontal energy beam segment that pulses and flickers, tileable horizontally, white and pale #b8c7ff colors so it can be tinted
```

### fx_chain

- 檔名：`public/assets/fx_chain.png`
- 用途：連鎖：在多個目標間跳躍的鋸齒閃電。
- 尺寸：32×32 每格；建議 6 格，總尺寸 192×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, 6-frame effect animation sprite sheet laid out horizontally (192x32), a jagged zig-zag chain lightning arc segment crackling with small sparks, white and pale #b8c7ff colors so it can be tinted
```

### fx_nova

- 檔名：`public/assets/fx_nova.png`
- 用途：新星：以施法者為中心向外擴散的環狀爆發。
- 尺寸：32×32 每格；建議 6 格，總尺寸 192×32。
- 提示詞：
```
pixel art, 1-bit / Pico-8 style limited palette, crisp hard edges, no anti-aliasing, no gradients, transparent background, readable on a very dark (#0d0f14) background, 32x32 sprite, 6-frame effect animation sprite sheet laid out horizontally (192x32), a circular nova shockwave expanding outward from the center, ring growing thinner and fading across frames, white and pale #b8c7ff colors so it can be tinted
```
