// 9〜10月の催し — data/events.json をカテゴリ色分けで地図＋日付順リスト表示。
// カテゴリ＆月の絞り込み、「ルート沿いだけ表示」トグルつき。

(async function () {
  let data;
  try {
    data = await (await fetch("data/events.json")).json();
  } catch (e) {
    document.getElementById("event-list").innerHTML =
      "<p>データの読み込みに失敗しました。簡易サーバー経由で開いてください。</p>";
    console.error(e);
    return;
  }

  const cats = data.categories;
  const phases = data.phases || { "1": "上旬", "2": "中旬", "3": "下旬" };
  const events = data.events || [];
  document.getElementById("event-note").textContent = data.disclaimer || "";

  const activeCats = new Set(Object.keys(cats));
  let routeOnly = false;

  // ---- AIに聞く（ChatGPT / Claude） ----
  function askPrompt(ev) {
    const when = `${ev.month}月${phases[ev.phase] || ""}`;
    return `アメリカ横断ドライブ旅行中に、イベント「${ev.name}」(${ev.en || ""}, ${ev.city}, ${ev.state}, アメリカ／${when}頃) に寄ろうか検討しています。今年の開催日程、チケットの要否と入手方法、見どころ、混雑や所要時間、近くのおすすめを教えてください。`;
  }
  function askLinksHtml(ev) {
    const q = encodeURIComponent(askPrompt(ev));
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

  function dot(color, near) {
    return L.divIcon({
      className: "",
      html: `<div class="spot-dot${near ? " near" : ""}" style="background:${color}"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
  }

  events.forEach((ev) => {
    const color = (cats[ev.cat] || {}).color || "#666";
    const when = `${ev.month}月${phases[ev.phase] || ""}`;
    const m = L.marker([ev.lat, ev.lng], { icon: dot(color, ev.near) });
    m.bindPopup(
      `<strong>${ev.name}</strong>${ev.near ? ' <span style="color:#c1442e">★ルート沿い</span>' : ""}<br><small>${when}・${ev.city}（${ev.state}）</small><br>${ev.desc || ""}${askLinksHtml(ev)}`
    );
    ev._marker = m;
    ev._when = when;
  });

  // ---- フィルタ（カテゴリ＋ルート沿いトグル）----
  const filtersEl = document.getElementById("event-filters");
  Object.entries(cats).forEach(([key, c]) => {
    const count = events.filter((e) => e.cat === key).length;
    const label = document.createElement("label");
    label.className = "filter-chip";
    label.innerHTML = `
      <input type="checkbox" value="${key}" checked />
      <span class="chip-dot" style="background:${c.color}"></span>
      ${c.label} <span class="chip-count">${count}</span>`;
    label.querySelector("input").addEventListener("change", (e) => {
      if (e.target.checked) activeCats.add(key);
      else activeCats.delete(key);
      refresh();
    });
    filtersEl.appendChild(label);
  });

  const routeLabel = document.createElement("label");
  routeLabel.className = "filter-chip route-chip";
  routeLabel.innerHTML = `<input type="checkbox" id="ev-route-only" /> ★ ルート沿いだけ`;
  routeLabel.querySelector("input").addEventListener("change", (e) => {
    routeOnly = e.target.checked;
    refresh();
  });
  filtersEl.appendChild(routeLabel);

  // ---- 更新 ----
  const listEl = document.getElementById("event-list");
  const countEl = document.getElementById("event-count");

  function visible(ev) {
    if (!activeCats.has(ev.cat)) return false;
    if (routeOnly && !ev.near) return false;
    return true;
  }

  function refresh() {
    // マーカー表示/非表示
    events.forEach((ev) => {
      const show = visible(ev);
      if (show && !map.hasLayer(ev._marker)) ev._marker.addTo(map);
      if (!show && map.hasLayer(ev._marker)) map.removeLayer(ev._marker);
    });

    // 日付順（月→上旬中旬下旬）にソートして表示
    const shown = events
      .filter(visible)
      .slice()
      .sort((a, b) => a.month - b.month || a.phase - b.phase);

    listEl.innerHTML = "";
    let lastKey = "";
    shown.forEach((ev) => {
      const key = `${ev.month}月${phases[ev.phase]}`;
      if (key !== lastKey) {
        const h = document.createElement("h3");
        h.className = "event-when-head";
        h.textContent = key;
        listEl.appendChild(h);
        lastKey = key;
      }
      const c = (cats[ev.cat] || {}).color || "#666";
      const row = document.createElement("div");
      row.className = "spot-row";
      row.innerHTML = `
        <span class="spot-bullet" style="background:${c}"></span>
        <div>
          <div class="spot-name">${ev.name} ${ev.near ? '<span class="route-badge">ルート沿い</span>' : ""}</div>
          <div class="spot-en">${ev.en || ""} ・ ${ev.city}（${ev.state}）</div>
          <div class="spot-desc">${ev.desc || ""}</div>
          ${askLinksHtml(ev)}
        </div>`;
      row.addEventListener("click", () => {
        map.setView([ev.lat, ev.lng], 7, { animate: true });
        ev._marker.openPopup();
      });
      row.querySelectorAll(".ask-btn").forEach((b) =>
        b.addEventListener("click", (e) => e.stopPropagation())
      );
      listEl.appendChild(row);
    });

    countEl.textContent = `9〜10月の催し（${shown.length}件）`;
  }

  refresh();
})();
