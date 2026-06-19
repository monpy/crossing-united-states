# アメリカ横断の旅 🚗🇺🇸

男2〜3人で**14日間・節約しながら**アメリカを西→東へ車で横断する旅程を、
地図つき＋Wiki形式でまとめた GitHub Pages サイトです。
Leaflet + OpenStreetMap を使った純粋な HTML / CSS / JS（ビルド不要）。

## ページ構成

| URL | 内容 |
|-----|------|
| `index.html` | 🗺️ **地図トップ** — ルートのピン・線・旅程リスト |
| `spots.html` | 📍 **スポット集** — 観光候補120件を自然/音楽/芸術/文化で色分け・絞り込み |
| `states.html` | 🇺🇸 **州別ガイド** — 全50州＋D.C.を安全度の目安とスポットつきで紹介 |
| `events.html` | 🎪 **9〜10月の催し** — 音楽フェス・祭り・収穫祭・紅葉を約70件、日付順＋地図で |
| `foods.html` | 🍴 **ご当地グルメ** — 各州の名物＋定番を約120品、カテゴリ色分け地図＋地域別リストで |
| `wiki.html` | 📚 **Wiki** — トピックごとのページ（サイドバーで切替） |

ヘッダーの「🗺️ 地図 / 📍 スポット集 / 🇺🇸 州別 / 🎪 催し / 🍴 グルメ / 📚 Wiki」で行き来できます。

`spots.html` のデータは `data/spots.json` で管理（カテゴリ・座標・説明を編集するだけ）。
ルートに採用したいスポットを `data/itinerary.json` に転記すれば地図トップに反映されます。
**みんなが行きたいスポット**は `data/must.json` に `spots.json` と同じ `name`（必要なら
`state`）と行きたい人の名前 `by` を書くだけ。`spots.html` でピンに★、一覧に「★行きたい：
○○」が付き、「★行きたいリストだけ」で絞り込めます（各自が編集して push）。
`states.html` は `data/states.json`（安全度・概要）を管理し、各州のスポットは
`data/spots.json` から州コードで自動的に紐付きます。安全度は統計上の大まかな傾向で、
観光地そのものの危険度ではない旨をページ冒頭に明記しています。

## ディレクトリ

```
.
├── index.html            # 地図トップ
├── wiki.html             # Wikiシェル（サイドバー＋md表示）
├── css/style.css         # 全ページ共通スタイル
├── js/
│   ├── app.js            # 地図とリストの描画
│   └── wiki.js           # Wikiのルーティング＆md描画
├── data/itinerary.json   # ★地図・旅程リストのデータ
├── content/              # ★Wiki各ページの markdown
│   ├── wiki.json         #   ページ一覧（サイドバーの順序）
│   ├── 00-overview.md
│   ├── 01-car.md
│   ├── 02-route.md       #   14日間の毎日のルート
│   ├── 03-events.md
│   ├── 04-costs.md
│   ├── 05-checklist.md
│   └── 06-driving.md
├── itinerary/            # 各都市の詳細メモ（地図のピンから開く）
│   ├── san-francisco.md
│   └── new-york.md ...
├── images/               # 写真（任意）
└── .nojekyll             # GitHub Pages 用
```

## メンテナンス方法（編集はファイルを触るだけ）

### Wikiのページを編集・追加する
1. `content/` の `.md` を編集すれば、その Wiki ページに即反映。
2. **ページを追加**する場合：
   - `content/07-xxx.md` を作成
   - `content/wiki.json` の `pages` に1行追加：
     ```json
     { "slug": "xxx", "title": "🆕 新ページ", "file": "content/07-xxx.md" }
     ```
   - サイドバーに自動で出ます。URLは `wiki.html#/xxx`。
3. ページ間リンクは markdown 内で `[費用](#/costs)` のように書きます。

### 地図・旅程を編集する
`data/itinerary.json` の `stops` 配列を編集するだけで、地図のピン・ルート線・
リストがすべて自動更新されます。

| キー | 説明 | 例 |
|------|------|-----|
| `day` / `date` | 旅程の日／日付 | `1` / `"2026-09-13"` |
| `city` / `cityEn` | 都市名（日本語／英語） | `"サンフランシスコ"` / `"San Francisco, CA"` |
| `lat` / `lng` | 緯度・経度 | `37.7749` / `-122.4194` |
| `nights` | 宿泊数 | `1` |
| `transportToNext` | 次への移動 | `"車 約4h"` / `null` |
| `summary` | 一言説明 | `"出発地点。"` |
| `md` | 詳細メモ名（`itinerary/<md>.md`）。任意 | `"san-francisco"` |

緯度・経度は [OpenStreetMap](https://www.openstreetmap.org) で地点を右クリック →
「ここの地点を表示」で取得できます。

### 都市の詳細メモを追加する
`itinerary/<名前>.md` を作り、stop に `"md": "<名前>"` を設定。
地図のピン or リストをクリックすると詳細パネルで表示されます。
（未作成の都市は「まだありません」と表示されるだけで、エラーにはなりません）

## ローカルで確認する

`fetch` を使うため、ファイル直接ではなく簡易サーバー経由で開いてください。

```bash
cd crossing-united-states
python3 -m http.server 8000
# http://localhost:8000        → 地図
# http://localhost:8000/wiki.html → Wiki
```

## GitHub Pages で公開する

1. GitHub に push
2. **Settings → Pages**
3. **Source** を `Deploy from a branch`、Branch を `main` / `(root)`
4. 数分後 `https://<ユーザー名>.github.io/crossing-united-states/` で公開
