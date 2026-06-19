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
          </div>`;
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
})();
