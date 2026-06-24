// アメリカ横断の旅 — 地図 + 旅程リスト
// data/itinerary.json の variations[] を切り替えて表示する（確定ルート / 仮ルート…）。

(async function () {
  const DATA_URL = "data/itinerary.json";

  let data;
  try {
    const res = await fetch(DATA_URL);
    data = await res.json();
  } catch (e) {
    document.getElementById("stop-list").innerHTML =
      "<li>旅程データの読み込みに失敗しました。ローカルで開く場合は簡易サーバー経由で表示してください。</li>";
    console.error(e);
    return;
  }

  // 旧形式（data.stops）も一応サポート
  const variations =
    data.variations && data.variations.length
      ? data.variations
      : [{ id: "default", label: "旅程", subtitle: data.subtitle, stops: data.stops || [] }];

  document.getElementById("trip-title").textContent = data.title || "旅程";
  document.title = data.title || "旅程";

  // ---- 地図（初期化は1回だけ）----
  const map = L.map("map", { scrollWheelZoom: true });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);
  map.setView([39.5, -98.35], 4);

  const routeLayer = L.layerGroup().addTo(map); // 案ごとに中身を入れ替える
  const list = document.getElementById("stop-list");
  let markers = [];

  const mappable = (s) =>
    s.type !== "air" && !s.tbd && typeof s.lat === "number" && typeof s.lng === "number";

  function render(variation) {
    const stops = variation.stops || [];
    document.getElementById("trip-subtitle").textContent = variation.subtitle || "";
    routeLayer.clearLayers();
    list.innerHTML = "";
    markers = [];

    const groundLatlngs = stops.filter(mappable).map((s) => [s.lat, s.lng]);

    // 車のルート線
    if (groundLatlngs.length > 1) {
      L.polyline(groundLatlngs, {
        color: "#c1442e",
        weight: 3,
        opacity: 0.8,
        dashArray: "6 8",
      }).addTo(routeLayer);
    }

    // 空路（往復フライト）：空港に隣接する区間を点線で
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i];
      const b = stops[i + 1];
      if (a.type === "air" || b.type === "air") {
        L.polyline(
          [
            [a.lat, a.lng],
            [b.lat, b.lng],
          ],
          { color: "#2b6cb0", weight: 2, opacity: 0.6, dashArray: "2 9" }
        ).addTo(routeLayer);
      }
    }

    // マーカー（陸路は通し番号、空路は✈、未定はマーカーなし）
    let groundNum = 0;
    stops.forEach((stop, i) => {
      if (stop.tbd || typeof stop.lat !== "number" || typeof stop.lng !== "number") {
        markers.push(null);
        return;
      }
      let icon;
      if (stop.type === "air") {
        icon = L.divIcon({ className: "", html: `<div class="marker-air">✈</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });
      } else {
        groundNum++;
        icon = L.divIcon({ className: "", html: `<div class="marker-num">${groundNum}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });
      }
      const marker = L.marker([stop.lat, stop.lng], { icon }).addTo(routeLayer);
      marker.bindPopup(
        `<strong>${stop.city}</strong><br><small>${stop.cityEn || ""}</small><br>${stop.summary || ""}`
      );
      marker.on("click", () => highlightStop(i));
      markers.push(marker);
    });

    if (groundLatlngs.length) map.fitBounds(groundLatlngs, { padding: [50, 50] });

    // ---- 旅程リスト ----
    stops.forEach((stop, i) => {
      const li = document.createElement("li");
      li.className = "stop-item" + (stop.tbd ? " stop-tbd" : "");
      li.dataset.index = i;
      const nightsTxt = stop.nights ? `${stop.nights}泊` : "";
      const transportTxt = stop.transportToNext ? ` → 次へ：${stop.transportToNext}` : "";
      li.innerHTML = `
        <div class="stop-day">DAY ${stop.day}${stop.date ? " ・ " + stop.date : ""}</div>
        <div class="stop-city">${stop.city}</div>
        <div class="stop-city-en">${stop.cityEn || ""}</div>
        <div class="stop-meta">${nightsTxt}${transportTxt}</div>
        <div class="stop-summary">${stop.summary || ""}</div>
      `;
      li.addEventListener("click", () => {
        highlightStop(i);
        if (markers[i]) {
          map.setView([stop.lat, stop.lng], 8, { animate: true });
          markers[i].openPopup();
        }
        if (stop.md) openDetail(stop);
      });
      list.appendChild(li);
    });
  }

  function highlightStop(i) {
    document.querySelectorAll(".stop-item").forEach((el) => el.classList.remove("active"));
    const el = document.querySelector(`.stop-item[data-index="${i}"]`);
    if (el) {
      el.classList.add("active");
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  // ---- バリエーション切替 ----
  const switchEl = document.getElementById("variation-switch");
  let activeId = data.defaultVariation || variations[0].id;
  if (!variations.some((v) => v.id === activeId)) activeId = variations[0].id;

  function selectVariation(id) {
    const v = variations.find((x) => x.id === id) || variations[0];
    activeId = v.id;
    render(v);
    if (switchEl) {
      switchEl.querySelectorAll(".filter-chip").forEach((b) =>
        b.classList.toggle("active", b.dataset.id === v.id)
      );
    }
  }

  if (switchEl && variations.length > 1) {
    variations.forEach((v) => {
      const b = document.createElement("button");
      b.className = "filter-chip";
      b.dataset.id = v.id;
      b.textContent = v.label || v.id;
      b.addEventListener("click", () => selectVariation(v.id));
      switchEl.appendChild(b);
    });
  }

  selectVariation(activeId);

  // ---- 詳細パネル (markdown) ----
  const panel = document.getElementById("detail-panel");
  const backdrop = document.getElementById("detail-backdrop");
  const content = document.getElementById("detail-content");

  async function openDetail(stop) {
    content.innerHTML = "<p>読み込み中…</p>";
    panel.classList.remove("hidden");
    backdrop.classList.remove("hidden");
    try {
      const res = await fetch(`itinerary/${stop.md}.md`);
      if (!res.ok) throw new Error("not found");
      const text = await res.text();
      content.innerHTML = `<div class="detail-content">${window.marked.parse(text)}</div>`;
    } catch (e) {
      content.innerHTML = `<div class="detail-content"><h1>${stop.city}</h1><p>${stop.summary || ""}</p><p><em>詳細メモ (itinerary/${stop.md}.md) はまだありません。</em></p></div>`;
    }
  }
  function closeDetail() {
    panel.classList.add("hidden");
    backdrop.classList.add("hidden");
  }
  document.getElementById("detail-close").addEventListener("click", closeDetail);
  backdrop.addEventListener("click", closeDetail);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDetail();
  });
})();
