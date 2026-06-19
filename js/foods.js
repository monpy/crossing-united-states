// ご当地グルメ — data/foods.json をカテゴリ色分けで地図＋地域別リスト表示。
// カテゴリ絞り込み・「ルート沿いだけ」トグル・AIに聞くボタンつき。

(async function () {
  let data;
  try {
    data = await (await fetch("data/foods.json")).json();
  } catch (e) {
    document.getElementById("food-list").innerHTML =
      "<p>データの読み込みに失敗しました。簡易サーバー経由で開いてください。</p>";
    console.error(e);
    return;
  }

  const cats = data.categories;
  const regions = data.regions;
  const foods = data.foods || [];
  document.getElementById("food-note").textContent = data.note || "";

  const activeCats = new Set(Object.keys(cats));
  let routeOnly = false;

  // ---- 画像URL ----
  // foods.json に img があればそれを優先。無ければ英語名のキーワードで
  // LoremFlickr（CC写真）から取得。lock=index で品ごとに固定の写真に。
  const STOP = new Set(["in", "on", "of", "the", "with", "and", "a", "style", "whole", "original", "fresh"]);
  // 料理名の最後の語（＝料理の種類になりやすい：cheesesteak / pie / lobster…）を採用。
  // 単語1つなら Flickr の写真がヒットしやすく、関連性も高い。
  function imgKeyword(f) {
    const base = (f.en || f.ja).toLowerCase().replace(/\(.*?\)/g, " ");
    const words = base
      .replace(/[^a-z0-9 ]/g, " ")
      .trim()
      .split(/\s+/)
      .filter((w) => w && !STOP.has(w));
    return words.length ? words[words.length - 1] : "food";
  }
  function imgUrl(f, i) {
    if (f.img) return f.img;
    return `https://loremflickr.com/320/220/${imgKeyword(f)}?lock=${i}`;
  }
  // 404なら汎用の「food」写真にフォールバック（必ず料理の写真）、それも失敗なら隠す
  const ONERR =
    "if(this.dataset.fb){this.classList.add('img-failed');}else{this.dataset.fb=1;this.src='https://loremflickr.com/320/220/food?lock='+(this.dataset.i||0);}";

  // ---- AIに聞く（ChatGPT / Claude） ----
  function askLinksHtml(f) {
    const prompt = `アメリカ横断ドライブ旅行で「${f.ja}」(${f.en}) を食べたいです。${f.state}（${f.city}）でこれを食べるならどこの名店がおすすめ？由来や注文のコツ、似たローカル料理も教えてください。`;
    const q = encodeURIComponent(prompt);
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

  foods.forEach((f, i) => {
    f._idx = i;
    const color = (cats[f.cat] || {}).color || "#666";
    const m = L.marker([f.lat, f.lng], { icon: dot(color, f.near) });
    m.bindPopup(
      `<img class="popup-thumb" src="${imgUrl(f, i)}" data-i="${i}" alt="${f.ja}" onerror="${ONERR}"><strong>${f.ja}</strong>${f.near ? ' <span style="color:#c1442e">★ルート沿い</span>' : ""}<br><small>${f.en} ・ ${f.city}（${f.state}）</small><br>${f.desc || ""}${askLinksHtml(f)}`
    );
    f._marker = m;
  });

  // ---- フィルタ ----
  const filtersEl = document.getElementById("food-filters");
  Object.entries(cats).forEach(([key, c]) => {
    const count = foods.filter((f) => f.cat === key).length;
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
  routeLabel.innerHTML = `<input type="checkbox" id="food-route-only" /> ★ ルート沿いだけ`;
  routeLabel.querySelector("input").addEventListener("change", (e) => {
    routeOnly = e.target.checked;
    refresh();
  });
  filtersEl.appendChild(routeLabel);

  // ---- 更新（地域別リスト） ----
  const listEl = document.getElementById("food-list");
  const countEl = document.getElementById("food-count");

  function visible(f) {
    if (!activeCats.has(f.cat)) return false;
    if (routeOnly && !f.near) return false;
    return true;
  }

  function refresh() {
    foods.forEach((f) => {
      const show = visible(f);
      if (show && !map.hasLayer(f._marker)) f._marker.addTo(map);
      if (!show && map.hasLayer(f._marker)) map.removeLayer(f._marker);
    });

    listEl.innerHTML = "";
    let total = 0;
    Object.entries(regions).forEach(([regionKey, regionLabel]) => {
      const items = foods.filter((f) => f.region === regionKey && visible(f));
      if (!items.length) return;
      total += items.length;

      const h = document.createElement("h3");
      h.className = "event-when-head";
      h.textContent = `${regionLabel}（${items.length}）`;
      listEl.appendChild(h);

      items.forEach((f) => {
        const c = (cats[f.cat] || {}).color || "#666";
        const row = document.createElement("div");
        row.className = "spot-row";
        row.innerHTML = `
          <span class="spot-bullet" style="background:${c}"></span>
          <img class="food-thumb" src="${imgUrl(f, f._idx)}" data-i="${f._idx}" alt="${f.ja}" onerror="${ONERR}">
          <div>
            <div class="spot-name">${f.ja} ${f.near ? '<span class="route-badge">ルート沿い</span>' : ""}</div>
            <div class="spot-en">${f.en} ・ ${f.city}（${f.state}）</div>
            <div class="spot-desc">${f.desc || ""}</div>
            ${askLinksHtml(f)}
          </div>`;
        row.addEventListener("click", () => {
          map.setView([f.lat, f.lng], 7, { animate: true });
          f._marker.openPopup();
        });
        row.querySelectorAll(".ask-btn").forEach((b) =>
          b.addEventListener("click", (e) => e.stopPropagation())
        );
        listEl.appendChild(row);
      });
    });

    countEl.textContent = `ご当地グルメ（${total}件）`;
  }

  refresh();
})();
