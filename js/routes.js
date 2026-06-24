// ルート比較 — data/routes.json の複数案を地図に重ね、比較表で見比べる。
// 案を増やすときは routes.json の routes[] に1ブロック足すだけでよい。

(async function () {
  let data;
  try {
    data = await (await fetch("data/routes.json")).json();
  } catch (e) {
    document.getElementById("route-cards").innerHTML =
      "<p>ルートデータの読み込みに失敗しました。簡易サーバー経由で開いてください。</p>";
    console.error(e);
    return;
  }

  const routes = data.routes || [];
  const fixed = data.fixed || {};

  document.getElementById("route-note").textContent =
    `出発(${fixed.start ? fixed.start.name : "SF"})と到着(${fixed.goal ? fixed.goal.name : "NY"})は固定、` +
    `中間の${fixed.drivingDays || ""}日（${fixed.window || ""}）を比較。案は data/routes.json に追加できます。`;

  // ---- 地図 ----
  const map = L.map("map", { scrollWheelZoom: true });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);
  map.setView([39.5, -98.35], 4);

  // 各案を layerGroup 化（線＋番号ピン）
  const layers = {};
  routes.forEach((r) => {
    const group = L.layerGroup();
    const latlngs = (r.stops || []).map((s) => [s.lat, s.lng]);
    if (latlngs.length > 1) {
      L.polyline(latlngs, { color: r.color, weight: 4, opacity: 0.85 }).addTo(group);
    }
    (r.stops || []).forEach((s, i) => {
      const icon = L.divIcon({
        className: "",
        html: `<div class="route-stop" style="background:${r.color}">${i + 1}</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      L.marker([s.lat, s.lng], { icon })
        .bindPopup(`<strong>${r.id}-${i + 1}・${s.name}</strong>`)
        .addTo(group);
    });
    layers[r.id] = { group, latlngs };
  });

  function show(ids) {
    routes.forEach((r) => {
      const L_ = layers[r.id];
      if (ids.includes(r.id)) L_.group.addTo(map);
      else map.removeLayer(L_.group);
    });
    // 表示中の案に地図を合わせる
    const pts = ids.flatMap((id) => layers[id].latlngs);
    if (pts.length) map.fitBounds(pts, { padding: [40, 40] });
    // ボタン・カードのアクティブ表示
    const isAll = ids.length === routes.length;
    document.querySelectorAll("#route-switch .filter-chip").forEach((b) => {
      const on =
        b.dataset.id === "all" ? isAll : !isAll && ids.includes(b.dataset.id);
      b.classList.toggle("active", on);
    });
    document.querySelectorAll(".route-card").forEach((c) =>
      c.classList.toggle("is-active", ids.includes(c.dataset.id))
    );
  }

  // ---- 切替ボタン ----
  const switchEl = document.getElementById("route-switch");
  routes.forEach((r) => {
    const b = document.createElement("button");
    b.className = "filter-chip";
    b.dataset.id = r.id;
    b.innerHTML = `<span class="route-swatch" style="background:${r.color}"></span>${r.id}案`;
    b.addEventListener("click", () => show([r.id]));
    switchEl.appendChild(b);
  });
  const allBtn = document.createElement("button");
  allBtn.className = "filter-chip";
  allBtn.dataset.id = "all";
  allBtn.textContent = "全部重ねる";
  allBtn.addEventListener("click", () => show(routes.map((r) => r.id)));
  switchEl.appendChild(allBtn);

  // ---- 比較カード ----
  function stars(n) {
    const v = Math.max(0, Math.min(5, n || 0));
    return "★★★★★".slice(0, v) + "☆☆☆☆☆".slice(0, 5 - v);
  }
  const cardsEl = document.getElementById("route-cards");
  routes.forEach((r) => {
    const fit = r.fit || {};
    const fitRows = Object.keys(fit)
      .map((k) => `<div class="route-fit-row"><span>${k}</span><span class="route-stars">${stars(fit[k])}</span></div>`)
      .join("");
    const chips = (r.highlights || [])
      .map((h) => `<span class="route-tag">${h}</span>`)
      .join("");
    const card = document.createElement("div");
    card.className = "route-card";
    card.dataset.id = r.id;
    card.style.borderLeftColor = r.color;
    card.innerHTML = `
      <div class="route-card-head">
        <span class="route-swatch" style="background:${r.color}"></span>
        <strong>${r.name}</strong>
      </div>
      <p class="route-concept">${r.concept || ""}</p>
      <div class="route-meta">約${(r.distanceKm || 0).toLocaleString()}km</div>
      <div class="route-fit">${fitRows}</div>
      <div class="route-tags">${chips}</div>
      ${r.caution ? `<p class="route-caution">⚠️ ${r.caution}</p>` : ""}
    `;
    card.addEventListener("click", () => show([r.id]));
    cardsEl.appendChild(card);
  });

  // 初期表示：全案を重ねて俯瞰
  show(routes.map((r) => r.id));
})();
