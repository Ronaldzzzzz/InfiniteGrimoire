# 第一階段（Phase 1）魔導書全擴充總綱與文案規格（100 五屬本篇 ＋ 15 光暗秘典 ＝ 115 招全集）

- **日期**：2026-10-25
- **狀態**：**✅ 全 115 招（五屬 100 招 ＋ 光暗 15 招）完整文案定稿**
- **核心設計結構**：
  1. **五屬魔導書本篇（100 招，#001 ～ #100）**：
     - 無屬性起點與反噬：**2 招**（`#001 ～ #002`）
     - 五大純屬性常規主幹（5 屬 × 6 階）：**30 招**（`#003 ～ #032`）
     - 十組雙屬性常規支線（10 組 × 3 階）：**30 招**（`#033 ～ #062`）
     - 十組三屬性秘傳術式（10 組 × 2 階）：**20 招**（`#063 ～ #082`）
     - 魔物素材共鳴與五行秘術：**8 招**（`#083 ～ #090`）
     - 五屬與複合神話禁咒（Lv.10）：**10 招**（`#091 ～ #100`，含原聖光審判／深淵吞噬移入光暗篇後補齊的 10 招五屬禁咒，或與光暗共享禁咒池）
  2. **光暗魔導秘典（15 招，#101 ～ #115，遵循與五純屬完全相同的 6 階演進＋禁咒邏輯）**：
     - **光系主幹（聖輝道途）**：6 階常規演進（`#101 ～ #106`，Lv.3 → Lv.4 → Lv.5 → Lv.6 → Lv.8 → Lv.9）＋ Lv.10 光系神話禁咒《聖光審判》
     - **暗系主幹（深淵道途）**：6 階常規演進（`#107 ～ #112`，Lv.3 → Lv.4 → Lv.5 → Lv.6 → Lv.8 → Lv.9）＋ Lv.10 暗系神話禁咒《深淵吞噬》
     - **光暗交匯（黃昏與太初混沌）**：2 階交匯秘傳（`#113 光暗天秤 Lv.7`、`#114 混沌蝕日 Lv.9`）＋ 1 招 Lv.10 光暗至高神話禁咒（`#115 太初混沌`）

---

## 一、第一批：無屬性與五大純屬性全 6 階主幹（#001 ～ #032，共 32 招）

### 1.1 無屬性起點與反噬（#001 ～ #002）

| 編號 | 魔法 ID | 名稱 / 英文名 | 階級 | 學派 (`school`) | 顯隱 | 合成配方 | 詞綴 (`pre` / `noun`) | 說明 (`desc`) 與 殘卷線索 (`hint`) |
| :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- | :--- |
| **#001** | `mana_bolt` | **魔力彈**<br>*Mana Bolt* | Lv.1 | `evocation` | 主幹 | 初始習得 | `魔力` / `魔彈`<br>*Mana* / *Bolt* | **desc**：最基本的魔力彈，打向最近的怪。<br>**hint**：殘卷：純粹的魔力凝聚成彈，是所有魔法的起點。 |
| **#002** | `mana_overload` | **魔力過載**<br>*Mana Overload* | Lv.1 | `enchantment` | 隱藏 | 超出深度上限觸發 | `過載` / `亂流`<br>*Overloaded* / *Turbulence* | **desc**：疊太多層了。魔力在手上炸開，小人暈了兩秒。<br>**hint**：殘卷：把魔法疊得比自己能承受的還深，魔力就會在手中炸開。 |

### 1.2 純火系主幹：6 階演進（#003 ～ #008）

| 編號 | 魔法 ID | 名稱 / 英文名 | 階級 | 學派 (`school`) | 配方 (`inputs`) | 詞綴 (`pre` / `noun`) | 說明 (`desc`)、殘卷 (`hint`) 與 詠唱詞 (`chant`) |
| :--- | :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| **#003** | `fireball` | **火球**<br>*Fireball* | Lv.2 | `evocation` | `el:fire:1` + `el:fire:1` | `灼熱` / `火球`<br>*Blazing* / *Fireball* | **desc**：打中會爆開並點燃，燃燒的怪死掉會把火傳給旁邊的怪。<br>**hint**：殘卷：兩份微弱的火種相遇，會燃起一團火球。 |
| **#004** | `flame_burst` | **烈焰爆發**<br>*Flame Burst* | Lv.3 | `evocation` | `fireball` + `el:fire:2` | `狂焰` / `爆炎`<br>*Raging* / *Blast* | **desc**：更大的火球，砸向怪最多的地方並引發劇烈燃燒。<br>**hint**：殘卷：火球裡再灌進淬鍊過的火，爆炎會大上一圈。 |
| **#005** | `inferno` | **煉獄**<br>*Inferno* | Lv.5 | `evocation` | `flame_burst` + `el:fire:3` | `煉獄` / `業火`<br>*Infernal* / *Hellfire* | **desc**：三團烈焰同時砸進怪群，燒得比什麼都久。<br>**hint**：殘卷：烈焰爆發再吞下高階的火，就再也分不清哪裡是火、哪裡是地面。 |
| **#006**<br>🆕 | `crimson_pillar` | **紅蓮火柱**<br>*Pillar of Ignis* | Lv.6 | `conjuration` | `inferno` + `flame_burst` | `紅蓮` / `火柱`<br>*Crimson* / *Pillar* | **desc**：在最密集的敵群腳下立起貫穿天地的赤紅火柱，持續灼燒並將灰燼向外推開。<br>**hint**：殘卷：將煉獄與烈焰爆發的火種重疊收束，漫天業火便會竄升為擎天火柱。 |
| **#007** | `sunfall` | **墜日**<br>*Sunfall* | Lv.8 | `cataclysm` | `crimson_pillar` + `el:fire:4` | `烈日` / `墜日`<br>*Solar* / *Sunfall* | **desc**：一顆小太陽墜落在怪群中央，熱浪讓全場跟著燃燒。<br>**hint**：殘卷：據說把極階的火灌進紅蓮火柱，天上會掉下第二個太陽。<br>**chant**：*「聽吾號令，天穹之火凝聚——降下第二輪烈日！」* |
| **#008**<br>🆕 | `corona_scorch` | **日冕焦土**<br>*Corona Scorch* | Lv.9 | `cataclysm` | `sunfall` + `el:fire:5` | `日冕` / `焦土`<br>*Corona* / *Scorch* | **desc**：釋放恆星表層的日冕高溫，全場瞬間化為白熱焦土，隨後連降三顆毀滅烈日。<br>**hint**：殘卷：當墜日吞下神階的火種，連大地本身都會融化成發光的日冕。<br>**chant**：*「萬象皆焚，大氣蒸騰——於地上重現恆星之冕！」* |

### 1.3 純風系主幹：6 階演進（#009 ～ #014）

| 編號 | 魔法 ID | 名稱 / 英文名 | 階級 | 學派 (`school`) | 配方 (`inputs`) | 詞綴 (`pre` / `noun`) | 說明 (`desc`)、殘卷 (`hint`) 與 詠唱詞 (`chant`) |
| :--- | :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| **#009** | `wind_blade` | **疾風刃**<br>*Wind Blade* | Lv.2 | `evocation` | `el:wind:1` + `el:wind:1` | `疾風` / `旋風`<br>*Gale* / *Whirlwind* | **desc**：向外甩出三道風刃，把怪擊退。<br>**hint**：殘卷：兩縷微風交纏，會削出銳利的風刃。 |
| **#010** | `tailwind` | **翠風祝禱**<br>*Zephyr's Benediction* | Lv.3 | `enchantment` | `wind_blade` + `el:wind:2` | `翠風` / `祝禱`<br>*Zephyr* / *Grace* | **desc**：甩出四道疾風刃，並以翠風加護自身，施法速度變成 2 倍，持續 8 秒。<br>**hint**：殘卷：風刃裡再灌進淬鍊過的風，氣流會轉而推著施法者高速詠唱。 |
| **#011** | `vacuum_blades` | **真空刃**<br>*Vacuum Blades* | Lv.5 | `evocation` | `tailwind` + `el:wind:3` | `真空` / `風刃`<br>*Vacuum* / *Blades* | **desc**：八道真空刃同時甩出，施法也跟著變快。<br>**hint**：殘卷：翠風祝禱之中再灌進高階的風，空氣會被削成看不見的刀。 |
| **#012**<br>🆕 | `severing_scythe` | **斷空風鐮**<br>*Severing Scythe* | Lv.6 | `evocation` | `vacuum_blades` + `tailwind` | `斷空` / `風鐮`<br>*Severing* / *Scythe* | **desc**：將真空壓縮為十二柄弧形巨鐮橫掃戰場，強行撕裂並擊退沿途所有魔物。<br>**hint**：殘卷：當真空刃乘著翠風祝禱再度加速，無形的風壓會彎曲成收割萬物的巨鐮。 |
| **#013** | `sky_tempest` | **天穹颶風**<br>*Sky Tempest* | Lv.8 | `conjuration` | `severing_scythe` + `el:wind:4` | `天穹` / `颶風`<br>*Heavenly* / *Tempest* | **desc**：整片天空捲成颶風，把怪吸到中間再用風刃切碎。<br>**hint**：殘卷：斷空風鐮再吞下極階的風，整片天空都會跟著旋轉。<br>**chant**：*「大氣之環盡數崩解，化作撕裂蒼穹的風暴之眼！」* |
| **#014**<br>🆕 | `void_gale` | **絕空裂風**<br>*Void Gale* | Lv.9 | `cataclysm` | `sky_tempest` + `el:wind:5` | `絕空` / `裂風`<br>*Void* / *Riftwind* | **desc**：抽空戰場上的一切大氣形成絕對真空，瞬間內爆將敵群扯向中心，再以漫天次元風刃絞碎。<br>**hint**：殘卷：在天穹颶風的風眼注入神階之風，連空間本身都會被吹出裂痕。<br>**chant**：*「呼吸止息，萬籟俱寂——於絕對真空之中碎裂吧！」* |

### 1.4 純雷系主幹：6 階演進（#015 ～ #020）

| 編號 | 魔法 ID | 名稱 / 英文名 | 階級 | 學派 (`school`) | 配方 (`inputs`) | 詞綴 (`pre` / `noun`) | 說明 (`desc`)、殘卷 (`hint`) 與 詠唱詞 (`chant`) |
| :--- | :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| **#015** | `lightning` | **落雷**<br>*Lightning* | Lv.2 | `evocation` | `el:thunder:1` + `el:thunder:1` | `雷鳴` / `雷擊`<br>*Thundering* / *Strike* | **desc**：閃電在怪之間跳躍。打到濕的怪傷害加倍。<br>**hint**：殘卷：兩粒雷光碰撞，電流會在敵人之間跳躍。 |
| **#016** | `thunder_hammer` | **雷神之槌**<br>*Thunder Hammer* | Lv.3 | `evocation` | `lightning` + `el:thunder:2` | `神雷` / `雷槌`<br>*Divine* / *Hammer* | **desc**：重槌打向最硬的那一隻，再往外跳出連鎖閃電。<br>**hint**：殘卷：落雷裡再灌進淬鍊過的雷，雷光會凝成一柄重槌。 |
| **#017** | `myriad_thunder` | **萬雷**<br>*Myriad Thunder* | Lv.5 | `evocation` | `thunder_hammer` + `el:thunder:3` | `萬雷` / `雷網`<br>*Myriad* / *Web* | **desc**：重雷先劈最硬的一隻，接著閃電跳過十二隻怪並炸開。<br>**hint**：殘卷：雷神之槌再吞下高階的雷，雷光會分成千萬道。 |
| **#018**<br>🆕 | `voltaris_javelin` | **雷光長槍**<br>*Javelin of Voltaris* | Lv.6 | `evocation` | `myriad_thunder` + `thunder_hammer` | `雷槍` / `貫雷`<br>*Voltaic* / *Javelin* | **desc**：將漫天雷網收束為三柄極速雷槍，精準狙擊最強敵人並使其麻痺暈眩，餘波化為電弧擴散。<br>**hint**：殘卷：把萬雷的電網重新鍛打進雷神之槌，重槌便會蛻變為貫穿重甲的雷光長槍。 |
| **#019** | `thunder_god` | **雷神降臨**<br>*Thundergod Descends* | Lv.8 | `cataclysm` | `voltaris_javelin` + `el:thunder:4` | `雷神` / `天罰`<br>*Thundergod* / *Judgement* | **desc**：雷神親自下凡，四秒內落雷如雨，最後重重一槌。<br>**hint**：殘卷：雷光長槍之中再灌進極階的雷——傳說雷神會親自回應。<br>**chant**：*「萬雷俯首，司掌天罰之神明於此降臨！」* |
| **#020**<br>🆕 | `astral_fulmination` | **星屑雷罰**<br>*Astral Fulmination* | Lv.9 | `cataclysm` | `thunder_god` + `el:thunder:5` | `星雷` / `神罰`<br>*Astral* / *Fulmination* | **desc**：引落星界層的蒼白神雷，全場持續遭受高頻雷暴轟擊，並以二十連跳的毀滅電弧貫穿所有生靈。<br>**hint**：殘卷：當雷神降臨吞下神階的雷光，落下的將不再是凡間之電，而是星辰破碎的雷罰。<br>**chant**：*「蒼穹之上、群星之巔——降下抹殺萬物的白光雷罰！」* |

### 1.5 純土系主幹：6 階演進（#021 ～ #026）

| 編號 | 魔法 ID | 名稱 / 英文名 | 階級 | 學派 (`school`) | 配方 (`inputs`) | 詞綴 (`pre` / `noun`) | 說明 (`desc`)、殘卷 (`hint`) 與 詠唱詞 (`chant`) |
| :--- | :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| **#021** | `rock_spear` | **岩槍**<br>*Rock Spear* | Lv.2 | `evocation` | `el:earth:1` + `el:earth:1` | `岩石` / `岩槍`<br>*Stone* / *Spear* | **desc**：在怪最多的地方突出岩槍，暈眩一下。<br>**hint**：殘卷：兩顆細碎的土粒聚攏，會從地底刺出岩槍。 |
| **#022** | `earthquake` | **地脈震盪**<br>*Telluric Tremor* | Lv.3 | `cataclysm` | `rock_spear` + `el:earth:2` | `地脈` / `震盪`<br>*Telluric* / *Tremor* | **desc**：引動地脈劇烈震盪，使全場魔物暈眩 1.5 秒。<br>**hint**：殘卷：岩槍裡再灌進淬鍊過的土，整條地脈都會跟著劇烈翻騰。 |
| **#023** | `landslide` | **山崩**<br>*Landslide* | Lv.5 | `cataclysm` | `earthquake` + `el:earth:3` | `崩山` / `巨岩`<br>*Crumbling* / *Boulder* | **desc**：五塊巨石從天而降砸進怪群，最大的一塊專挑最硬的敵人。<br>**hint**：殘卷：地脈震盪再吞下高階的土，連群山也會站不住。 |
| **#024**<br>🆕 | `obsidian_thorns` | **黑曜荊棘**<br>*Obsidian Thorns* | Lv.6 | `conjuration` | `landslide` + `earthquake` | `黑曜` / `荊棘`<br>*Obsidian* / *Thorns* | **desc**：地底刺出成片漆黑如鏡的黑曜石荊棘林，使踏入的敵群重創、遲緩並接連暈眩。<br>**hint**：殘卷：山崩落下的巨岩若在地脈震盪中反覆擠壓，會結晶成鋒利無比的黑曜荊棘。 |
| **#025** | `wrath_of_earth` | **大地之怒**<br>*Wrath of the Earth* | Lv.8 | `cataclysm` | `obsidian_thorns` + `el:earth:4` | `震怒` / `岩柱`<br>*Wrathful* / *Pillar* | **desc**：大地翻騰，全場暈眩，三根巨大的岩柱刺穿最密的怪群。<br>**hint**：殘卷：黑曜荊棘再灌進極階的土，沉睡的大地會醒來。<br>**chant**：*「沉眠於地心的古老脈動啊，甦醒並震碎萬物吧！」* |
| **#026**<br>🆕 | `continental_crush` | **大陸崩落**<br>*Continental Crush* | Lv.9 | `cataclysm` | `wrath_of_earth` + `el:earth:5` | `陸沉` / `星隕`<br>*Continental* / *Crush* | **desc**：整塊大陸板塊隆起並傾覆砸落，全場陷入長達 2.5 秒的重度震懾，隨後六座山岳級岩塊接連轟頂。<br>**hint**：殘卷：當大地之怒吞下神階的土，崩塌的不再是一座山，而是整片大陸。<br>**chant**：*「板塊斷裂，山岳倒懸——感受大陸傾覆的重量吧！」* |

### 1.6 純水系主幹：6 階演進（#027 ～ #032）

| 編號 | 魔法 ID | 名稱 / 英文名 | 階級 | 學派 (`school`) | 配方 (`inputs`) | 詞綴 (`pre` / `noun`) | 說明 (`desc`)、殘卷 (`hint`) 與 詠唱詞 (`chant`) |
| :--- | :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| **#027** | `water_wave` | **湧泉之環**<br>*Tidal Ripple* | Lv.2 | `conjuration` | `el:water:1` + `el:water:1` | `湧泉` / `水環`<br>*Surging* / *Ripple* | **desc**：釋放擴散的魔力水環，浸濕敵人並使其步伐遲緩。<br>**hint**：殘卷：兩滴水珠相融，魔力漣漪便會一圈圈向外擴散。 |
| **#028** | `tsunami` | **大海嘯**<br>*Tsunami* | Lv.3 | `cataclysm` | `water_wave` + `el:water:2` | `怒濤` / `海嘯`<br>*Roaring* / *Tsunami* | **desc**：整個戰場的怪都被巨浪沖回邊緣並渾身濕透。<br>**hint**：殘卷：湧泉之環裡再灌進淬鍊過的水，漣漪會漲成吞沒一切的巨浪。 |
| **#029** | `maelstrom` | **大漩渦**<br>*Maelstrom* | Lv.5 | `conjuration` | `tsunami` + `el:water:3` | `漩渦` / `渦流`<br>*Swirling* / *Vortex* | **desc**：漩渦把怪群捲進中心，又濕又慢，越轉越痛。<br>**hint**：殘卷：大海嘯再吞下高階的水，浪會開始打轉。 |
| **#030**<br>🆕 | `abyssal_crush` | **深海重壓**<br>*Abyssal Crush* | Lv.6 | `conjuration` | `maelstrom` + `tsunami` | `深海` / `重壓`<br>*Abyssal* / *Pressure* | **desc**：將萬米深海的水壓降臨於漩渦中心，把怪群死死壓在原地並引爆高壓水柱。<br>**hint**：殘卷：當大海嘯的巨浪灌入大漩渦底部，累積的水壓足以壓碎鋼鐵。 |
| **#031** | `deluge` | **大洪水**<br>*Deluge* | Lv.8 | `cataclysm` | `abyssal_crush` + `el:water:4` | `洪流` / `洪水`<br>*Flooding* / *Deluge* | **desc**：洪水淹沒整個戰場，把怪全沖到邊緣，留下的漩渦繼續捲人。<br>**hint**：殘卷：深海重壓再灌進極階的水，整個世界都會沉進水底。<br>**chant**：*「四海傾覆，堤防盡毀，萬物重歸太古之淵！」* |
| **#032**<br>🆕 | `nether_tides` | **歸墟冥潮**<br>*Nether Tides* | Lv.9 | `cataclysm` | `deluge` + `el:water:5` | `歸墟` / `冥潮`<br>*Nether* / *Tide* | **desc**：召喚世界盡頭的歸墟黑水淹沒全場，雙重巨型冥淵漩渦不斷吞噬敵群並造成刺骨緩速。<br>**hint**：殘卷：大洪水若吞下神階的水，流出的將是萬水終結之地「歸墟」的冥潮。<br>**chant**：*「八紘九野之水，盡歸無底之墟——沉入永劫的深海吧！」* |

---

## 二、【光暗魔導秘典】光系 6 階、暗系 6 階、光暗交匯與禁咒（#101 ～ #115，共 15 招）

遵循與五純屬相同的 **6 階常規演進 ＋ Lv.10 神話禁咒** 邏輯。由於基礎元素表為五屬，光系與暗系分別由「雷／火＋日輝碎片（或高能碰撞）」與「水／土＋深淵珍珠」開啟初階後，即可一路向上合至 Lv.9 大魔導階與 Lv.10 禁咒！

### 2.1 光系主幹（聖輝道途）：6 階演進（#101 ～ #106，搭配 #096 聖光審判）

- **演進路線**：`🆕 聖輝光矢 (Lv.3)` → `🆕 日輪聖環 (Lv.4)` → `🆕 破曉光矛 (Lv.5)` → `🆕 熾天光翼 (Lv.6)` → `🆕 天界光柱 (Lv.8)` → `🆕 創世聖耀 (Lv.9)` → `聖光審判 (Lv.10 禁咒)`

| 編號 | 魔法 ID | 名稱 / 英文名 | 階級 | 學派 (`school`) | 顯隱 | 配方 (`inputs`) | 詞綴 (`pre` / `noun`) | 說明 (`desc`)、殘卷 (`hint`) 與 詠唱詞 (`chant`) |
| :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- | :--- |
| **#101**<br>🆕 | `radiant_arrow` | **聖輝光矢**<br>*Radiant Arrow* | Lv.3 | `evocation` | 隱藏 | `lightning` + `mat:sun_shard` | `聖輝` / `光矢`<br>*Radiant* / *Arrow* | **desc**：凝聚破曉白光射出三支極速光矢，精準貫穿最近的敵人並使其短暫目盲。<br>**hint**：殘卷：當落雷擦過日輝碎片，躁動的電火會褪去雜質，化作純白的光矢。 |
| **#102**<br>🆕 | `solar_halo` | **日輪聖環**<br>*Solar Halo* | Lv.4 | `conjuration` | 隱藏 | `radiant_arrow` + `el:fire:2` | `日輪` / `聖環`<br>*Solar* / *Halo* | **desc**：以施法者為中心展開神聖日輪，將靠近的魔物推開並持續灼燒、致盲。<br>**hint**：殘卷：在聖輝光矢中注入淬鍊的火，白光會展開為不可侵犯的日輪聖環。 |
| **#103**<br>🆕 | `spear_of_dawn` | **破曉光矛**<br>*Spear of Dawn* | Lv.5 | `evocation` | 隱藏 | `solar_halo` + `el:thunder:3` | `破曉` / `光矛`<br>*Dawn* / *Lance* | **desc**：從天際投下貫穿重甲的破曉光矛，重創最強的敵人並引發大範圍聖光爆裂。<br>**hint**：殘卷：日輪聖環再借高階雷光之勢，聖環會收束為刺穿黑夜的破曉長矛。 |
| **#104**<br>🆕 | `seraphic_wings` | **熾天光翼**<br>*Seraphic Wings* | Lv.6 | `enchantment` | 隱藏 | `spear_of_dawn` + `solar_halo` | `熾天` / `光翼`<br>*Seraphic* / *Wings* | **desc**：背後展開六片純白光翼，大幅提升自身詠唱速度，並向四面八方齊射十二道聖光羽刃。<br>**hint**：殘卷：當破曉光矛與日輪聖環共鳴，施法者將披上如熾天使般的純白光翼。 |
| **#105**<br>🆕 | `elysium_pillar` | **天界光柱**<br>*Pillar of Elysium* | Lv.8 | `cataclysm` | 隱藏 | `seraphic_wings` + `el:fire:4` | `天界` / `光柱`<br>*Elysian* / *Pillar* | **desc**：雲端洞開，降下三道粗壯的天界光柱持續洗禮怪群，光柱內魔物目盲且承受巨額聖焰。<br>**hint**：殘卷：熾天光翼再灌入極階的火，天門將為之敞開並降下淨化萬物的光柱。<br>**chant**：*「雲端之門洞開，降下淨化塵世的純白神柱！」* |
| **#106**<br>🆕 | `lux_genesis` | **創世聖耀**<br>*Lux Genesis* | Lv.9 | `cataclysm` | 隱藏 | `elysium_pillar` + `el:thunder:5` | `創世` / `聖耀`<br>*Genesis* / *Radiance* | **desc**：重現太初第一道光芒，全場瞬間被無死角的白光吞沒，所有魔物陷入目盲與麻痺，隨後承受毀滅性的聖光連環轟炸。<br>**hint**：殘卷：當天界光柱吞下神階的雷光，那便是世界誕生之初的第一道聖耀。<br>**chant**：*「太初有道，神說要有光——萬物於純白聖耀中重獲新生！」* |

### 2.2 暗系主幹（深淵道途）：6 階演進（#107 ～ #112，搭配 #097 深淵吞噬）

- **演進路線**：`🆕 暗影魔彈 (Lv.3)` → `🆕 蝕魂黑霧 (Lv.4)` → `🆕 冥淵鎖鏈 (Lv.5)` → `🆕 黑蝕奇點 (Lv.6)` → `🆕 永夜天幕 (Lv.8)` → `🆕 虛無泯滅 (Lv.9)` → `深淵吞噬 (Lv.10 禁咒)`

| 編號 | 魔法 ID | 名稱 / 英文名 | 階級 | 學派 (`school`) | 顯隱 | 配方 (`inputs`) | 詞綴 (`pre` / `noun`) | 說明 (`desc`)、殘卷 (`hint`) 與 詠唱詞 (`chant`) |
| :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- | :--- |
| **#107**<br>🆕 | `shadow_bolt` | **暗影魔彈**<br>*Shadow Bolt* | Lv.3 | `evocation` | 隱藏 | `water_wave` + `mat:abyss_pearl` | `暗影` / `影彈`<br>*Shadow* / *Bolt* | **desc**：射出三發無聲無息的漆黑影彈，穿透並侵蝕目標，使其步伐遲緩。<br>**hint**：殘卷：當湧泉之環觸碰漆黑的深淵珍珠，清澈的水光便會染上無底的暗影。 |
| **#108**<br>🆕 | `soulblight_miasma` | **蝕魂黑霧**<br>*Soulblight Miasma* | Lv.4 | `conjuration` | 隱藏 | `shadow_bolt` + `el:earth:2` | `蝕魂` / `黑霧`<br>*Soulblight* / *Miasma* | **desc**：在戰場中央釋放不祥的蝕魂黑霧，持續侵蝕霧中所有魔物的生命並使其目盲遲緩。<br>**hint**：殘卷：暗影魔彈混入沉重的土氣，黑影便會化作貼地蔓延的蝕魂瘴霧。 |
| **#109**<br>🆕 | `abyssal_chains` | **冥淵鎖鏈**<br>*Chains of the Abyss* | Lv.5 | `conjuration` | 隱藏 | `soulblight_miasma` + `el:water:3` | `冥淵` / `暗鏈`<br>*Abyssal* / *Chains* | **desc**：從地底暗影中伸出無數黑鐵鎖鏈，在十二隻魔物間跳躍綑綁，將其強行扯向中心並暈眩。<br>**hint**：殘卷：在蝕魂黑霧中注入高階的深水，霧中的暗影會凝結為拖人入淵的鎖鏈。 |
| **#110**<br>🆕 | `eclipse_singularity` | **黑蝕奇點**<br>*Eclipse Singularity* | Lv.6 | `conjuration` | 隱藏 | `abyssal_chains` + `soulblight_miasma` | `黑蝕` / `奇點`<br>*Eclipse* / *Singularity* | **desc**：壓縮暗影形成一顆微型黑洞奇點，以恐怖引力將四周魔物盡數吸聚並持續絞碎。<br>**hint**：殘卷：當冥淵鎖鏈將蝕魂黑霧死死纏繞收縮，中心便會坍縮成吞噬光線的黑蝕奇點。 |
| **#111**<br>🆕 | `eternal_nightfall` | **永夜天幕**<br>*Curtain of Eternal Night* | Lv.8 | `cataclysm` | 隱藏 | `eclipse_singularity` + `el:earth:4` | `永夜` / `天幕`<br>*Nightfall* / *Curtain* | **desc**：降下遮蔽一切光明的永夜天幕，全場魔物陷入絕對黑暗（目盲與重度緩速），無數暗影隕石自夜空中無聲砸落。<br>**hint**：殘卷：黑蝕奇點再吞下極階的厚土，連白晝的天空都會被拉入永恆的黑夜。<br>**chant**：*「白晝終結，群星熄滅——萬物皆披上永夜的喪服！」* |
| **#112**<br>🆕 | `void_annihilation` | **虛無泯滅**<br>*Void Annihilation* | Lv.9 | `cataclysm` | 隱藏 | `eternal_nightfall` + `el:water:5` | `虛無` / `泯滅`<br>*Void* / *Annihilation* | **desc**：抹除空間與存在的終極暗魔導術，全場被黑紫色的虛無裂隙覆蓋，將所有魔物拖入次元彼端瞬間瓦解。<br>**hint**：殘卷：當永夜天幕吞下神階的冥水，剩下的便只有連時間都不存在的「虛無」。<br>**chant**：*「光影俱滅，萬有歸無——於次元盡頭的虛無中徹底抹消！」* |

### 2.3 光暗交匯（黃昏與太初混沌）：3 階秘傳與至高禁咒（#113 ～ #115）

| 編號 | 魔法 ID | 名稱 / 英文名 | 階級 | 學派 (`school`) | 顯隱 | 配方 (`inputs`) | 詞綴 (`pre` / `noun`) | 說明 (`desc`)、殘卷 (`hint`) 與 詠唱詞 (`chant`) |
| :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- | :--- |
| **#113**<br>🆕 | `twilight_scales` | **光暗天秤**<br>*Scales of Twilight* | Lv.7 | `enchantment` | 隱藏 | `spear_of_dawn` + `abyssal_chains` | `黃昏` / `天秤`<br>*Twilight* / *Scales* | **desc**：白晝與黑夜在戰場上交替傾斜，先以暗影鎖鏈將全場敵群聚攏致盲，再降下破曉聖光一舉貫穿。<br>**hint**：殘卷：當破曉的光矛與冥淵的鎖鏈在合成台上相遇，光與暗將短暫達成微妙的平衡。<br>**chant**：*「白晝與黑夜同在，於黃昏的夾縫中衡量生與死！」* |
| **#114**<br>🆕 | `chaos_eclipse` | **混沌蝕日**<br>*Chaos Eclipse* | Lv.9 | `cataclysm` | 隱藏 | `elysium_pillar` + `eternal_nightfall` | `蝕日` / `混沌`<br>*Eclipse* / *Chaos* | **desc**：高懸於頂的黑太陽吞噬天界聖光，全場在極致引力坍縮與聖光新星爆發之間連續震盪。<br>**hint**：殘卷：若讓永夜天幕遮蔽天界光柱，天空中將升起一輪既黑且白、吞吐萬物的蝕日。<br>**chant**：*「黑影吞噬烈日，白光撕裂永夜——降臨吧，萬象崩壞的混沌蝕日！」* |
| **#115**<br>🆕 | `primordial_chaos` | **太初混沌**<br>*Primordial Chaos* | Lv.10<br>*(稀有)* | `forbidden` | 隱藏 | `lux_genesis` + `void_annihilation`<br>*(機率 1 : 24)* | `太初` / `混沌`<br>*Primordial* / *Chaos* | **desc**：將「創世聖耀」與「虛無泯滅」強行歸一的至高禁忌術式，重現光暗尚未分離前的太初混沌，全場萬物在黑白交錯的法則風暴中灰飛煙滅。<br>**hint**：殘卷：傳說當創世的聖耀與泯滅的虛無正面相撞，魔導書將揭開光與暗誕生之前的第零頁。<br>**chant**：*「光生於闇，闇歸於光；善惡未分，天地未判——重歸太初之混沌！」* |

---

## 三、第二批：十組雙屬性常規支線 × 3 階（#033 ～ #062，共 30 招）

五種元素兩兩配對共 `C(5,2) = 10` 組，每組皆具備 **「初階融合 (Lv.4/5) → 宗師進階 (Lv.6/7) → 大魔導極致 (Lv.8)」** 完整三階段！
（其中 6 組相生＋2 組奇異共 24 招為主幹常駐顯示；2 組相剋逆流共 6 招為隱藏夾頁節點。）

### 3.1 火＋風（炎嵐系：火焰龍捲 → 紅蓮旋風 → 焚風天災）
| 編號 | 魔法 ID | 名稱 / 英文名 | 階級 | 學派 | 配方 (`inputs`) | 詞綴 (`pre` / `noun`) | 說明 (`desc`)、殘卷 (`hint`) 與 詠唱詞 (`chant`) |
| :--- | :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| **#033** | `fire_tornado` | **火焰龍捲**<br>*Fire Tornado* | Lv.5 | `conjuration` | `fireball` + `wind_blade` | `烈焰` / `龍捲`<br>*Blazing* / *Cyclone* | **desc**：風把怪吸到中心，火在中心燒。怪越多，傷害越高。<br>**hint**：殘卷：烈焰與旋風交織，火焰會隨風捲起，吞沒四周。 |
| **#034**<br>🆕 | `crimson_whirlwind` | **紅蓮旋風**<br>*Crimson Whirlwind* | Lv.6 | `conjuration` | `fire_tornado` + `el:wind:3` | `紅蓮` / `旋嵐`<br>*Crimson* / *Whirlwind* | **desc**：雙重火焰龍捲在場上高速巡弋，強風將四周魔物捲入火海並向內甩出灼熱風刃。<br>**hint**：殘卷：在火焰龍捲中灌入高階的風，單一火柱會分裂為巡弋戰場的雙子紅蓮旋風。 |
| **#035**<br>🆕 | `sirocco_calamity` | **焚風天災**<br>*Sirocco Calamity* | Lv.8 | `cataclysm` | `crimson_whirlwind` + `el:fire:4` | `焚風` / `天災`<br>*Sirocco* / *Calamity* | **desc**：灼熱焚風席捲全場，所有魔物瞬間起火並被強行扯入中央巨型炎嵐核心連環引爆。<br>**hint**：殘卷：紅蓮旋風再吞下極階的火，吹拂而過的焚風足以令整片森林在瞬間自燃。<br>**chant**：*「熱風掠地，草木成灰——化作席捲大地的赤紅焚風！」* |

### 3.2 雷＋水（感電系：感電之海 → 電離狂潮 → 深海狂雷）
| 編號 | 魔法 ID | 名稱 / 英文名 | 階級 | 學派 | 配方 (`inputs`) | 詞綴 (`pre` / `noun`) | 說明 (`desc`)、殘卷 (`hint`) 與 詠唱詞 (`chant`) |
| :--- | :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| **#036** | `shock_sea` | **感電之海**<br>*Shocking Sea* | Lv.5 | `cataclysm` | `lightning` + `water_wave` | `感電` / `雷海`<br>*Electric* / *Sea* | **desc**：先把整個戰場淹濕，再讓雷劈向每一隻濕掉的怪。<br>**hint**：殘卷：先讓潮水漫過戰場，再引雷光落下——濕透的敵人逃不過。 |
| **#037**<br>🆕 | `ionized_surge` | **電離狂潮**<br>*Ionized Surge* | Lv.6 | `conjuration` | `shock_sea` + `el:water:3` | `電離` / `狂潮`<br>*Ionized* / *Surge* | **desc**：戰場化為高導電性的電離水域，水環反覆將魔物推回並觸發十二連跳的水中電弧。<br>**hint**：殘卷：感電之海再融入高階的水，每一滴海水都會成為傳導雷霆的媒介。 |
| **#038**<br>🆕 | `leviathan_tempest` | **深海狂雷**<br>*Leviathan's Tempest* | Lv.8 | `cataclysm` | `ionized_surge` + `el:thunder:4` | `海神` / `狂雷`<br>*Leviathan* / *Tempest* | **desc**：深海巨浪與蒼穹雷暴同時炸裂，全場魔物浸泡於深海電網中承受高頻麻痺與雙倍雷擊。<br>**hint**：殘卷：在電離狂潮中注入極階的雷，深海將如遠古海獸甦醒般翻湧出萬道狂雷。<br>**chant**：*「深海沸騰，萬雷貫淵——甦醒吧，統御怒海的雷霆巨獸！」* |

### 3.3 風＋雷（雷暴系：雷暴雲 → 蒼穹電網 → 九霄神雷嵐）
| 編號 | 魔法 ID | 名稱 / 英文名 | 階級 | 學派 | 配方 (`inputs`) | 詞綴 (`pre` / `noun`) | 說明 (`desc`)、殘卷 (`hint`) 與 詠唱詞 (`chant`) |
| :--- | :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| **#039** | `thunder_cloud` | **雷暴雲**<br>*Thunderhead* | Lv.5 | `cataclysm` | `wind_blade` + `lightning` | `暴風` / `雷雲`<br>*Tempest* / *Thunderhead* | **desc**：一朵雷雲在戰場上空飄，不停往下劈。<br>**hint**：殘卷：風把雷光托上天空，雲裡便藏著數不清的落雷。 |
| **#040**<br>🆕 | `sky_arc_net` | **蒼穹電網**<br>*Celestial Arc Net* | Lv.6 | `evocation` | `thunder_cloud` + `el:thunder:3` | `電網` / `雷簾`<br>*Arcing* / *Curtain* | **desc**：疾風牽引雷光在空中交織為巨型電網，同時賦予自身加速並對全場降下密集連鎖閃電。<br>**hint**：殘卷：雷暴雲再吞下高階的雷，雲間的電弧會連成一張覆蓋天空的巨網。 |
| **#041**<br>🆕 | `empyrean_squall` | **九霄神雷嵐**<br>*Empyrean Squall* | Lv.8 | `cataclysm` | `sky_arc_net` + `el:wind:4` | `九霄` / `雷嵐`<br>*Empyrean* / *Squall* | **desc**：九霄高空的極速罡風裹挾神雷傾瀉而下，八道帶電風刃與漫天雷雨無間斷洗禮戰場。<br>**hint**：殘卷：當極階的風吹動蒼穹電網，九霄之上的神雷將化作無堅不摧的暴風雨。<br>**chant**：*「罡風為弓，紫電為矢——自九霄雲外降下雷霆暴風！」* |

### 3.4 火＋土（熔岩系：隕石 → 流星雨 → 地心火山爆發）
| 編號 | 魔法 ID | 名稱 / 英文名 | 階級 | 學派 | 配方 (`inputs`) | 詞綴 (`pre` / `noun`) | 說明 (`desc`)、殘卷 (`hint`) 與 詠唱詞 (`chant`) |
| :--- | :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| **#042** | `meteor` | **隕石**<br>*Meteor* | Lv.5 | `cataclysm` | `rock_spear` + `fireball` | `熔岩` / `隕石`<br>*Molten* / *Meteor* | **desc**：隕石砸向怪最多的地方，留下一灘熔岩。<br>**hint**：殘卷：點燃一塊岩石，再讓它從天而降。 |
| **#043** | `meteor_shower` | **流星雨**<br>*Meteor Shower* | Lv.6 | `cataclysm` | `meteor` + `el:fire:2` | `流星` / `星雨`<br>*Falling* / *Starfall* | **desc**：不只一顆。九顆燃燒的星隕接連砸落戰場並留下熔岩火海。<br>**hint**：殘卷：一顆隕石還不夠？那就再添一把火。<br>**chant**：*「星軌崩落，赤紅之雨傾盆而降。」* |
| **#044**<br>🆕 | `caldera_cataclysm` | **地心火山爆發**<br>*Caldera Cataclysm* | Lv.8 | `cataclysm` | `meteor_shower` + `el:earth:4` | `地心` / `火山`<br>*Caldera* / *Eruption* | **desc**：戰場中央隆起巨型火山口並猛烈噴發，全場震暈後噴出漫天熔岩巨石與滾燙岩漿海。<br>**hint**：殘卷：當流星雨砸入極階的厚土，地心的岩漿將衝破地殼、化作毀滅性的火山爆發。<br>**chant**：*「地殼裂解，紅蓮噴湧——傾瀉地心深處累積萬年的怒火！」* |

### 3.5 風＋水（冰霜系：冰風暴 → 極寒冰矛 → 永凍冰棺）
| 編號 | 魔法 ID | 名稱 / 英文名 | 階級 | 學派 | 配方 (`inputs`) | 詞綴 (`pre` / `noun`) | 說明 (`desc`)、殘卷 (`hint`) 與 詠唱詞 (`chant`) |
| :--- | :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| **#045** | `ice_storm` | **冰風暴**<br>*Ice Storm* | Lv.5 | `conjuration` | `water_wave` + `wind_blade` | `冰霜` / `冰暴`<br>*Frost* / *Blizzard* | **desc**：把周圍的怪全部凍住；凍住的怪受到的傷害變成 1.5 倍。<br>**hint**：殘卷：寒風吹過水面，水會在敵人身上結成冰。 |
| **#046**<br>🆕 | `glacial_lance` | **極寒冰矛**<br>*Glacial Lance* | Lv.6 | `evocation` | `ice_storm` + `el:water:3` | `極寒` / `冰矛`<br>*Glacial* / *Lance* | **desc**：先以寒霜波紋凍結近身敵群，隨後射出五柄巨型極寒冰矛狙擊最強目標，對冰凍敵人造成毀滅性貫穿。<br>**hint**：殘卷：在冰風暴中注入高階的水，漫天飛雪會凝結為專門刺穿凍軀的極寒冰矛。 |
| **#047**<br>🆕 | `permafrost_coffin` | **永凍冰棺**<br>*Permafrost Coffin* | Lv.8 | `conjuration` | `glacial_lance` + `el:wind:4` | `永凍` / `冰棺`<br>*Permafrost* / *Coffin* | **desc**：極地寒風將整片戰場封入巨大冰棺，全場魔物長時間凍結並承受十二道冰晶風刃的連環切割。<br>**hint**：殘卷：當極寒冰矛遇上極階的凜風，連空氣都會凝結成埋葬萬物的永凍冰棺。<br>**chant**：*「凜風呼嘯，萬里冰封——於晶瑩的永凍之棺中長眠吧！」* |

### 3.6 火＋雷（雷炎系：雷炎鎖鏈 → 爆雷火網 → 煌雷業火陣）
| 編號 | 魔法 ID | 名稱 / 英文名 | 階級 | 學派 | 配方 (`inputs`) | 詞綴 (`pre` / `noun`) | 說明 (`desc`)、殘卷 (`hint`) 與 詠唱詞 (`chant`) |
| :--- | :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| **#048** | `flame_chain` | **雷炎鎖鏈**<br>*Blazing Chain* | Lv.5 | `evocation` | `fireball` + `lightning` | `雷炎` / `鎖鏈`<br>*Searing* / *Chain* | **desc**：跳躍的閃電在每一跳都炸開，點燃周圍的怪。<br>**hint**：殘卷：讓雷光帶著火種跳躍，每一跳都會炸出火花。 |
| **#049**<br>🆕 | `plasma_burst_net` | **爆雷火網**<br>*Plasma Burst Net* | Lv.6 | `evocation` | `flame_chain` + `el:fire:3` | `爆雷` / `火網`<br>*Plasma* / *Net* | **desc**：十二連跳的高溫電漿火網在怪群間急速彈射，每次跳躍皆引發大範圍烈焰爆破與麻痺。<br>**hint**：殘卷：雷炎鎖鏈再吞下高階的火，閃電與烈焰會融合成無堅不摧的高溫電漿火網。 |
| **#050**<br>🆕 | `crimson_thunder_formation` | **煌雷業火陣**<br>*Crimson Thunder Array* | Lv.8 | `cataclysm` | `plasma_burst_net` + `el:thunder:4` | `煌雷` / `火陣`<br>*Fulminating* / *Array* | **desc**：地面展開覆蓋全場的赤金雷火大陣，落雷與火柱交錯轟鳴，在敵群間引發十六連跳的毀滅連鎖爆破。<br>**hint**：殘卷：將極階的雷灌入爆雷火網，雷與火將在地上刻出焚盡萬軍的煌雷業火陣。<br>**chant**：*「赤炎為經，紫電為緯——展開裁決大地之煌雷業火陣！」* |

### 3.7 土＋水（泥潭系・奇異 `odd`：腐殖泥潭 → 沉淪沼澤 → 冥河濁流）
| 編號 | 魔法 ID | 名稱 / 英文名 | 階級 | 學派 | 配方 (`inputs`) | 詞綴 (`pre` / `noun`) | 說明 (`desc`)、殘卷 (`hint`) 與 詠唱詞 (`chant`) |
| :--- | :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| **#051** | `mire` | **腐殖泥潭**<br>*Abyssal Quagmire* | Lv.4 | `conjuration` | `rock_spear` + `water_wave` | `腐殖` / `泥潭`<br>*Mire* / *Quagmire* | **desc**：幾乎沒有傷害，但能化出深邃泥潭，讓整片怪都卡在裡面動彈不得。<br>**hint**：殘卷：厚土與流水攪合在一起，任何踏入的生靈都會深陷泥潭。 |
| **#052**<br>🆕 | `sinking_fen` | **沉淪沼澤**<br>*Sinking Fen* | Lv.6 | `conjuration` | `mire` + `el:earth:3` | `沉淪` / `魔沼`<br>*Sinking* / *Fen* | **desc**：泥潭擴大為吞噬戰場的沉淪沼澤，將大範圍魔物緩慢拖向中心，使其重度遲緩、濕透並隨泥漿擠壓持續扣血。<br>**hint**：殘卷：腐殖泥潭再摻入高階的土，泥漿會變得如流沙般沉重，將獵物一點點往下拖。 |
| **#053**<br>🆕 | `stygian_mire` | **冥河濁流**<br>*Stygian Mire* | Lv.8 | `conjuration` | `sinking_fen` + `el:water:4` | `冥河` / `濁流`<br>*Stygian* / *Sludge* | **desc**：引出地底冥河的重水濁流覆蓋全場，所有魔物步履維艱，隨後在濁流深處引爆三波沉重地脈衝擊。<br>**hint**：殘卷：當沉淪沼澤吞下極階的水，泥沼底層將湧出連靈魂都能拖住的冥河濁流。<br>**chant**：*「重水無波，厚土無門——沉入萬劫不復的冥河濁流吧！」* |

### 3.8 風＋土（沙暴系・奇異 `odd`：黃昏沙暴 → 蝕骨風沙 → 荒漠葬神暴）
| 編號 | 魔法 ID | 名稱 / 英文名 | 階級 | 學派 | 配方 (`inputs`) | 詞綴 (`pre` / `noun`) | 說明 (`desc`)、殘卷 (`hint`) 與 詠唱詞 (`chant`) |
| :--- | :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| **#054** | `sandstorm` | **黃昏沙暴**<br>*Dusk Haboob* | Lv.4 | `cataclysm` | `rock_spear` + `wind_blade` | `黃昏` / `沙暴`<br>*Dusk* / *Sandstorm* | **desc**：捲起遮天蔽日的黃昏沙暴，讓怪全都看不見、到處亂走。<br>**hint**：殘卷：讓狂風捲起碎裂的砂土，敵人就再也看不清方向。 |
| **#055**<br>🆕 | `bone_flaying_grit` | **蝕骨風沙**<br>*Bone-Flaying Grit* | Lv.6 | `conjuration` | `sandstorm` + `el:wind:3` | `蝕骨` / `風沙`<br>*Flaying* / *Grit* | **desc**：高速旋轉的石英風沙不僅令全場魔物目盲，更化作密集的細碎沙刃持續刮削敵群血肉。<br>**hint**：殘卷：黃昏沙暴裡再灌入高階的風，每一粒細沙都會變成削鐵如泥的刀片。 |
| **#056**<br>🆕 | `desert_burial_tempest` | **荒漠葬神暴**<br>*Desert Burial Tempest* | Lv.8 | `cataclysm` | `bone_flaying_grit` + `el:earth:4` | `荒漠` / `沙葬`<br>*Burial* / *Sandstorm* | **desc**：整片天空化為黃沙巨浪，全場魔物陷入目盲與暈眩，並被漫天落下的砂岩巨柱活埋碾碎。<br>**hint**：殘卷：當蝕骨風沙吞下極階的土，狂沙將堆疊成埋葬神明與古國的荒漠風暴。<br>**chant**：*「千古王朝盡歸黃土——於遮天蔽日的荒漠沙暴中化為塵埃！」* |

### 3.9 火＋水（沸霧系・相剋 `bad` → 逆轉昇華，隱藏夾頁）
| 編號 | 魔法 ID | 名稱 / 英文名 | 階級 | 學派 | 配方 (`inputs`) | 詞綴 (`pre` / `noun`) | 說明 (`desc`)、殘卷 (`hint`) 與 詠唱詞 (`chant`) |
| :--- | :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| **#057** | `steam` | **沸霧逆流**<br>*Scalding Backdraft* | Lv.4 | `enchantment` | `fireball` + `water_wave` | `沸霧` / `逆流`<br>*Scalding* / *Vapor* | **desc**：噗嘶……烈火被水澆熄了。逆流的沸霧遮住視線、拖慢施法，還讓裡面的怪回血。<br>**hint**：殘卷：水火不容。硬要放在一起，只會激起一陣逆流的白霧。 |
| **#058**<br>🆕 | `high_pressure_geyser` | **高壓蒸氣爆**<br>*High-Pressure Geyser* | Lv.6 | `cataclysm` | `steam` + `el:fire:3` | `高壓` / `蒸爆`<br>*Pressurized* / *Geyser* | **desc**：將失敗的沸霧強行封入高溫火殼中壓縮引爆！全場魔物被滾燙高壓蒸氣震退、燙傷並浸濕。<br>**hint**：殘卷：誰說水火只能相消？若用高階的火將沸霧死死封住，蒸氣便會化作炸裂鍋爐的巨響。 |
| **#059**<br>🆕 | `whiteout_superheat` | **白熱溟霧**<br>*Superheated Whiteout* | Lv.8 | `cataclysm` | `high_pressure_geyser` + `el:water:4` | `白熱` / `溟霧`<br>*Superheated* / *Mist* | **desc**：水與火在極限高壓下達成超臨界共鳴，白熱化的毀滅濃霧瞬間融化全場敵群甲冑並造成巨額持續灼傷。<br>**hint**：殘卷：當高壓蒸氣爆再吞下極階的水，水與火的界線徹底消失，化為連岩石都能氣化的白熱溟霧。<br>**chant**：*「水火同爐，陰陽逆轉——化作融解萬物的超臨界白霧！」* |

### 3.10 雷＋土（噬雷系・相剋 `bad` → 逆轉昇華，隱藏夾頁）
| 編號 | 魔法 ID | 名稱 / 英文名 | 階級 | 學派 | 配方 (`inputs`) | 詞綴 (`pre` / `noun`) | 說明 (`desc`)、殘卷 (`hint`) 與 詠唱詞 (`chant`) |
| :--- | :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| **#060** | `grounding` | **地脈噬雷**<br>*Telluric Short* | Lv.4 | `enchantment` | `rock_spear` + `lightning` | `噬雷` / `磁岩`<br>*Shorted* / *Lodestone* | **desc**：雷電多半被地脈吞噬並反噬自身……但偶爾地底磁岩會被磁化炸開。<br>**hint**：殘卷：雷落進土裡便無聲無息——但十次裡總有三次會引爆地底磁脈。 |
| **#061**<br>🆕 | `railgun_shrapnel` | **電磁碎岩砲**<br>*Lorentz Shrapnel* | Lv.6 | `evocation` | `grounding` + `el:thunder:3` | `電磁` / `磁砲`<br>*Lorentz* / *Railgun* | **desc**：克服接地反噬，利用強大洛倫茲磁力將二十枚磁化岩塊以超音速射向全場，造成高頻貫穿與暈眩。<br>**hint**：殘卷：地脈噬雷吞下的電荷若再用高階雷光強行推動，地底磁岩便會如砲彈般激射而出。 |
| **#062**<br>🆕 | `tectonic_emp` | **地磁極光脈衝**<br>*Geomagnetic Pulse* | Lv.8 | `cataclysm` | `railgun_shrapnel` + `el:earth:4` | `地磁` / `極光`<br>*Geomagnetic* / *Aurora* | **desc**：引動星球級地磁場暴走，全場迸發絢麗的地磁極光，所有魔物瞬間麻痺暈眩並承受巨額磁暴轟擊。<br>**hint**：殘卷：當電磁碎岩砲與極階的大地相連，整顆星球的地磁核心都會為之共鳴震顫。<br>**chant**：*「地軸偏轉，磁極倒懸——釋放撕裂大地的極光脈衝！」* |

---

## 四、第三批：十組三屬性秘傳術式 × 2 階（#063 ～ #082，共 20 招，隱藏夾頁）

五種元素任取三種共 `C(5,3) = 10` 組，每組皆有 **「宗師階 (Lv.7) → 大魔導階 (Lv.8/9)」** 兩階段，全數具備專屬古語詠唱詞（`chant`）！

| 組別 | 編號 | 魔法 ID | 名稱 / 英文名 | 階級 | 學派 | 配方 (`inputs`) | 詞綴 (`pre`/`noun`) | 說明 (`desc`)、殘卷 (`hint`) 與 詠唱詞 (`chant`) |
| :--- | :--- | :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| **1. 火+風+雷** | **#063** | `thunder_fire_hurricane` | **雷火狂嵐**<br>*Thunderfire Maelstrom* | Lv.7 | `conjuration` | `fire_tornado` + `el:thunder:2` | `雷火` / `狂嵐` | **desc**：火焰龍捲裡交織著狂雷，被吸進去的怪會被連續劈中。<br>**hint**：殘卷：龍捲之中若有雷光，被捲進去的敵人便無處可逃。<br>**chant**：*「烈焰為軸，狂雷為刃，席捲荒原之嵐！」* |
| **1. 火+風+雷** | **#064** | `skyburner` | **焚天**<br>*Skyburner* | Lv.9 | `cataclysm` | `thunder_fire_hurricane` + `el:fire:4` | `焚天` / `天火` | **desc**：雷火狂嵐燒到天上去了：巨大的火焰龍捲裡雷光亂竄，閃電帶著火跳向四周。<br>**hint**：殘卷：雷火狂嵐若吞下極階的火，連天空都會燒起來。<br>**chant**：*「風助火勢，雷引天威——將整片蒼穹盡數點燃！」* |
| **2. 風+雷+水** | **#065** | `thunder_tsunami` | **狂雷怒濤**<br>*Voltaic Surge* | Lv.7 | `cataclysm` | `shock_sea` + `el:wind:2` | `狂雷` / `怒濤` | **desc**：裹挾著狂雷的滅世怒濤，把全場淹濕、沖走、再劈一輪。<br>**hint**：殘卷：讓風推著帶電的怒海往前衝，就是一場夾帶狂雷的怒濤。<br>**chant**：*「帶電的怒海啊，隨風奔湧、吞沒萬軍！」* |
| **2. 風+雷+水** | **#066**<br>🆕 | `maelstrom_strom` | **滄溟雷暴眼**<br>*Eye of the Maelstrom* | Lv.9 | `cataclysm` | `thunder_tsunami` + `el:thunder:4` | `溟雷` / `暴眼` | **desc**：怒海與狂風在戰場中央形成巨型暴風眼，全場魔物被潮水扯入雷池，承受百道水雷連環轟頂。<br>**hint**：殘卷：狂雷怒濤再灌入極階的雷，海嘯中心將睜開吞噬艦隊的雷暴之眼。<br>**chant**：*「怒濤倒捲，紫電垂天——於風暴之眼中化為齏粉！」* |
| **3. 風+土+水** | **#067** | `frozen_earth` | **冰封大地**<br>*Frozen Earth* | Lv.7 | `cataclysm` | `ice_storm` + `rock_spear` | `冰封` / `凍土` | **desc**：凍住全場，然後地面裂開，把冰塊連同怪一起震碎。<br>**hint**：殘卷：冰風暴凍住的東西，最怕大地一震。<br>**chant**：*「霜風凝土，萬物皆歸於永凍之寂。」* |
| **3. 風+土+水** | **#068** | `quicksand` | **噬骨流沙**<br>*Devouring Sands* | Lv.8 | `conjuration` | `mire` + `sandstorm` | `噬骨` / `流沙` | **desc**：戰場中央塌陷為噬骨流沙，看不見的怪一隻隻被吸進去慢慢磨碎。<br>**hint**：殘卷：腐殖泥潭遇上黃昏沙暴，腳下的大地就再也站不穩。<br>**chant**：*「沉淪之沙，張開無底的荒漠咽喉。」* |
| **4. 火+雷+水** | **#069** | `rain_cloud` | **劫雷積雲**<br>*Tempest Canopy* | Lv.7 | `cataclysm` | `steam` + `el:thunder:2` | `劫雷` / `積雲` | **desc**：失敗的沸霧加上雷，竟然化作籠罩天際、既下豪雨又落狂雷的劫雲。<br>**hint**：殘卷：別急著把失敗的沸霧扔掉，往裡面丟一點雷試試。<br>**chant**：*「逆流之霧升騰，化作帶電的冥暗天幕。」* |
| **4. 火+雷+水** | **#070**<br>🆕 | `plasma_deluge` | **熾電沸海**<br>*Plasma Deluge* | Lv.9 | `cataclysm` | `rain_cloud` + `el:fire:4` | `熾電` / `沸海` | **desc**：劫雲降下滾燙的帶電豪雨，整片戰場化為沸騰的雷火之海，同時賦予燃燒、感電與全場連環雷爆。<br>**hint**：殘卷：劫雷積雲若吞下極階的火，降下的雨水將化為點燃大海的滾燙電漿。<br>**chant**：*「雲煮雷池，雨落成火——將四海化為沸騰的雷霆煉獄！」* |
| **5. 風+雷+土** | **#071** | `magnet_storm` | **磁暴**<br>*Magnetic Storm* | Lv.7 | `conjuration` | `grounding` + `el:wind:2` | `磁暴` / `磁渦` | **desc**：被磁化的岩石被風捲起，把怪全吸過來，再一塊塊炸開。<br>**hint**：殘卷：地脈噬雷吞掉的雷並沒有消失，只是在等一陣風。<br>**chant**：*「地底沉睡的磁脈啊，隨狂風一齊暴走吧。」* |
| **5. 風+雷+土** | **#072**<br>🆕 | `sky_fortress_fall` | **浮空隕雷城**<br>*Sky-Citadel Drop* | Lv.9 | `cataclysm` | `magnet_storm` + `el:earth:4` | `浮空` / `雷城` | **desc**：磁暴與罡風將整座巨岩山脈托上高空，纏繞萬道雷光後重重砸落地面，引發毀天滅地的震波與雷網。<br>**hint**：殘卷：當磁暴吞下極階的厚土，連整座山岳都能被磁力托起、化作從天而降的雷霆要塞。<br>**chant**：*「磁力逆轉，群山升空——連同萬道天雷一齊墜落吧！」* |
| **6. 火+風+土** | **#073**<br>🆕 | `ash_cyclone` | **灰燼風暴**<br>*Pyroclastic Cyclone* | Lv.7 | `conjuration` | `meteor` + `wind_blade` | `灰燼` / `火嵐` | **desc**：狂風捲起滾燙的火山灰與碎石，全場魔物目盲、灼燒並被不斷吸向熔岩核心。<br>**hint**：殘卷：當疾風吹過墜落的隕石，滾燙的火山灰便會席捲整片戰場。<br>**chant**：*「黑煙蔽日，熱灰封喉——吞沒生靈的火山灰暴！」* |
| **6. 火+風+土** | **#074**<br>🆕 | `scorched_starfall` | **焚星大隕落**<br>*Scorched Starfall* | Lv.9 | `cataclysm` | `ash_cyclone` + `el:fire:4` | `焚星` / `星隕` | **desc**：天際颶風加速引落十二顆巨型火流星，撞擊瞬間掀起橫掃全場的赤熱沙暴與熔岩火海。<br>**hint**：殘卷：灰燼風暴再灌入極階的火，連天上的星辰都會被風火扯落地面。<br>**chant**：*「罡風引星，赤火鍛石——降下焚盡大地的群星隕落！」* |
| **7. 火+風+水** | **#075**<br>🆕 | `mirage_gale` | **海市蜃樓嵐**<br>*Mirage Gale* | Lv.7 | `enchantment` | `ice_storm` + `fireball` | `蜃樓` / `幻嵐` | **desc**：冰與火在疾風中交錯折射，化出令全場魔物目盲迷失的海市蜃樓，同時大幅加速自身詠唱並射出冷熱雙刃。<br>**hint**：殘卷：在冰風暴中投入一團火球，冷熱交界的光線會扭曲成迷亂雙眼的海市蜃樓。<br>**chant**：*「寒暑交錯，光影折曲——迷失於虛實難辨的蜃樓之風！」* |
| **7. 火+風+水** | **#076**<br>🆕 | `frostfire_tempest` | **霜炎雙極嵐**<br>*Frostfire Tempest* | Lv.9 | `cataclysm` | `mirage_gale` + `el:wind:4` | `霜炎` / `雙極` | **desc**：極寒冰暴與紅蓮烈焰在颶風中同時運轉，全場魔物在「凍結易傷」與「烈焰爆破」的冰火兩重天中瞬間崩潰。<br>**hint**：殘卷：海市蜃樓嵐再灌入極階的風，水火將在風暴中化為共存的霜炎雙極。<br>**chant**：*「左握極寒之霜，右掌焚世之炎——隨狂風一齊撕裂萬象！」* |
| **8. 火+雷+土** | **#077**<br>🆕 | `fulgurite_eruption` | **雷火熔岩柱**<br>*Fulgurite Eruption* | Lv.7 | `evocation` | `meteor` + `lightning` | `雷熔` / `火柱` | **desc**：落雷劈中地底熔岩，在最強敵人與最密怪群腳下連環炸出帶電的熔岩火柱，兼具麻痺、暈眩與燃燒。<br>**hint**：殘卷：當落雷劈進滾燙的隕石坑，地底岩漿會帶著電流衝天而起。<br>**chant**：*「天雷勾動地火，熔岩化作雷柱衝霄！」* |
| **8. 火+雷+土** | **#078**<br>🆕 | `earth_core_detonation` | **地核雷炎爆**<br>*Core Detonation* | Lv.9 | `cataclysm` | `fulgurite_eruption` + `el:earth:4` | `地核` / `核爆` | **desc**：將高壓雷火直接貫入地核引爆，全場大地碎裂震暈，隨後迸發毀滅性的赤金雷漿衝擊波。<br>**hint**：殘卷：雷火熔岩柱再吞下極階的土，雷火將直達地心、引爆整顆大地的心臟。<br>**chant**：*「貫穿岩層，引燃地核——於大地深處綻放毀滅之光！」* |
| **9. 火+土+水** | **#079**<br>🆕 | `boiling_mud_geyser` | **沸騰泥火山**<br>*Boiling Mud Volcano* | Lv.7 | `conjuration` | `mire` + `fireball` | `沸泥` / `火山` | **desc**：地底烈火將腐殖泥潭煮沸，化作不斷噴發滾燙泥漿的泥火山，使大範圍敵群重度遲緩並持續承受高溫灼傷。<br>**hint**：殘卷：往腐殖泥潭底下塞進一團火球，冰冷的爛泥就會開始沸騰冒泡。<br>**chant**：*「地火煎熬，濁泥沸騰——化作吞沒萬物的滾燙泥沼！」* |
| **9. 火+土+水** | **#080**<br>🆕 | `primordial_magma_sea` | **太古海底火山**<br>*Submarine Volcanism* | Lv.8 | `cataclysm` | `boiling_mud_geyser` + `el:water:4` | `海火` / `冥淵` | **desc**：重現太古深海地殼裂縫，巨浪淹沒全場的同時海底火山猛烈噴發，水壓與熔岩雙重碾壓所有敵人。<br>**hint**：殘卷：沸騰泥火山再灌入極階的深水，便會化為深海之底永不熄滅的海底火山。<br>**chant**：*「深海之下，地火不熄——見證太古大洋沸騰的奇景！」* |
| **10. 雷+土+水** | **#081**<br>🆕 | `lodestone_whirlpool` | **磁淵大渦流**<br>*Lodestone Whirlpool* | Lv.7 | `conjuration` | `shock_sea` + `rock_spear` | `磁淵` / `渦流` | **desc**：海底矗立起帶電的磁岩尖柱，形成強力磁場漩渦將全場濕透的魔物吸聚並連環電擊暈眩。<br>**hint**：殘卷：在感電之海中刺出岩槍，岩石會被雷海磁化為吸引萬物的海底磁柱。<br>**chant**：*「礁石帶電，深淵成渦——萬物皆被扯入雷鳴的海底！」* |
| **10. 雷+土+水** | **#082**<br>🆕 | `trench_thunder_collapse` | **海溝雷鳴崩**<br>*Trench Fulmination* | Lv.8 | `cataclysm` | `lodestone_whirlpool` + `el:thunder:4` | `海溝` / `雷崩` | **desc**：海底大地裂開萬米海溝，狂暴雷海連同崩塌的岩壁同時向內合攏，將敵群徹底壓碎電焦。<br>**hint**：殘卷：磁淵大渦流再吞下極階的雷，海底將裂開吞沒一切的雷鳴海溝。<br>**chant**：*「海床斷裂，萬雷灌淵——於深海海溝的崩塌中化為微塵！」* |

---

## 五、第四批：魔物素材共鳴與五行萬象秘術（#083 ～ #090，共 8 招，隱藏夾頁）

為 `materials.json` 中原本沒有專屬名魔法配方的 **6 種魔物素材** 各設計 1 招專屬秘術（`#083 ～ #088`），外加 **2 招四屬／五屬萬象大魔導術（`#089 ～ #090`）**：

| 編號 | 魔法 ID | 名稱 / 英文名 | 階級 | 學派 | 配方 (`inputs`) | 詞綴 (`pre` / `noun`) | 說明 (`desc`)、殘卷 (`hint`) 與 詠唱詞 (`chant`) |
| :--- | :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| **#083**<br>🆕 | `phoenix_ash_flare` | **不死鳥餘燼**<br>*Phoenix Ember Flare* | Lv.4 | `evocation` | `fireball` + `mat:ember_core` | `鳳凰` / `餘燼`<br>*Phoenix* / *Ember* | **desc**：摻入餘燼核心的赤金火彈，命中後會分裂出二次爆破火環，使整片怪群染上久久不滅的鳳凰火。<br>**hint**：殘卷：將還在發熱的餘燼核心推進火球裡，火焰會長出如不死鳥般的雙重羽翼。 |
| **#084**<br>🆕 | `fairy_mist_veil` | **妖精霧露陣**<br>*Sylphid Mist Veil* | Lv.4 | `conjuration` | `water_wave` + `mat:mist_dew` | `妖精` / `迷霧`<br>*Sylphid* / *Mist* | **desc**：以清晨霧露構築的夢幻水霧結界，使踏入的魔物渾身濕透、目盲且大幅減速。<br>**hint**：殘卷：把草尖上的霧露滴進湧泉之環，水波會化為連視線都能遮蔽的妖精迷霧。 |
| **#085**<br>🆕 | `garuda_thunder_wing` | **迦樓羅雷翼**<br>*Garuda's Thunderwing* | Lv.6 | `enchantment` | `wind_blade` + `mat:roc_feather` | `神鳥` / `雷翼`<br>*Garuda* / *Thunderwing* | **desc**：借雷鳥羽毛之力展開風雷雙翼，自身施法加速，每次揮動皆甩出帶電風刃與跳躍電弧。<br>**hint**：殘卷：將帶著靜電的雷鳥羽毛編入疾風刃，風刃便會化作神鳥振翅時的萬道雷弧。 |
| **#086**<br>🆕 | `petrifying_thunderstone` | **雷化石柱陣**<br>*Fulgurite Monoliths* | Lv.6 | `conjuration` | `rock_spear` + `mat:fulgurite` | `雷石` / `石柱`<br>*Fulgurite* / *Monolith* | **desc**：在敵群最密集處降下五根雷擊石巨柱，落地瞬間引發範圍震暈並向外釋放感電衝擊。<br>**hint**：殘卷：將被雷劈過的雷擊石嵌進岩槍，刺出的岩柱便自帶震懾心魄的雷威。 |
| **#087**<br>🆕 | `dragon_magma_breath` | **炎龍熔岩息**<br>*Drake's Magma Breath* | Lv.7 | `cataclysm` | `flame_burst` + `mat:lava_stone` | `炎龍` / `龍息`<br>*Draconic* / *Breath* | **desc**：喚醒熔岩石中的古龍火種，向前方扇形傾瀉滾燙熔岩吐息並砸落三顆火山彈。<br>**hint**：殘卷：把流著岩漿的熔岩石餵給烈焰爆發，火焰中會傳來火山飛龍的低沉咆哮。<br>**chant**：*「古龍之顎洞開，傾瀉焚山煮海的熔岩吐息！」* |
| **#088**<br>🆕 | `leviathan_scale_maelstrom` | **海神逆鱗潮**<br>*Scale of the Leviathan* | Lv.7 | `cataclysm` | `tsunami` + `mat:tide_scale` | `逆鱗` / `神潮`<br>*Scale* / *Tide* | **desc**：潮汐鱗片引動遠古海神之怒，連續兩波巨型環狀海嘯將全場敵群反覆推向邊緣並捲入深淵。<br>**hint**：殘卷：將永遠濕潤的潮汐鱗片投入大海嘯，海浪將帶著海神的意志連番拍擊。<br>**chant**：*「觸犯滄海之逆鱗者，盡數埋葬於萬重怒濤之下！」* |
| **#089**<br>🆕 | `four_symbols_seal` | **四象鎮界印**<br>*Seal of Four Symbols* | Lv.9 | `conjuration` | `caldera_cataclysm` + `permafrost_coffin` | `四象` / `鎮界`<br>*Fourfold* / *Seal* | **desc**：匯聚地水火風四方極致之力化為鎮界大印，全場魔物同時遭受凍結、燃燒、震暈與引力封鎖。<br>**hint**：殘卷：當地心火山爆發遇上永凍冰棺，地水火風四方之力將在合成台上結成鎮壓天地的古印。<br>**chant**：*「地水火風，四象歸位——結成鎮壓萬魔之不破神印！」* |
| **#090**<br>🆕 | `pentagram_almagest` | **五芒星大魔導陣**<br>*Pentagram Almagest* | Lv.9 | `cataclysm` | `four_symbols_seal` + `thunder_god` | `五芒` / `天書`<br>*Pentagram* / *Almagest* | **desc**：點亮魔導書中心的五芒星終極陣圖，火、風、雷、土、水五道光柱同時轟擊全場並引發五元素連鎖共鳴。<br>**hint**：殘卷：在四象鎮界印中補上最後一道雷神天罰，魔導書的五芒星大陣便會真正甦醒。<br>**chant**：*「火風雷土水，五芒連星——展開魔導書最高奧義之天體大陣！」* |

---

## 六、第五批：Lv.10 神話禁咒全集（#091 ～ #100，外加 #115，共 11 招稀有禁咒）

| 編號 | 魔法 ID | 名稱 / 英文名 | 屬性道途 | 機率配方 (`inputs` & 權重) | 詞綴 (`pre` / `noun`) | 專屬古語詠唱詞 (`chant`) |
| :--- | :--- | :--- | :---: | :--- | :--- | :--- |
| **#091** | `worldfire` | **焚世之焰**<br>*Worldfire* | 純火 | `inferno` + `el:fire:3` *(1:49)* | `焚世` / `劫火` | *「太初之火，終末之燼——連同天空與法則一併焚盡！」* |
| **#092** | `heavens_breath` | **蒼穹之息**<br>*Heaven's Breath* | 純風 | `vacuum_blades` + `el:wind:3` *(1:49)* | `蒼穹` / `天息` | *「傾聽吧，那是世界誕生之初、來自天外蒼穹的吐息。」* |
| **#093** | `ninefold_thunder` | **九天雷獄**<br>*Ninefold Thunder* | 純雷 | `myriad_thunder` + `el:thunder:3` *(1:49)* | `九天` / `雷獄` | *「九重天門盡開，降下永夜不息的雷霆煉獄！」* |
| **#094** | `titans_grip` | **泰坦之握**<br>*Titan's Grip* | 純土 | `landslide` + `el:earth:3` *(1:49)* | `泰坦` / `巨掌` | *「群山不過指尖微塵——遠古泰坦，於此握碎大地！」* |
| **#095** | `moontide` | **滄溟月潮**<br>*Moontide* | 純水 | `maelstrom` + `el:water:3` *(1:49)* | `滄溟` / `月潮` | *「銀月低垂，滄溟倒懸，萬古潮汐盡歸吾掌！」* |
| **#096** | `holy_judgment` | **聖光審判**<br>*Holy Judgment* | 光系 | `thunder_hammer` + `mat:sun_shard` *(1:9)* | `聖光` / `審判` | *「日輝破曉，神雷裁決——凡有罪者，盡皆化為白光！」* |
| **#097** | `abyss_devour` | **深淵吞噬**<br>*Abyssal Devour* | 暗系 | `tsunami` + `mat:abyss_pearl` *(1:9)* | `深淵` / `吞噬` | *「深海之底、永暗之門洞開——將一切拖入無歸之淵！」* |
| **#098**<br>🆕 | `ragnarok_twilight` | **諸神黃昏**<br>*Twilight of Ragnarok* | 火+土 | `meteor_shower` + `mat:lava_stone` *(1:19)* | `黃昏` / `終焉` | *「星辰墜盡，大地崩裂——迎來諸神與萬物的終焉黃昏！」* |
| **#099**<br>🆕 | `eternal_zero` | **永劫零度**<br>*Eternal Absolute Zero* | 風+水 | `ice_storm` + `mat:tide_scale` *(1:19)* | `永劫` / `零度` | *「熱量消亡，時光凝結——於永劫不化的白銀冰獄中沉眠吧！」* |
| **#100**<br>🆕 | `akashic_nova` | **創世星雲・阿卡夏**<br>*Akashic Nova* | 五行全屬 | `skyburner` + `frozen_earth` *(1:24)* | `創世` / `星雲` | *「地水火風雷，五方本源歸一——重演太初創世之光，阿卡夏星雲！」* |
| **#115**<br>🆕 | `primordial_chaos` | **太初混沌**<br>*Primordial Chaos* | 光+暗 | `lux_genesis` + `void_annihilation` *(1:24)* | `太初` / `混沌` | *「光生於闇，闇歸於光；善惡未分，天地未判——重歸太初之混沌！」* |
