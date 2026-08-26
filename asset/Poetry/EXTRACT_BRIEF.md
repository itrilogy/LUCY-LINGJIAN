# 金句提取任务说明书（交给诗词全集项目的模型）

你在**中华诗词全集**项目里工作。VoiceStream 播放页需要「诗题 + 一两句金句」，按当前混音/场景的声音与意境命中后展示（繁体，可竖排或横排）。

**本目录是唯一对照。禁止自造标签 id。**

不要在本任务里实现播放 UI。只做：从诗词全集抽出金句，打上本表中的标签，写出符合 schema 的 JSON。

---

## 1. 必读文件（本目录）

| 文件 | 用途 |
|---|---|
| `EXTRACT_BRIEF.md` | 本说明书（工作方案） |
| `label_schema.json` | 标签全集：定义、embed_text、cues/anti_cues、正反例、席位 must/should/avoid |
| `对照.json` | 同上信息的压缩版，按 facet / 席位切开，便于程序读 |
| `对照-席位.md` | 27 个播放席位对照表 |
| `对照-标签.md` | 66 个标签词典 |
| `output.schema.json` | 产出 JSON 的机器校验 |
| `quotes.seed.json` | 已标注的 42 条样例，格式与口径以此为准 |
| `tags.json` | 播放侧展开规则（VoiceStream 声音标签 → 本体系）。提取阶段可不改 |

`tags.jsonl` 为一行一条标签，可供向量库导入。

---

## 2. 目标

从诗词全集中抽出适合「听环境声时默读」的金句，每条：

- **诗题或词牌**（繁体）
- **1–2 句**正文（繁体；不要全诗）
- **作者、朝代、诗体**（有则填）
- **tags**：只用 `label_schema.json` → `tags[].id`
- **layout**：`vertical` 或 `horizontal`

每条金句必须能对上至少一个 `play_seats[].id`（见第 5 节）。对不上任何席位的句子不要入库。

---

## 3. 抽哪些句（准入）

收录：

- 五七言整句、对仗句；或小令/散曲里可独立成境的 1–2 句
- 读起来能配「雨声、夜、海、火、溪、舟、旅、市声、空寂」等**可听可感**的境，而不是纯议论、纯咏史、纯姓名堆砌
- 一句已完足也可（`lines` 长度 1）

不收：

- 超过 2 句才懂的叙事段落
- 必须靠全诗典故才能成立的句子
- 政治、征伐、颂圣为主（可用 `needs_context` 思路直接丢弃，不要打标凑数）
- 以泪拟雨、以兵拟雷等**纯比喻**且句中无真风雨（见各 sound 标签的 `anti_cues`）
- 原文残缺、异文无法选定

文本规范：

- 金句与题名一律**繁体**
- 不添加标点也可以；若原集有标点，句末可保留
- 不改字；异文选通行本，在 `notes` 写一句即可

---

## 4. 怎么打标签（对号入座）

只许使用 `label_schema.json` 的 `tags[].id`。新语义先停，不要发明 id。

每条金句的 tags 组成：

| 面 facet | 数量 | 说明 |
|---|---|---|
| sound | **1 个主声境**，可再加 0–1 个配声 | 决定坐进哪类播放。声境必须硬，不要用意境代替 |
| mood | **1**，可选第 2 | 静、孤、闲、羁旅等 |
| time | 0–1 | 晓/昼/暮/夜/子夜 |
| season | 0–1 | 无物候则空 |
| weather | 0–2 | 有雨雾风雪才标 |
| place | 0–2 | 窗、舟、林、屋… |
| image | 0–3 | 句中真有月/灯/舟才标，禁止联想 |
| layout | 恰好一个：`layout-vertical` **或** `layout-horizontal` | 五七言对仗→竖；词曲口语短顿→横 |

操作顺序（语义分析）：

1. 把「题 + 1–2 句」做成查询文本（繁体）。
2. 与每个标签的 `embed_text` + `definition` 做相似度。
3. **每个 facet 内只取最高分且过阈值**；sound 阈值高于 mood。
4. 查询文本命中该标签 `cues` → 加分；命中 `anti_cues` → **禁止**该标签。
5. 用第 5 节席位规则检查能否入座；不能入座则换句或丢弃，不要硬贴 sound。

---

## 5. 席位对照（必须能坐下）

席位完整表见 `对照-席位.md` / `对照.json` 的 `play_seats`。

判定：`set(quote.tags) ∩ must_any ≠ ∅` 且 `set(quote.tags) ∩ avoid = ∅`。`should` 只用于同席位内排序，不是门槛。

常用席位（与 VoiceStream 播放一一对应）：

| 席位 | 播放 | 必有其一 |
|---|---|---|
| `rain` | 雨类随机 | `rain` |
| `rainonroof` | 屋顶雨 | `rainonroof` 或 `rain` |
| `quietnight` | 独立场景「静夜」 | `quietnight` / `sleep` / `room` |
| `night` | 夜晚类（不含静夜文件） | `night` 或 `night-time` |
| `fire` | 篝火 | `fire` / `lamp` / `warmth` |
| `ocean` | 海浪 | `ocean` / `sea` / `wave` |
| `stream` | 溪泉 | `stream` 或 `river` |
| `steam` | 蒸汽 | `steam` / `mist` / `warmth` |
| `thunder` | 雷雨 | `thunder` 或 `storm` |
| `babble` | 市声 | `babble` / `inn` / `city` / `wine` |
| `noise` `white` `pink` `brown` | 白噪 | `noise` / `zen` / `still` |
| `boat` `train` `airplane` `bus` `traffic` | 出行 | 见对照表 must_any |
| `mix-rain-fire` 等 | 混音 | 见对照表 |

一条金句可以对应多个席位。不要为了填满 27 席而把句子标成四不像。

---

## 6. 产出格式

每个批次写一个 JSON，数组名为 `quotes`，字段以 `output.schema.json` 为准。最小例子：

```json
{
  "version": 1,
  "script": "zh-Hant",
  "quotes": [
    {
      "id": "li-bai-jing-ye-si",
      "source_ref": "全集内的稳定定位，如 book/卷/篇 id",
      "title": "靜夜思",
      "author": "李白",
      "dynasty": "唐",
      "form": "五言絕句",
      "lines": ["牀前明月光", "疑是地上霜"],
      "tags": ["quietnight", "night-time", "moon", "room", "solitude", "still", "layout-vertical"],
      "layout": "vertical",
      "weight": 1,
      "seats": ["quietnight", "night"],
      "notes": ""
    }
  ]
}
```

说明：

- `id`：建议 `作者拼音-诗题拼音`，小写 ASCII，稳定可重跑
- `source_ref`：指向诗词全集中的篇目，必须能回溯
- `lines`：长度 1 或 2
- `tags` 含 layout 标签 id；同时保留 `layout` 字段（vertical/horizontal）与 seed 一致，方便播放页
- `seats`：按第 5 节算出的席位列表，便于抽检
- `weight`：默认真 1；名句可 1.2，生僻可 0.8

对照样例：`quotes.seed.json`（seed 里部分条目尚未写 `seats`/`source_ref`；新产出必须带这两项）。

---

## 7. 分批与覆盖

按席位分批抽，每批先保证该席 `must_any` 能坐下：

1. rain, rainonroof, mix-rain-night, mix-quiet-rain  
2. quietnight, night, mix-stream-night  
3. fire, mix-rain-fire, mix-ocean-fire  
4. ocean, stream, steam, mix-ocean-rain, mix-stream-rain  
5. thunder, mix-airplane-thunder  
6. boat, train, airplane, bus, traffic  
7. babble, noise/white/pink/brown  

每席建议至少 30 条可播金句后再扩面。重复句（同 lines）去重，保留信息更全的一条。

---

## 8. 自检清单（交卷前）

- [ ] 所有 `tags` 都在 `label_schema.json` 的 `tags[].id` 里  
- [ ] 恰好 1 个主 sound；恰好 1 个 layout-*  
- [ ] `lines.length` 为 1 或 2；文本为繁体  
- [ ] `seats` 非空，且与 must_any/avoid 规则一致  
- [ ] 有 `source_ref`  
- [ ] 无 `anti_cues` 误伤（例如「泪如雨」未标 `rain`）

---

## 9. 不要做的事

- 不要改 VoiceStream 播放代码  
- 不要把全诗塞进 `lines`  
- 不要用简体当展示正文  
- 不要发明 `tag_rain2` 这类新 id  
- 不要为凑席位把咏史、说理句标成雨或海
