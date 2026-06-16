// アメリカ横断の旅 — 地図 + 旅程リスト
// データは data/itinerary.json を編集するだけで地図・リスト両方が更新されます。

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

  // ヘッダー
  document.getElementById("trip-title").textContent = data.title || "旅程";
  document.getElementById("trip-subtitle").textContent = data.subtitle || "";
  document.title = data.title || "旅程";

  const stops = data.stops || [];

  // ---- 地図 ----
  const map = L.map("map", { scrollWheelZoom: true });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  const latlngs = stops.map((s) => [s.lat, s.lng]);
  const markers = [];

  // ルート線
  if (latlngs.length > 1) {
    L.polyline(latlngs, {
      color: "#c1442e",
      weight: 3,
      opacity: 0.8,
      dashArray: "6 8",
    }).addTo(map);
  }

  // マーカー
  stops.forEach((stop, i) => {
    const icon = L.divIcon({
      className: "",
      html: `<div class="marker-num">${i + 1}</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
    const marker = L.marker([stop.lat, stop.lng], { icon }).addTo(map);
    marker.bindPopup(
      `<strong>${stop.city}</strong><br><small>${stop.cityEn || ""}</small><br>${
        stop.summary || ""
      }`
    );
    marker.on("click", () => highlightStop(i));
    markers.push(marker);
  });

  // 全体が収まるように
  if (latlngs.length) {
    map.fitBounds(latlngs, { padding: [50, 50] });
  } else {
    map.setView([39.5, -98.35], 4); // アメリカ中心
  }

  // ---- 旅程リスト ----
  const list = document.getElementById("stop-list");
  stops.forEach((stop, i) => {
    const li = document.createElement("li");
    li.className = "stop-item";
    li.dataset.index = i;

    const nightsTxt = stop.nights ? `${stop.nights}泊` : "";
    const transportTxt = stop.transportToNext
      ? ` → 次へ：${stop.transportToNext}`
      : "";

    li.innerHTML = `
      <div class="stop-day">DAY ${stop.day}${
      stop.date ? " ・ " + stop.date : ""
    }</div>
      <div class="stop-city">${stop.city}</div>
      <div class="stop-city-en">${stop.cityEn || ""}</div>
      <div class="stop-meta">${nightsTxt}${transportTxt}</div>
      <div class="stop-summary">${stop.summary || ""}</div>
    `;

    li.addEventListener("click", () => {
      highlightStop(i);
      map.setView([stop.lat, stop.lng], 8, { animate: true });
      markers[i].openPopup();
      if (stop.md) openDetail(stop);
    });

    list.appendChild(li);
  });

  function highlightStop(i) {
    document
      .querySelectorAll(".stop-item")
      .forEach((el) => el.classList.remove("active"));
    const el = document.querySelector(`.stop-item[data-index="${i}"]`);
    if (el) {
      el.classList.add("active");
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

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
      content.innerHTML = `<div class="detail-content">${window.marked.parse(
        text
      )}</div>`;
    } catch (e) {
      content.innerHTML = `<div class="detail-content"><h1>${stop.city}</h1><p>${
        stop.summary || ""
      }</p><p><em>詳細メモ (itinerary/${stop.md}.md) はまだありません。</em></p></div>`;
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
