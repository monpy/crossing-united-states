// 共有オーバーレイ — 旅程ルート(data/itinerary.json)を地図に重ねて表示する。
// spots.html / events.html から使う。既定は非表示で、toggle で出し入れする。

window.RouteOverlay = {
  async create(map) {
    let stops = [];
    try {
      const data = await (await fetch("data/itinerary.json")).json();
      // variations[] の場合は、地図に出せる地点が最も多い案を代表として重ねる
      const mappable = (s) =>
        s.type !== "air" && !s.tbd && typeof s.lat === "number" && typeof s.lng === "number";
      if (data.variations && data.variations.length) {
        let best = [];
        data.variations.forEach((v) => {
          const m = (v.stops || []).filter(mappable);
          if (m.length > best.length) best = m;
        });
        stops = best;
      } else {
        stops = (data.stops || []).filter(mappable);
      }
    } catch (e) {
      console.error("ルートデータの読み込みに失敗しました", e);
    }

    // ルート線＋番号付きピンをまとめた layerGroup（まだ地図には載せない）
    const group = L.layerGroup();
    const latlngs = stops.map((s) => [s.lat, s.lng]);

    if (latlngs.length > 1) {
      L.polyline(latlngs, {
        color: "#c1442e",
        weight: 3,
        opacity: 0.8,
        dashArray: "6 8",
      }).addTo(group);
    }

    stops.forEach((s, i) => {
      const icon = L.divIcon({
        className: "",
        html: `<div class="route-stop">${i + 1}</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      L.marker([s.lat, s.lng], { icon })
        .bindPopup(
          `<strong>DAY ${s.day}・${s.city}</strong><br><small>${s.cityEn || ""}</small><br>${s.summary || ""}`
        )
        .addTo(group);
    });

    let shown = false;
    return {
      count: stops.length,
      set(on) {
        if (on && !shown) {
          group.addTo(map);
          shown = true;
        } else if (!on && shown) {
          map.removeLayer(group);
          shown = false;
        }
      },
    };
  },
};
