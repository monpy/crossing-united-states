// 州別ガイド — data/states.json（安全度・概要）と data/spots.json（スポット）を
// 州コードで結びつけて、地域ごとに全州を紹介する。
// 「横断ルート上の州だけ表示」トグルと安全度の凡例つき。

(async function () {
  const container = document.getElementById("states-container");

  let states, spotsData;
  try {
    [states, spotsData] = await Promise.all([
      (await fetch("data/states.json")).json(),
      (await fetch("data/spots.json")).json(),
    ]);
  } catch (e) {
    container.innerHTML =
      "<p>データの読み込みに失敗しました。簡易サーバー経由で開いてください。</p>";
    console.error(e);
    return;
  }

  const levels = states.safetyLevels;
  const regions = states.regions;
  const spots = spotsData.spots || [];
  const catColors = spotsData.categories || {};

  document.getElementById("states-disclaimer").textContent = states.disclaimer;

  // 安全度の凡例
  const legendEl = document.getElementById("safety-legend");
  Object.values(levels).forEach((lv) => {
    const s = document.createElement("span");
    s.className = "legend-item";
    s.innerHTML = `<span class="legend-dot" style="background:${lv.color}"></span>${lv.label}`;
    legendEl.appendChild(s);
  });

  // 州コード → その州にあるスポット一覧（"AZ/UT" や "IL→CA" のような複数表記に対応）
  function spotsForState(abbr) {
    return spots.filter((sp) => {
      const codes = (sp.state || "").match(/[A-Z]{2}/g) || [];
      return codes.includes(abbr);
    });
  }

  let routeOnly = false;

  // ---- AIに聞く（ChatGPT / Claude） ----
  function askLinksHtml(st) {
    const prompt = `アメリカ横断ドライブ旅行で${st.ja}(${st.en}, アメリカ)を通ります。旅行者として知っておくべき治安の注意点、必見スポット、運転やベストシーズンのコツ、おすすめのご当地グルメを簡潔に教えてください。`;
    const q = encodeURIComponent(prompt);
    return `<div class="ask-row">
      <a class="ask-btn ask-gpt" href="https://chatgpt.com/?q=${q}" target="_blank" rel="noopener">🤖 ChatGPTに聞く</a>
      <a class="ask-btn ask-claude" href="https://claude.ai/new?q=${q}" target="_blank" rel="noopener">✳️ Claudeに聞く</a>
    </div>`;
  }

  function render() {
    container.innerHTML = "";

    Object.entries(regions).forEach(([regionKey, regionLabel]) => {
      let regionStates = states.states.filter((s) => s.region === regionKey);
      if (routeOnly) regionStates = regionStates.filter((s) => s.route);
      if (!regionStates.length) return;

      const section = document.createElement("section");
      section.className = "region-section";
      section.innerHTML = `<h2 class="region-title">${regionLabel}</h2>`;

      const grid = document.createElement("div");
      grid.className = "states-grid";

      regionStates.forEach((st) => {
        const lv = levels[st.safety] || {};
        const stSpots = spotsForState(st.abbr);

        const spotsHtml = stSpots.length
          ? `<ul class="state-spots">${stSpots
              .map((sp) => {
                const c = (catColors[sp.cat] || {}).color || "#666";
                return `<li><span class="state-spot-dot" style="background:${c}"></span>${sp.name}<span class="state-spot-en">${sp.nameEn || ""}</span></li>`;
              })
              .join("")}</ul>`
          : `<p class="state-nospot">（スポット集に未登録。<a href="spots.html">スポット集</a>に追加できます）</p>`;

        const card = document.createElement("div");
        card.className = "state-card";
        card.id = `state-${st.abbr}`;
        card.style.setProperty("--safety", lv.color || "#999");
        card.innerHTML = `
          <div class="state-head">
            <div>
              <span class="state-name">${st.ja}</span>
              <span class="state-en">${st.en}・${st.abbr}</span>
            </div>
            ${st.route ? '<span class="route-badge">横断ルート</span>' : ""}
          </div>
          <div class="safety-badge" style="background:${lv.color}">${lv.label}</div>
          <p class="state-note">${st.note}</p>
          <p class="state-known"><strong>名物：</strong>${st.knownFor}</p>
          <div class="state-spots-wrap">
            <p class="state-spots-label">この州のスポット（${stSpots.length}）</p>
            ${spotsHtml}
          </div>
          ${askLinksHtml(st)}`;
        grid.appendChild(card);
      });

      section.appendChild(grid);
      container.appendChild(section);
    });
  }

  document.getElementById("route-only").addEventListener("change", (e) => {
    routeOnly = e.target.checked;
    render();
  });

  render();

  // ---- 安全度の色塗り地図（コロプレス） ----
  // 州名(英語フル)→ state オブジェクト。DCは GeoJSON 上の名称が異なるため別名対応。
  const byGeoName = {};
  states.states.forEach((st) => {
    byGeoName[st.en] = st;
  });
  byGeoName["District of Columbia"] = byGeoName["Washington, D.C."];

  function flashCard(abbr) {
    const card = document.getElementById(`state-${abbr}`);
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("flash");
    setTimeout(() => card.classList.remove("flash"), 1600);
  }

  try {
    const geo = await (await fetch("data/us-states.geojson")).json();
    const mapEl = document.getElementById("states-map");
    const map = L.map(mapEl, {
      scrollWheelZoom: false,
      zoomControl: true,
      attributionControl: false,
    });

    function styleFor(feature) {
      const st = byGeoName[feature.properties.name];
      const lv = st ? levels[st.safety] : null;
      return {
        fillColor: lv ? lv.color : "#cccccc",
        fillOpacity: 0.55,
        color: st && st.route ? "#1f2937" : "#ffffff",
        weight: st && st.route ? 2.5 : 1,
      };
    }

    const layer = L.geoJSON(geo, {
      style: styleFor,
      onEachFeature: (feature, lyr) => {
        const st = byGeoName[feature.properties.name];
        if (!st) return;
        const lv = levels[st.safety] || {};
        lyr.bindTooltip(
          `<strong>${st.ja}</strong>（${st.abbr}）<br>${lv.label}${st.route ? "<br>★横断ルート上" : ""}`,
          { sticky: true }
        );
        lyr.on({
          mouseover: (e) => e.target.setStyle({ fillOpacity: 0.8, weight: 3 }),
          mouseout: (e) => layer.resetStyle(e.target),
          click: () => flashCard(st.abbr),
        });
      },
    }).addTo(map);

    // 本土48州にフィット（アラスカ・ハワイは脇に描画され、パンで見られる）
    const CONUS = L.latLngBounds([24.5, -125.0], [49.5, -66.5]);
    const fit = () => map.fitBounds(CONUS, { padding: [6, 6] });
    fit();
    // コンテナの幅が確定/変化したらサイズ再計算して再フィット
    // （初期表示時に幅が0でも、レイアウト確定後に正しく描画される）
    if (window.ResizeObserver) {
      let lastW = 0;
      const ro = new ResizeObserver(() => {
        const w = mapEl.clientWidth;
        if (w > 0 && w !== lastW) {
          lastW = w;
          map.invalidateSize();
          fit();
        }
      });
      ro.observe(mapEl);
    }
    // 念のため遅延でも一度リフレッシュ
    setTimeout(() => {
      map.invalidateSize();
      fit();
    }, 300);
  } catch (e) {
    document.getElementById("states-map").style.display = "none";
    console.error("地図の読み込みに失敗:", e);
  }
})();
