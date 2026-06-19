// みんなが行きたい — data/must.json（手編集の共有リスト）を地図＋人気順リストで表示。
// 場所・座標・カテゴリは data/spots.json から name(+state) で紐付ける。

(async function () {
  let spotsData, mustData;
  try {
    [spotsData, mustData] = await Promise.all([
      fetch("data/spots.json").then((r) => r.json()),
      fetch("data/must.json").then((r) => r.json()),
    ]);
  } catch (e) {
    document.getElementById("must-list").innerHTML =
      "<p>データの読み込みに失敗しました。簡易サーバー経由で開いてください。</p>";
    console.error(e);
    return;
  }

  const cats = spotsData.categories || {};
  const spotIndex = new Map();
  (spotsData.spots || []).forEach((s) =>
    spotIndex.set(`${s.name}__${s.state || ""}`, s)
  );

  // must エントリに spots の情報を結合。人気（by人数）の多い順に並べる。
  const items = (mustData.must || [])
    .map((m) => {
      const s = spotIndex.get(`${m.name}__${m.state || ""}`) || null;
      return {
        name: m.name,
        state: m.state || (s && s.state) || "",
        by: m.by || [],
        note: m.note || "",
        spot: s, // 見つからなければ null（地図には出さない）
      };
    })
    .sort((a, b) => b.by.length - a.by.length || a.name.localeCompare(b.name, "ja"));

  document.getElementById("must-note").textContent =
    "行きたいスポットは data/must.json を編集して push すると反映されます。★ の数＝行きたい人の数。";

  // ---- AIに聞く（ChatGPT / Claude） ----
  function askLinksHtml(it) {
    const s = it.spot || {};
    const q = encodeURIComponent(
      `アメリカ横断ドライブ旅行で「${it.name}」(${s.nameEn || ""}, ${it.state}, アメリカ) を訪れる予定です。見どころ、平均的な滞在時間、ベストな訪問時間帯や季節、入場料・予約の要否、近くのおすすめ、注意点を簡潔に教えてください。`
    );
    return `<div class="ask-row">
      <a class="ask-btn ask-gpt" href="https://chatgpt.com/?q=${q}" target="_blank" rel="noopener">🤖 ChatGPTに聞く</a>
      <a class="ask-btn ask-claude" href="https://claude.ai/new?q=${q}" target="_blank" rel="noopener">✳️ Claudeに聞く</a>
    </div>`;
  }

  // ---- 地図 ----
  const map = L.map("map", { scrollWheelZoom: true });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);
  map.setView([39.5, -98.35], 4);

  function dot(color) {
    return L.divIcon({
      className: "",
      html: `<div class="spot-dot must" style="background:${color}"><span class="must-star">★</span></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
  }

  // ---- ホバー画像（Wikipedia サムネイル・必要時のみ取得）----
  function loadThumb(it) {
    if (it._thumb !== undefined) return Promise.resolve(it._thumb);
    if (it._thumbP) return it._thumbP;
    const q = (it.spot && it.spot.nameEn) || it.name;
    const api =
      "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*" +
      "&prop=pageimages&piprop=thumbnail&pithumbsize=320&redirects=1" +
      "&generator=search&gsrlimit=1&gsrsearch=" +
      encodeURIComponent(q);
    it._thumbP = fetch(api)
      .then((r) => r.json())
      .then((d) => {
        const pages = d && d.query && d.query.pages;
        const first = pages ? Object.values(pages)[0] : null;
        it._thumb = (first && first.thumbnail && first.thumbnail.source) || null;
        return it._thumb;
      })
      .catch(() => {
        it._thumb = null;
        return null;
      });
    return it._thumbP;
  }
  function thumbHtml(it, state) {
    let media;
    if (state === "loading")
      media = `<div class="thumb-ph">画像を読み込み中…</div>`;
    else if (state) media = `<img src="${state}" alt="${it.name}" loading="lazy" />`;
    else media = `<div class="thumb-ph">画像が見つかりませんでした</div>`;
    return `<div class="thumb-name">${it.name}</div>${media}`;
  }

  function whoHtml(it) {
    const who = it.by.join("・");
    const note = it.note ? `<span class="must-note-txt">「${it.note}」</span>` : "";
    return `<div class="must-tag">★ 行きたい${who ? `：${who}（${it.by.length}）` : ""}${note}</div>`;
  }

  // ---- マーカー（場所が分かるものだけ）----
  const latlngs = [];
  items.forEach((it) => {
    const s = it.spot;
    if (!s) return;
    const color = (cats[s.cat] || {}).color || "#666";
    const m = L.marker([s.lat, s.lng], { icon: dot(color) }).addTo(map);
    m.bindPopup(
      `<strong>${it.name}</strong><br><small>${s.nameEn || ""}（${it.state}）</small>${whoHtml(it)}<br>${s.desc || ""}${askLinksHtml(it)}`
    );
    m.bindTooltip(thumbHtml(it, "loading"), {
      direction: "top",
      offset: [0, -10],
      opacity: 1,
      className: "spot-thumb-tip",
    });
    m.on("mouseover", () => {
      if (it._thumb !== undefined) m.setTooltipContent(thumbHtml(it, it._thumb));
      else loadThumb(it).then((url) => m.setTooltipContent(thumbHtml(it, url)));
    });
    it._marker = m;
    latlngs.push([s.lat, s.lng]);
  });
  if (latlngs.length) map.fitBounds(latlngs, { padding: [60, 60], maxZoom: 7 });

  // ---- 旅程ルート表示トグル（既定ON）----
  const filtersEl = document.getElementById("must-filters");
  const route = await window.RouteOverlay.create(map);
  if (route.count) {
    const routeLabel = document.createElement("label");
    routeLabel.className = "filter-chip route-chip";
    routeLabel.innerHTML = `<input type="checkbox" id="show-route" checked /> 🛣️ ルートを表示`;
    routeLabel.querySelector("input").addEventListener("change", (e) => {
      route.set(e.target.checked);
    });
    filtersEl.appendChild(routeLabel);
    route.set(true);
  }

  // ---- リスト（人気順）----
  const listEl = document.getElementById("must-list");
  if (!items.length) {
    listEl.innerHTML =
      "<p>まだ登録がありません。<code>data/must.json</code> に行きたいスポットを追加してください。</p>";
  }
  items.forEach((it) => {
    const s = it.spot;
    const color = s ? (cats[s.cat] || {}).color || "#666" : "#bbb";
    const row = document.createElement("div");
    row.className = "spot-row is-must";
    row.innerHTML = `
      <span class="spot-bullet" style="background:${color}"></span>
      <div>
        <div class="spot-name">${it.name} <span class="spot-state">${it.state}</span></div>
        <div class="spot-en">${(s && s.nameEn) || ""}</div>
        ${whoHtml(it)}
        <div class="spot-desc">${(s && s.desc) || (s ? "" : "※ spots.json に未登録（地図には出ません）")}</div>
        ${askLinksHtml(it)}
      </div>`;
    if (s) {
      row.addEventListener("click", () => {
        map.setView([s.lat, s.lng], 8, { animate: true });
        it._marker.openPopup();
      });
      row.querySelectorAll(".ask-btn").forEach((b) =>
        b.addEventListener("click", (e) => e.stopPropagation())
      );
    }
    listEl.appendChild(row);
  });

  document.getElementById("must-count").textContent = `みんなが行きたい（${items.length}件）`;
})();
