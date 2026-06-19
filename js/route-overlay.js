// 共有オーバーレイ — 旅程ルート(data/itinerary.json)を地図に重ねて表示する。
// spots.html / events.html から使う。既定は非表示で、toggle で出し入れする。

window.RouteOverlay = {
  async create(map) {
    let stops = [];
    try {
      const data = await (await fetch("data/itinerary.json")).json();
      stops = data.stops || [];
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
