const { Map: OLMap, View, Overlay, Feature } = ol;
const { Point } = ol.geom;
const { Tile: TileLayer, WebGLVector: WebGLVectorLayer, Vector: VectorLayer } = ol.layer;
const { OSM, TileWMS, Vector: VectorSource } = ol.source;
const { GeoJSON } = ol.format;
const { DoubleClickZoom } = ol.interaction;
const { fromLonLat, toLonLat } = ol.proj;
const { createEmpty, extendCoordinate, isEmpty } = ol.extent;
const $ = (id) => document.getElementById(id),
  lt = $("legendTitle"),
  ll = $("legendList"),
  pi = $("postcodeInput"),
  selCP = $("postcodeList"),
  btnQ = $("btnConsultarMapa"),
  btnO = $("btnVerOverpassTurbo"),
  btnSel = $("btnLazo"),
  btnList = $("btnListadoCP"),
  btnInfo = $("btnInfoExtra"),
  cpOpacity = $("cpOpacity"),
  cpOpacityValue = $("cpOpacityValue"),
  ov = $("loadingOverlay"),
  ovLog = $("ovLog"),
  ovTitle = $("ovTitle"),
  ovX = $("ovX"),
  serverSel = $("server"),
  customFields = $("customServerFields"),
  customServer = $("customServer"),
  SERV = {
    de: { name: "Overpass Alemania", url: "https://overpass-api.de/api/interpreter", kind: "overpass" },
    postpass: { name: "Postpass Geofabrik", url: "https://postpass.geofabrik.de/api/interpreter", kind: "postpass" }
  },
  validCPUrl = "./data/cp-validos.csv",
  groups = {};
let act = null,
  currentPC = "",
  listReady = 0,
  infoMode = 0,
  validCP = null,
  timer = 0,
  ovEnd = 0,
  ready = 0,
  pop = null,
  popKind = null,
  tip = null,
  items = [],
  byId = new globalThis.Map(),
  draw = 0,
  pts = [],
  cpAlpha = 1;
const esc = (v) =>
    String(v ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"'),
  h = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        }[c])
    ),
  customEndpoint = () => {
    const raw = customServer.value.trim();
    if (!raw) throw Error("Indica la URL del servidor Overpass personalizado");
    let url;
    try { url = new URL(raw); } catch { throw Error("URL del servidor Overpass no válida"); }
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw Error("El servidor debe usar HTTPS");
    if (!/\/interpreter\/?$/.test(url.pathname)) url.pathname = url.pathname.replace(/\/$/, "") + "/interpreter";
    return url.href;
  },
  srv = () => serverSel.value === "custom" ? { name: "Overpass personalizado", url: customEndpoint(), kind: "overpass" } : SERV[serverSel.value] || SERV.de,
  sqlEsc = (v) => String(v).replace(/'/g, "''"),
  split = (v) =>
    String(v ?? "")
      .split(";")
      .map((x) => x.trim())
      .filter(Boolean),
  special = (v) => /^(?:0[1-9]|[1-4]\d|5[0-2])(?:070|071|080)$/.test(v),
  clip = (t) =>
    navigator.clipboard?.writeText
      ? navigator.clipboard.writeText(t).catch(() => fallback(t))
      : fallback(t),
  fallback = (t) => {
    const x = document.createElement("textarea");
    x.value = t;
    x.style.cssText = "position:fixed;opacity:0";
    document.body.append(x);
    x.select();
    try {
      document.execCommand("copy");
    } catch {}
    x.remove();
  };
const ovOpen = (t = "Proceso") => {
    clearTimeout(ovEnd);
    clearInterval(timer);
    ov.hidden = 0;
    ovTitle.textContent = t;
    ovLog.innerHTML = "";
  },
  ovLine = (s, b = 0, c = "") => {
    const d = document.createElement("div");
    d.className = (b ? "bad " : "") + c;
    d.textContent = (b ? "✖ " : "› ") + s;
    ovLog.append(d);
    ovLog.scrollTop = ovLog.scrollHeight;
    return d;
  },
  setOverlay = (s, msg) => {
    clearInterval(timer);
    let n = s,
      d = ovLine(`${msg} · ${n}s`, 0, "status");
    timer = setInterval(() => {
      n = Math.max(0, n - 1);
      d.textContent = `› ${msg} · ${n}s`;
      n || clearInterval(timer);
    }, 1e3);
  },
  ovClose = (ok = 1) => {
    clearInterval(timer);
    clearTimeout(ovEnd);
    ok && (ovEnd = setTimeout(() => (ov.hidden = 1), 1200));
  };
ovX.onclick = () => {
  clearInterval(timer);
  clearTimeout(ovEnd);
  ov.hidden = 1;
};
try {
  const s = localStorage.getItem("cpcheckServer"),
    o = localStorage.getItem("cpcheckOpacity"),
    custom = localStorage.getItem("cpcheckCustomServer");
  (SERV[s] || s === "custom") && (serverSel.value = s);
  custom !== null && (customServer.value = custom);
  o !== null &&
    ((cpAlpha = Math.min(1, Math.max(0, +o / 100))),
    (cpOpacity.value = Math.round(cpAlpha * 100)));
} catch {}
const updateServer = () => {
    customFields.hidden = serverSel.value !== "custom";
    listReady = 0;
    selCP.hidden = true;
    selCP.innerHTML = '<option value="">Elige CP</option>';
    try { localStorage.setItem("cpcheckServer", serverSel.value); } catch {}
  },
  updateCustomServer = () => {
    listReady = 0;
    selCP.hidden = true;
    try { localStorage.setItem("cpcheckCustomServer", customServer.value.trim()); } catch {}
  },
  updateOpacity = () => {
    const v = +cpOpacity.value;
    cpAlpha = v / 100;
    cpOpacityValue.textContent = v + " %";
    if (ready) {
      cpLayer.setOpacity(cpAlpha);
      cpLayer.setVisible(v > 0);
    }
    try {
      localStorage.setItem("cpcheckOpacity", v);
    } catch {}
  };
serverSel.onchange = updateServer;
customServer.oninput = updateCustomServer;
customFields.hidden = serverSel.value !== "custom";
cpOpacity.oninput = updateOpacity;
updateOpacity();
const makeQ = (pc) =>
    `[out:json][timeout:60];rel(1311341);map_to_area;nwr["addr:postcode"="${esc(
      pc
    )}"](area);out center qt;nwr(around:50)["addr:postcode"]["addr:postcode"!="${esc(
      pc
    )}"];out center qt;`,
  makePostpassQ = (pc) => {
    const match = sqlEsc(JSON.stringify({ "addr:postcode": pc }));
    return `WITH area AS MATERIALIZED (
SELECT geom FROM postpass_polygon WHERE osm_type='R' AND osm_id=1311341
), objetivo AS MATERIALIZED (
SELECT p.osm_type,p.osm_id,p.tags,p.geom
FROM postpass_pointlinepolygon p JOIN area a ON p.geom && a.geom
WHERE p.tags @> '${match}'::jsonb
AND p.geom && ST_MakeEnvelope(-19,27,5,45,4326)
AND ST_Intersects(a.geom,ST_PointOnSurface(p.geom))
), extension AS MATERIALIZED (
SELECT ST_Expand(ST_SetSRID(ST_Extent(geom)::geometry,4326),0.001) AS caja,
32601+floor((ST_X(ST_Centroid(ST_SetSRID(ST_Extent(geom)::geometry,4326)))+180)/6)::integer AS srid
FROM objetivo
), objetivos_m AS MATERIALIZED (
SELECT o.osm_type,o.osm_id,o.tags,o.geom,ST_Transform(o.geom,e.srid) AS geom_m
FROM objetivo o CROSS JOIN extension e
), candidatos AS MATERIALIZED (
SELECT p.osm_type,p.osm_id,p.tags,p.geom,ST_Transform(p.geom,e.srid) AS geom_m
FROM postpass_pointlinepolygon p CROSS JOIN extension e
WHERE p.tags ? 'addr:postcode'
AND p.tags->>'addr:postcode'<>'${sqlEsc(pc)}'
AND p.geom && ST_MakeEnvelope(-19,27,5,45,4326)
AND p.geom && e.caja
), resultados AS (
SELECT osm_type,osm_id,tags,geom,0 AS grupo FROM objetivo
UNION ALL
SELECT c.osm_type,c.osm_id,c.tags,c.geom,1 AS grupo FROM candidatos c
WHERE EXISTS (
SELECT 1 FROM objetivos_m o
WHERE o.geom && ST_Expand(c.geom,0.001)
AND ST_DWithin(o.geom_m,c.geom_m,50)
)
)
SELECT DISTINCT ON (osm_type,osm_id)
osm_type,osm_id,tags,ST_PointOnSurface(geom) AS geom,
CASE grupo WHEN 0 THEN 'objetivo' ELSE 'vecino' END AS grupo
FROM resultados
ORDER BY osm_type,osm_id,grupo,ST_Dimension(geom) DESC`;
  },
  popHTML = (x) =>
    `<div class="popup-container"><div class="popup-title">📫 ${h(
      x.postcode
    )}</div><div class="popup-table"><table>${Object.entries(x.tags)
      .map(([k, v]) => `<tr><td>${h(k)}</td><td>${h(v)}</td></tr>`)
      .join(
        ""
      )}</table></div><div class="popup-buttons"><a href="https://www.openstreetmap.org/${
      x.type
    }/${
      x.id
    }" target="_blank" rel="noopener" title="Ver en OSM">🔍</a><a href="https://www.openstreetmap.org/edit?${
      x.type
    }=${
      x.id
    }" target="_blank" rel="noopener" title="Editar con iD">✏️</a></div></div>`,
  infoHTML = (rows) =>
    `<div class="popup-container"><div class="popup-title">ℹ️ Info Extra</div><div class="popup-table"><table>${rows
      .map(([k, v]) => `<tr><td>${h(k)}</td><td>${h(v)}</td></tr>`)
      .join("")}</table></div></div>`;
const blur = (a) => map.getViewport().classList.toggle("blur", !!a),
  openPopup = (ll, html, kind = "item") => {
    pop?.remove();
    blur(1);
    const element = document.createElement("div");
    element.className = "custom-popup";
    element.innerHTML = `<button class="custom-popup-close" type="button" aria-label="Cerrar">✕</button>${html}`;
    const overlay = new Overlay({
      element,
      positioning: "bottom-center",
      offset: [0, -14],
      stopEvent: true,
      autoPan: { animation: { duration: 200 } }
    });
    overlay.setPosition(fromLonLat(ll));
    map.addOverlay(overlay);
    const p = {
      remove: () => {
        map.removeOverlay(overlay);
        element.remove();
        if (pop === p) {
          pop = null;
          popKind = null;
          blur(0);
        }
      }
    };
    element.querySelector(".custom-popup-close").onclick = () => p.remove();
    pop = p;
    popKind = kind;
    return p;
  },
  showTip = (coordinate, postcode) => {
    if (!tip) {
      const element = document.createElement("div");
      element.className = "cp-tip";
      const overlay = new Overlay({ element, positioning: "bottom-center", offset: [0, -10], stopEvent: false });
      map.addOverlay(overlay);
      tip = {
        set: (where, text) => {
          element.textContent = text;
          overlay.setPosition(where);
        },
        remove: () => {
          map.removeOverlay(overlay);
          element.remove();
          tip = null;
        }
      };
    }
    tip.set(coordinate, postcode);
  };
const loadValidCP = async () => {
  if (validCP) return validCP;
  ovLine("Cargando códigos postales válidos del proyecto");
  let r;
  try {
    r = await fetch(validCPUrl, { cache: "no-store" });
  } catch (e) {
    throw Error(
      "No se pudo cargar el archivo local de CP válidos: " + (e.message || e)
    );
  }
  if (!r.ok)
    throw Error("No se pudo cargar el archivo local de CP válidos: HTTP " + r.status);
  const a = (await r.text())
    .trim()
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (!a.length)
    throw Error("El archivo de CP válidos está vacío o no tiene formato válido");
  validCP = new Set(a);
  ovLine(`Archivo local cargado correctamente: ${validCP.size} CP válidos`);
  return validCP;
};
const pointsSource = new VectorSource({ wrapX: false }),
  lassoSource = new VectorSource({ wrapX: false }),
  geojson = new GeoJSON(),
  baseLayer = new TileLayer({ className: "gray-base-layer", source: new OSM({ referrerPolicy: "strict-origin-when-cross-origin", transition: 0 }) }),
  cpLayer = new TileLayer({
    source: new TileWMS({
      url: "https://www.cartociudad.es/wms-inspire/direcciones-ccpp",
      params: { LAYERS: "codigo-postal", VERSION: "1.3.0", FORMAT: "image/png", TRANSPARENT: true },
      attributions: "CartoCiudad",
      transition: 0
    }),
    opacity: cpAlpha,
    visible: cpAlpha > 0,
    minZoom: 5,
    maxZoom: 20
  }),
  pointsLayer = new WebGLVectorLayer({
    source: pointsSource,
    variables: { selected: "__none__", current: "__none__" },
    style: {
      "circle-radius": ["case", ["==", ["get", "postcode"], ["var", "selected"]], 10, 6],
      "circle-fill-color": ["case", ["==", ["get", "postcode"], ["var", "current"]], "#19d67b", "#ff5a3c"],
      "circle-stroke-color": ["case", ["==", ["get", "postcode"], ["var", "selected"]], "#ffd700", ["==", ["get", "postcode"], ["var", "current"]], "#ffffff", "#210b00"],
      "circle-stroke-width": ["case", ["==", ["get", "postcode"], ["var", "selected"]], 3, 1.5],
      "circle-opacity": ["case", ["==", ["get", "postcode"], ["var", "selected"]], 1, 0.9]
    }
  }),
  lassoLayer = new VectorLayer({
    source: lassoSource,
    style: {
      "fill-color": "rgba(255,215,0,0.16)",
      "stroke-color": "#ffd700",
      "stroke-width": 3,
      "circle-radius": 5,
      "circle-fill-color": "#ffd700",
      "circle-stroke-color": "#001943",
      "circle-stroke-width": 2
    }
  }),
  map = new OLMap({
    target: "map",
    layers: [baseLayer, cpLayer, pointsLayer, lassoLayer],
    view: new View({ center: fromLonLat([2.14, 41.4]), zoom: 14, minZoom: 5, maxZoom: 19 })
  }),
  doubleZoom = map.getInteractions().getArray().find((x) => x instanceof DoubleClickZoom),
  setData = (s, d) => {
    if (s === "lasso") {
      lassoSource.clear(true);
      lassoSource.addFeatures(geojson.readFeatures(d, { featureProjection: "EPSG:3857" }));
    } else {
      pointsSource.clear(true);
    }
  },
  fit = (a) => {
    if (!a.length) return;
    const extent = createEmpty();
    a.forEach((x) => extendCoordinate(extent, fromLonLat([x.lon, x.lat])));
    if (!isEmpty(extent)) map.getView().fit(extent, { padding: [20, 20, 20, 20], maxZoom: 18, duration: 450 });
  },
  paint = () => pointsLayer.updateStyleVariables({ selected: act || "__none__", current: currentPC || "__none__" });
ready = 1;
updateOpacity();
const allFit = () => fit(items),
  focus = (c) => {
    act = c;
    paint();
    [...ll.children].forEach((x) =>
      x.classList.toggle("active", x.dataset.cp === c)
    );
    fit(groups[c] || []);
  },
  resetFocus = () => {
    act = null;
    paint();
    [...ll.children].forEach((x) => x.classList.remove("active"));
    allFit();
  },
  legend = (pc) => {
    lt.textContent = `${pc} (${groups[pc]?.length || 0})`;
    ll.innerHTML = "";
    Object.entries(groups)
      .filter(([k]) => k !== pc)
      .sort((a, b) => b[1].length - a[1].length)
      .forEach(([c, a]) => {
        const li = document.createElement("li");
        li.dataset.cp = c;
        li.textContent = `${c} (${a.length})`;
        ll.append(li);
        li.onclick = () => (act === c ? resetFocus() : focus(c));
      });
    lt.onclick = () => (act === pc ? resetFocus() : focus(pc));
  };
const drawData = (d, pc) => {
  pop?.remove();
  tip?.remove();
  pop = tip = null;
  popKind = null;
  blur(0);
  currentPC = pc;
  act = null;
  items = [];
  byId = new globalThis.Map();
  Object.keys(groups).forEach((k) => delete groups[k]);
  if (!d.elements?.length) {
    pointsSource.clear(true);
    legend(pc);
    ovLine("Sin resultados");
    ovClose(1);
    alert("Sin resultados");
    return;
  }
  const fs = [];
  d.elements.forEach(({ id, tags = {}, lat, lon, center, type }) => {
    const y = center?.lat ?? lat,
      x = center?.lon ?? lon,
      postcode = tags["addr:postcode"];
    if (y == null || x == null || !postcode) return;
    const o = {
      id,
      type,
      qt: type === "relation" ? "rel" : type,
      lat: y,
      lon: x,
      postcode,
      tags,
      uid: `${type}/${id}`
    };
    items.push(o);
    byId.set(o.uid, o);
    (groups[postcode] ??= []).push(o);
    fs.push(new Feature({ geometry: new Point(fromLonLat([x, y])), uid: o.uid, postcode }));
  });
  pointsSource.clear(true);
  pointsSource.addFeatures(fs);
  paint();
  fit(items);
  legend(pc);
};
const within = (p, a) => {
    let r = 0;
    for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
      const [x, y] = a[i],
        [x2, y2] = a[j];
      y > p[1] !== y2 > p[1] &&
        p[0] < ((x2 - x) * (p[1] - y)) / (y2 - y) + x &&
        (r = !r);
    }
    return r;
  },
  updateLasso = () => {
    const f = pts.map((p, i) => ({
      type: "Feature",
      id: "v" + i,
      properties: { i },
      geometry: { type: "Point", coordinates: p }
    }));
    pts.length > 1 &&
      f.push({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: pts }
      });
    pts.length > 2 &&
      f.push({
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [[...pts, pts[0]]] }
      });
    setData("lasso", { type: "FeatureCollection", features: f });
  },
  clearLasso = () => {
    draw = 0;
    pts = [];
    setData("lasso", { type: "FeatureCollection", features: [] });
    btnSel.classList.remove("active");
    doubleZoom?.setActive(true);
    map.getTargetElement().style.cursor = infoMode ? "help" : "";
  };
const sendJOSM = async (ids) => {
  const objects = [...new Set([...ids.node.map((id) => `n${id}`), ...ids.way.map((id) => `w${id}`), ...ids.rel.map((id) => `r${id}`)])];
  for (let i = 0; i < objects.length; i += 100) {
    const params = new URLSearchParams({ objects: objects.slice(i, i + 100).join(","), new_layer: "false", relation_members: "true" });
    const response = await fetch("http://127.0.0.1:8111/load_object?" + params);
    if (!response.ok) throw Error(`JOSM rechazó la descarga (HTTP ${response.status})`);
  }
};
const menu = (q, pc, ids) => {
    $("qMenu")?.remove();
    const m = document.createElement("div");
    m.id = "qMenu";
    m.innerHTML = `<div class="qBox"><div class="qLabel">Seleccionado solo CP ${h(
      pc
    )}</div><div class="qRow"><button data-a="copy" title="Copiar consulta">📋</button><button data-a="turbo" title="Abrir en OverpassTurbo">🚀</button><button data-a="josm" title="Enviar a JOSM">🗺️</button></div></div>`;
    m.onclick = (e) => {
      if (e.target === m) return m.remove();
      const a = e.target.closest("[data-a]")?.dataset.a;
      if (!a) return;
      a === "copy" && clip(q);
      a === "turbo" &&
        window.open(
          "https://overpass-turbo.eu/?Q=" + encodeURIComponent(q) + "&R",
          "_blank",
          "noopener"
        );
      if (a === "josm") {
        m.remove();
        sendJOSM(ids).catch((e) => alert(`${e.message || e}. Comprueba que JOSM está abierto y tiene activado el control remoto.`));
        return;
      }
      m.remove();
    };
    document.body.append(m);
  },
  selectPoly = (a) => {
    const pc = act || currentPC,
      ids = { node: [], way: [], rel: [] };
    (groups[pc] || []).forEach(
      (x) => within([x.lon, x.lat], a) && ids[x.qt].push(x.id)
    );
    if (!ids.node.length && !ids.way.length && !ids.rel.length)
      return alert("Nada seleccionado");
    const p = [];
    ids.node.length && p.push(`node(id:${ids.node});`);
    ids.way.length && p.push(`way(id:${ids.way});`);
    ids.rel.length && p.push(`rel(id:${ids.rel});`);
    menu(`[out:xml][timeout:60];(\n${p.join("\n")}\n);(._;>;);out meta;`, pc, ids);
  },
  endDraw = () => {
    if (!draw) return;
    const a = [];
    pts.forEach((p) => {
      const q = a[a.length - 1];
      (!q || Math.abs(q[0] - p[0]) > 1e-9 || Math.abs(q[1] - p[1]) > 1e-9) &&
        a.push(p);
    });
    clearLasso();
    a.length < 3 ? alert("Dibuja al menos 3 puntos") : selectPoly(a);
  },
  addPoint = (e) => {
    const p = toLonLat(e.coordinate);
    if (pts.length > 2) {
      const a = map.getPixelFromCoordinate(fromLonLat(p)),
        b = map.getPixelFromCoordinate(fromLonLat(pts[0]));
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 12) return endDraw();
    }
    pts.push(p);
    updateLasso();
  };
const requestData = async (mode, pc, s, label) => {
  ovOpen(label);
  let v;
  try { v = srv(); } catch (e) { ovLine(e.message, 1); ovTitle.textContent = "Error"; ovClose(0); throw e; }
  setOverlay(s, `Servidor: ${v.name}`);
  let ctl = new AbortController(),
    kill = setTimeout(() => ctl.abort(), s * 1e3),
    isPostpass = v.kind === "postpass",
    q = isPostpass ? (mode === "list" ? postpassListQuery : makePostpassQ(pc)) : (mode === "list" ? listQuery : makeQ(pc)),
    body = new URLSearchParams({ data: q });
  if (isPostpass && mode === "list") body.set("options[geojson]", "false");
  try {
    const r = await fetch(v.url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", Accept: "application/json, text/plain, */*" }, body, signal: ctl.signal });
    if (!r.ok) throw Error("HTTP " + r.status + (r.status === 403 ? " (comprueba tu API key)" : ""));
    const t = await r.text();
    if (!isPostpass && (/^\s*(?:<\?xml|<!doctype|<html)/i.test(t) || /<strong[^>]*>\s*Error\s*<\/strong>/i.test(t))) {
      if (/duplicate_query/i.test(t)) throw Error("Overpass rechazó la consulta duplicada (duplicate_query). Vuelve a intentarlo o cambia de servidor en Configuración.");
      const detail = t.match(/(?:runtime error:|<strong[^>]*>\s*Error\s*<\/strong>\s*:)[\s\S]{0,180}/i)?.[0].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      throw Error(`Overpass devolvió una página de error, no datos${detail ? ": " + detail : ""}`);
    }
    let out;
    try { out = isPostpass || mode === "map" ? JSON.parse(t) : t; } catch { throw Error("Respuesta JSON no válida"); }
    if (isPostpass) out = mode === "map" ? convertPostpass(out) : parsePostpassList(out);
    if (isPostpass && mode === "map") {
      const exact = out.elements.filter((x) => x.tags["addr:postcode"] === pc).length;
      ovLine(`${exact} elementos del CP ${pc} y ${out.elements.length - exact} vecinos a 50 metros`);
    } else if (!isPostpass && mode === "list") out = parseOverpassList(out);
    if (out == null || (mode === "list" && (!Array.isArray(out) || !out.length)) || (mode === "map" && !Array.isArray(out.elements))) throw Error(mode === "list" ? `${v.name} no devolvió códigos postales válidos` : "Respuesta vacía o inválida");
    clearTimeout(kill);
    clearInterval(timer);
    ovLine(`Respuesta válida desde ${v.name}`);
    return out;
  } catch (e) {
    clearTimeout(kill);
    clearInterval(timer);
    ovLine(`${v.name}: ${e.name === "AbortError" ? "Tiempo agotado" : e.message || e}`, 1);
    throw e;
  }
};
const convertPostpass = (data) => {
  if (data?.type !== "FeatureCollection" || !Array.isArray(data.features)) throw Error("Postpass no devolvió GeoJSON válido");
  const seen = new Set(), elements = [];
  for (const f of data.features) {
    const p = f.properties || {}, g = f.geometry;
    const types = { N: "node", W: "way", R: "relation" };
    const type = types[p.osm_type], id = Number(p.osm_id);
    if (!type || !Number.isFinite(id) || g?.type !== "Point" || !Array.isArray(g.coordinates)) continue;
    const uid = `${type}/${id}`;
    if (seen.has(uid)) continue;
    seen.add(uid);
    elements.push({ type, id, lon: g.coordinates[0], lat: g.coordinates[1], tags: p.tags || {} });
  }
  return { elements };
};
const parsePostpassList = (data) => {
  if (!Array.isArray(data?.result)) throw Error("Postpass no devolvió una tabla válida");
  const rows = data.result.map((row) => ({ pc: String(row.postcode ?? ""), c: Number(row.total ?? row.count) })).filter((row) => Number.isFinite(row.c));
  if (!rows.length) throw Error("Postpass devolvió un listado vacío o sin recuentos válidos");
  return rows;
};
const parseOverpassList = (txt) => String(txt).trim().split("\n").filter((l) => l && l !== "postcode\tcount").map((l) => {
  const i = l.lastIndexOf("\t");
  if (i < 0) return null;
  let pc = l.slice(0, i);
  if (pc[0] === '"' && pc[pc.length - 1] === '"') pc = pc.slice(1, -1);
  return { pc, c: +l.slice(i + 1) };
}).filter((v) => v && Number.isFinite(v.c));
const run = (open) => {
  const pc = pi.value.trim();
  if (!pc) return alert("Indica un código postal");
  const q = makeQ(pc);
  if (open) {
    const st = `{{style:
node[addr:postcode]{color:black;fill-color:red}
node[addr:postcode=${esc(pc)}]{color:green;fill-color:green}
}}`;
    return window.open(
      "https://overpass-turbo.eu/?Q=" + encodeURIComponent(q + st) + "&R",
      "_blank",
      "noopener"
    );
  }
  requestData("map", pc, 60, "Consulta " + (serverSel.value === "postpass" ? "Postpass" : "Overpass"))
    .then((d) => {
      drawData(d, pc);
      ovClose(1);
    })
    .catch((e) => {
      ovTitle.textContent = "Error";
      ovLine(e.message || String(e), 1);
      ovClose(0);
    });
};
const listQuery =
  '[out:csv("postcode","count";false)][timeout:300];area(3601311341)->.a;nwr["addr:postcode"](area.a);for(t["addr:postcode"]){make stat postcode=_.val,count=count(nwr);out;}';
const postpassListQuery = `WITH esp AS MATERIALIZED (
SELECT geom
FROM postpass_polygon
WHERE osm_type='R' AND osm_id=1311341
)
SELECT p.tags->>'addr:postcode' AS postcode,
COUNT(DISTINCT (p.osm_type,p.osm_id)) AS total
FROM esp e
JOIN postpass_pointlinepolygon p ON p.geom && e.geom
WHERE p.tags ? 'addr:postcode'
AND p.geom && ST_MakeEnvelope(-18.3,27.5,4.5,44.1,4326)
AND ST_Intersects(e.geom,ST_PointOnSurface(p.geom))
GROUP BY 1
ORDER BY total DESC,postcode`;
const fetchList = async () => {
  listReady = 0;
  btnList.disabled = 1;
  try {
    const arr = await requestData("list", "", 300, "Listado de CP OSM"),
      valid = await loadValidCP();
    arr.sort((a, b) => {
      const va = /^\d{5}$/.test(a.pc), vb = /^\d{5}$/.test(b.pc);
      return va !== vb ? (va ? 1 : -1) : a.c - b.c;
    });
    const ok = (v) => {
        const a = split(v);
        return a.length && a.every((x) => valid.has(x) || special(x));
      },
      bad = [],
      off = [],
      oth = [];
    arr.forEach((o) =>
      !ok(o.pc) ? bad.push(o) : special(o.pc) ? off.push(o) : oth.push(o)
    );
    const ordered = [...bad, ...off, ...oth];
    selCP.innerHTML = '<option value="">Elige CP</option>';
    ordered.forEach((o) =>
      selCP.append(
        new Option(
          `${!ok(o.pc) ? "🚫 " : special(o.pc) ? "🏛️ " : ""}${o.pc} (${o.c})`,
          o.pc
        )
      )
    );
    selCP.hidden = 0;
    ovLine(`Listado generado: ${ordered.length} valores de addr:postcode`);
    listReady = 1;
    btnList.disabled = 0;
    ovClose(1);
  } catch (e) {
    ovTitle.textContent = "Error";
    ovLine(e.message || String(e), 1);
    ovLine(
      "No se ha generado el listado para evitar falsos 🚫 por falta de validación.",
      1
    );
    btnList.disabled = 0;
    ovClose(0);
  }
};
const extra = async (e) => {
  if (!infoMode || draw) return;
  const [lng, lat] = toLonLat(e.coordinate);
  ovOpen("Info extra");
  ovLine("Consultando Cartociudad");
  try {
    const r = await fetch(
      `https://www.cartociudad.es/geocoder/api/geocoder/reverseGeocode?lon=${lng}&lat=${lat}`
    );
    if (!r.ok) throw Error("HTTP " + r.status);
    const d = await r.json(),
      rows = [
        ["Código postal", d.postalCode],
        ["Dirección", d.address?.trim()],
        ["Tipo vía", d.tip_via],
        ["Portal", d.portalNumber],
        ["Municipio", d.muni],
        ["Provincia", d.province],
        ["C. Autónoma", d.comunidadAutonoma],
        ["Ref. Catastral", d.refCatastral],
        ["Lat/Lon", `${d.lat ?? lat}, ${d.lng ?? lng}`]
      ].filter(([, v]) => v);
    openPopup([lng, lat], infoHTML(rows), "info");
    ovLine("Consulta completada");
    ovClose(1);
  } catch (e) {
    ovTitle.textContent = "Error";
    ovLine(e.message || String(e), 1);
    ovClose(0);
  }
};
map.on("pointermove", (e) => {
  if (e.dragging || draw || infoMode || pop) {
    tip?.remove();
    if (!draw) map.getTargetElement().style.cursor = infoMode ? "help" : "";
    return;
  }
  const f = map.forEachFeatureAtPixel(e.pixel, (feature, layer) => layer === pointsLayer ? feature : null, { hitTolerance: 4 });
  if (!f) {
    tip?.remove();
    map.getTargetElement().style.cursor = "";
    return;
  }
  map.getTargetElement().style.cursor = "pointer";
  showTip(e.coordinate, f.get("postcode"));
});
map.getViewport().addEventListener("pointerleave", () => {
  tip?.remove();
  if (!draw) map.getTargetElement().style.cursor = infoMode ? "help" : "";
});
map.on("singleclick", (e) => {
  if (draw) return addPoint(e);
  if (infoMode) return extra(e);
  const f = map.forEachFeatureAtPixel(e.pixel, (feature, layer) => layer === pointsLayer ? feature : null, { hitTolerance: 4 });
  const x = f && byId.get(f.get("uid"));
  if (x) {
    tip?.remove();
    openPopup([x.lon, x.lat], popHTML(x));
  } else {
    pop?.remove();
  }
});
map.on("dblclick", (e) => {
  if (draw) {
    e.preventDefault();
    endDraw();
  }
});
paint();
pi.onkeypress = (e) => {
  e.key === "Enter" && (e.preventDefault(), btnQ.click());
};
selCP.onchange = () => {
  selCP.value && ((pi.value = selCP.value), btnQ.click());
};
btnQ.onclick = () => run(0);
btnO.onclick = () => run(1);
btnSel.onclick = () => {
  if (!currentPC) return alert("Consulta primero un código postal");
  if (draw) return clearLasso();
  pop?.remove();
  tip?.remove();
  pop = tip = null;
  draw = 1;
  pts = [];
  updateLasso();
  btnSel.classList.add("active");
  doubleZoom?.setActive(false);
  map.getTargetElement().style.cursor = "crosshair";
};
btnList.onclick = () => {
  if (listReady && !confirm("Listado ya generado, ¿actualizar?")) return;
  fetchList();
};
btnInfo.onclick = () => {
  infoMode = !infoMode;
  btnInfo.classList.toggle("active", infoMode);
  draw && clearLasso();
  tip?.remove();
  tip = null;
  if (!infoMode && popKind === "info") pop?.remove();
  map.getTargetElement().style.cursor = infoMode ? "help" : "";
};
