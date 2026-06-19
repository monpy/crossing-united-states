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

  function dot(color, isSel) {
    return L.divIcon({
      className: "",
      html: `<div class="spot-dot${isSel ? " selected" : ""}" style="background:${color}"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
  }

  // スポットごとにマーカーを作成
  const markers = spots.map((s) => {
    const color = (cats[s.cat] || {}).color || "#666";
    const isSel = selected.has(spotKey(s));
    const m = L.marker([s.lat, s.lng], {
      icon: dot(color, isSel),
      zIndexOffset: isSel ? 1000 : 0,
    });
    m.bindPopup(
      `<strong>${s.name}</strong><br><small>${s.nameEn || ""}（${s.state || ""}）</small><br>${s.desc || ""}${askLinksHtml(s)}`
    );
    s._marker = m;
    return m;
  });

  // 選択状態に合わせてマーカーの見た目を更新（地図上/外を問わず動く）
  function updateMarker(s) {
    const color = (cats[s.cat] || {}).color || "#666";
    const isSel = selected.has(spotKey(s));
    s._marker.setIcon(dot(color, isSel));
    s._marker.setZIndexOffset(isSel ? 1000 : 0);
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

  function refresh() {
    // マーカーの表示/非表示
    spots.forEach((s) => {
      const shown = active.has(s.cat);
      if (shown && !map.hasLayer(s._marker)) s._marker.addTo(map);
      if (!shown && map.hasLayer(s._marker)) map.removeLayer(s._marker);
    });

    // リスト（カテゴリ別にグループ）
    listEl.innerHTML = "";
    let total = 0;
    Object.entries(cats).forEach(([key, c]) => {
      if (!active.has(key)) return;
      const items = spots.filter((s) => s.cat === key);
      total += items.length;

      const group = document.createElement("div");
      group.className = "spot-group";
      group.innerHTML = `<h3 class="spot-group-title" style="color:${c.color}">${c.label}（${items.length}）</h3>`;

      items.forEach((s) => {
        const isSel = selected.has(spotKey(s));
        const row = document.createElement("div");
        row.className = "spot-row" + (isSel ? " selected" : "");
        row.innerHTML = `
          <input type="checkbox" class="spot-check" ${isSel ? "checked" : ""} aria-label="ルート候補に追加" title="ルートに含めたいスポットとして選択" />
          <span class="spot-bullet" style="background:${c.color}"></span>
          <div>
            <div class="spot-name">${s.name} <span class="spot-state">${s.state || ""}</span></div>
            <div class="spot-en">${s.nameEn || ""}</div>
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
