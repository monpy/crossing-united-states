// 観光スポット集 — data/spots.json をカテゴリ別に色分けして地図＋リスト表示。
// カテゴリのフィルタ(チェックボックス)で絞り込み可能。

(async function () {
  let data;
  try {
    data = await (await fetch("data/spots.json")).json();
  } catch (e) {
    document.getElementById("spots-list").innerHTML =
      "<p>データの読み込みに失敗しました。簡易サーバー経由で開いてください。</p>";
    console.error(e);
    return;
  }

  const cats = data.categories;
  const spots = data.spots || [];
  if (data.note) {
    document.getElementById("spots-note").textContent = data.note;
  }

  // 表示中のカテゴリ（初期は全部ON）
  const active = new Set(Object.keys(cats));

  // ---- ルート候補の選択（localStorage に保存して再訪問でも保持）----
  const LS_KEY = "selectedSpots";
  const spotKey = (s) => `${s.name}__${s.state || ""}`;
  let selected = new Set();
  try {
    selected = new Set(JSON.parse(localStorage.getItem(LS_KEY) || "[]"));
  } catch (e) {
    /* 壊れていたら空のまま */
  }
  function saveSelection() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify([...selected]));
    } catch (e) {
      /* プライベートモード等では保存できなくても続行 */
    }
  }

  // ---- みんなが行きたいリスト（data/must.json・手編集の共有リスト）----
  // spotKey(name__state) → { by:[名前...], note }
  const mustMap = new Map();
  try {
    const md = await (await fetch("data/must.json")).json();
    (md.must || []).forEach((m) => {
      mustMap.set(`${m.name}__${m.state || ""}`, {
        by: m.by || [],
        note: m.note || "",
      });
    });
  } catch (e) {
    /* must.json が無くても通常表示で動く */
  }
  const mustOf = (s) => mustMap.get(spotKey(s));
  let mustOnly = false;

  // ---- AIに聞く（ChatGPT / Claude） ----
  // スポット名を入れた質問文を作り、?q= で自動入力された状態で開く。
  function askPrompt(s) {
    return `アメリカ横断ドライブ旅行で「${s.name}」(${s.nameEn || ""}, ${s.state || ""}, アメリカ) を訪れる予定です。見どころ、平均的な滞在時間、ベストな訪問時間帯や季節、入場料・予約の要否、近くのおすすめ、注意点を簡潔に教えてください。`;
  }
  function askUrls(s) {
    const q = encodeURIComponent(askPrompt(s));
    return {
      chatgpt: `https://chatgpt.com/?q=${q}`,
      claude: `https://claude.ai/new?q=${q}`,
    };
  }
  // 一覧の行に差し込むHTML（リンクは新規タブで開く）
  function askLinksHtml(s) {
    const u = askUrls(s);
    return `<div class="ask-row">
      <a class="ask-btn ask-gpt" href="${u.chatgpt}" target="_blank" rel="noopener">🤖 ChatGPTに聞く</a>
      <a class="ask-btn ask-claude" href="${u.claude}" target="_blank" rel="noopener">✳️ Claudeに聞く</a>
    </div>`;
  }

  // ---- 地図 ----
  const map = L.map("map", { scrollWheelZoom: true });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);
  map.setView([39.5, -98.35], 4); // アメリカ全体

  function dot(color, isSel, isMust) {
    return L.divIcon({
      className: "",
      html: `<div class="spot-dot${isSel ? " selected" : ""}${isMust ? " must" : ""}" style="background:${color}">${
        isMust ? '<span class="must-star">★</span>' : ""
      }</div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
  }
  // みんなが行きたい情報をHTMLにする（ポップアップ/一覧で共用）
  function mustBadgeHtml(s) {
    const mi = mustOf(s);
    if (!mi) return "";
    const who = (mi.by || []).join("・");
    const note = mi.note ? `<span class="must-note">「${mi.note}」</span>` : "";
    return `<div class="must-tag">★ 行きたい${who ? `：${who}（${mi.by.length}）` : ""}${note}</div>`;
  }

  // ---- ホバー画像（Wikipedia のサムネイルを必要になった時だけ取得）----
  // s._thumb: undefined=未取得 / string=画像URL / null=画像なし
  function loadThumb(s) {
    if (s._thumb !== undefined) return Promise.resolve(s._thumb);
    if (s._thumbP) return s._thumbP;
    const q = s.nameEn || s.name;
    const api =
      "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*" +
      "&prop=pageimages&piprop=thumbnail&pithumbsize=320&redirects=1" +
      "&generator=search&gsrlimit=1&gsrsearch=" +
      encodeURIComponent(q);
    s._thumbP = fetch(api)
      .then((r) => r.json())
      .then((d) => {
        const pages = d && d.query && d.query.pages;
        const first = pages ? Object.values(pages)[0] : null;
        s._thumb = (first && first.thumbnail && first.thumbnail.source) || null;
        return s._thumb;
      })
      .catch(() => {
        s._thumb = null;
        return null;
      });
    return s._thumbP;
  }

  // tooltip の中身（読み込み中 / 画像 / 画像なし の3状態）
  function thumbHtml(s, state) {
    let media;
    if (state === "loading")
      media = `<div class="thumb-ph">画像を読み込み中…</div>`;
    else if (state) media = `<img src="${state}" alt="${s.name}" loading="lazy" />`;
    else media = `<div class="thumb-ph">画像が見つかりませんでした</div>`;
    return `<div class="thumb-name">${s.name}</div>${media}`;
  }

  // スポットごとにマーカーを作成
  const markers = spots.map((s) => {
    const color = (cats[s.cat] || {}).color || "#666";
    const isSel = selected.has(spotKey(s));
    const isMust = !!mustOf(s);
    const m = L.marker([s.lat, s.lng], {
      icon: dot(color, isSel, isMust),
      zIndexOffset: isSel ? 1000 : isMust ? 500 : 0,
    });
    m.bindPopup(
      `<strong>${s.name}</strong><br><small>${s.nameEn || ""}（${s.state || ""}）</small>${mustBadgeHtml(s)}<br>${s.desc || ""}${askLinksHtml(s)}`
    );
    // ホバーで画像つきツールチップ。初回ホバー時に画像を取りにいく。
    m.bindTooltip(thumbHtml(s, "loading"), {
      direction: "top",
      offset: [0, -10],
      opacity: 1,
      className: "spot-thumb-tip",
    });
    m.on("mouseover", () => {
      if (s._thumb !== undefined) {
        m.setTooltipContent(thumbHtml(s, s._thumb));
      } else {
        loadThumb(s).then((url) => m.setTooltipContent(thumbHtml(s, url)));
      }
    });
    s._marker = m;
    return m;
  });

  // 選択状態に合わせてマーカーの見た目を更新（地図上/外を問わず動く）
  function updateMarker(s) {
    const color = (cats[s.cat] || {}).color || "#666";
    const isSel = selected.has(spotKey(s));
    const isMust = !!mustOf(s);
    s._marker.setIcon(dot(color, isSel, isMust));
    s._marker.setZIndexOffset(isSel ? 1000 : isMust ? 500 : 0);
  }

  // チェックON/OFF → 選択集合・保存・マーカー・カウンタを更新
  function toggleSelect(s, on) {
    if (on) selected.add(spotKey(s));
    else selected.delete(spotKey(s));
    saveSelection();
    updateMarker(s);
    updateSelBar();
  }

  // ---- カテゴリ・フィルタ ----
  const filtersEl = document.getElementById("spots-filters");
  Object.entries(cats).forEach(([key, c]) => {
    const count = spots.filter((s) => s.cat === key).length;
    const label = document.createElement("label");
    label.className = "filter-chip";
    label.style.setProperty("--chip", c.color);
    label.innerHTML = `
      <input type="checkbox" value="${key}" checked />
      <span class="chip-dot" style="background:${c.color}"></span>
      ${c.label} <span class="chip-count">${count}</span>`;
    label.querySelector("input").addEventListener("change", (e) => {
      if (e.target.checked) active.add(key);
      else active.delete(key);
      refresh();
    });
    filtersEl.appendChild(label);
  });

  // ---- 旅程ルート表示トグル（既定OFF）----
  const route = await window.RouteOverlay.create(map);
  if (route.count) {
    const routeLabel = document.createElement("label");
    routeLabel.className = "filter-chip route-chip";
    routeLabel.innerHTML = `<input type="checkbox" id="show-route" checked /> 🛣️ ルートを表示`;
    routeLabel.querySelector("input").addEventListener("change", (e) => {
      route.set(e.target.checked);
    });
    filtersEl.appendChild(routeLabel);
    route.set(true); // 既定でON
  }

  // ---- 「みんな行きたい」だけ表示トグル（must.json があれば）----
  if (mustMap.size) {
    const mustLabel = document.createElement("label");
    mustLabel.className = "filter-chip must-chip";
    mustLabel.innerHTML = `<input type="checkbox" id="must-only" /> ★ 行きたいリストだけ <span class="chip-count">${mustMap.size}</span>`;
    mustLabel.querySelector("input").addEventListener("change", (e) => {
      mustOnly = e.target.checked;
      refresh();
    });
    filtersEl.appendChild(mustLabel);
  }

  // ---- ルート候補カウンタ（フィルタ列の下段）----
  const selBar = document.createElement("div");
  selBar.className = "sel-bar";
  filtersEl.appendChild(selBar);
  function updateSelBar() {
    const n = selected.size;
    selBar.innerHTML = n
      ? `🧭 ルート候補 <strong>${n}</strong>件 <button type="button" class="sel-clear">クリア</button>`
      : `🧭 一覧の☑でルートに含めたいスポットを選択`;
    const btn = selBar.querySelector(".sel-clear");
    if (btn)
      btn.addEventListener("click", () => {
        const cleared = spots.filter((s) => selected.has(spotKey(s)));
        selected.clear();
        saveSelection();
        cleared.forEach(updateMarker);
        updateSelBar();
        refresh();
      });
  }

  // ---- リスト＋地図の更新 ----
  const listEl = document.getElementById("spots-list");
  const countEl = document.getElementById("spots-count");

  // 表示対象か（カテゴリON ＆ 「行きたいだけ」モードなら must のみ）
  function visible(s) {
    if (!active.has(s.cat)) return false;
    if (mustOnly && !mustOf(s)) return false;
    return true;
  }

  function refresh() {
    // マーカーの表示/非表示
    spots.forEach((s) => {
      const shown = visible(s);
      if (shown && !map.hasLayer(s._marker)) s._marker.addTo(map);
      if (!shown && map.hasLayer(s._marker)) map.removeLayer(s._marker);
    });

    // リスト（カテゴリ別にグループ）
    listEl.innerHTML = "";
    let total = 0;
    Object.entries(cats).forEach(([key, c]) => {
      if (!active.has(key)) return;
      const items = spots.filter((s) => s.cat === key && visible(s));
      if (!items.length) return;
      total += items.length;

      const group = document.createElement("div");
      group.className = "spot-group";
      group.innerHTML = `<h3 class="spot-group-title" style="color:${c.color}">${c.label}（${items.length}）</h3>`;

      items.forEach((s) => {
        const isSel = selected.has(spotKey(s));
        const isMust = !!mustOf(s);
        const row = document.createElement("div");
        row.className =
          "spot-row" + (isSel ? " selected" : "") + (isMust ? " is-must" : "");
        row.innerHTML = `
          <input type="checkbox" class="spot-check" ${isSel ? "checked" : ""} aria-label="ルート候補に追加" title="ルートに含めたいスポットとして選択" />
          <span class="spot-bullet" style="background:${c.color}"></span>
          <div>
            <div class="spot-name">${s.name} <span class="spot-state">${s.state || ""}</span></div>
            <div class="spot-en">${s.nameEn || ""}</div>
            ${mustBadgeHtml(s)}
            <div class="spot-desc">${s.desc || ""}</div>
            ${askLinksHtml(s)}
          </div>`;
        row.addEventListener("click", () => {
          map.setView([s.lat, s.lng], 8, { animate: true });
          s._marker.openPopup();
        });
        // AIボタンのクリックでは地図フォーカスを発火させない
        row.querySelectorAll(".ask-btn").forEach((b) =>
          b.addEventListener("click", (e) => e.stopPropagation())
        );
        // チェックボックス：行クリック(地図フォーカス)とは独立に選択を切り替え
        const cb = row.querySelector(".spot-check");
        cb.addEventListener("click", (e) => e.stopPropagation());
        cb.addEventListener("change", (e) => {
          toggleSelect(s, e.target.checked);
          row.classList.toggle("selected", e.target.checked);
        });
        group.appendChild(row);
      });
      listEl.appendChild(group);
    });

    countEl.textContent = `スポット一覧（${total}件）`;
  }

  updateSelBar();
  refresh();
})();
