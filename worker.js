const DEFAULT_CONFIG = {
  latitude: 39.9087,
  longitude: 116.3975,
  altitude: 44,
  horizontalAccuracy: 15,
  verticalAccuracy: 30,
  enabled: true,
  updatedAt: 0,
  version: 1
};

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...extraHeaders
    }
  });
}

function corsPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
    }
  });
}

function validLatitude(value) {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function validLongitude(value) {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, n));
}

function normalizeConfig(input) {
  const source = input || {};

  const latitude = Number(source.latitude);
  const longitude = Number(source.longitude);

  if (!validLatitude(latitude)) {
    throw new Error("Invalid latitude");
  }

  if (!validLongitude(longitude)) {
    throw new Error("Invalid longitude");
  }

  return {
    latitude,
    longitude,

    altitude: clampNumber(
      source.altitude,
      DEFAULT_CONFIG.altitude,
      -500,
      10000
    ),

    horizontalAccuracy: clampNumber(
      source.horizontalAccuracy,
      DEFAULT_CONFIG.horizontalAccuracy,
      1,
      10000
    ),

    verticalAccuracy: clampNumber(
      source.verticalAccuracy,
      DEFAULT_CONFIG.verticalAccuracy,
      1,
      10000
    ),

    enabled:
      source.enabled === false ||
      String(source.enabled).toLowerCase() === "false"
        ? false
        : true,

    updatedAt: Number(source.updatedAt) || Date.now(),

    version: Number(source.version) || 1
  };
}

async function getConfig(env) {
  const stored = await env.LOCATION_KV.get("loc_config", {
    type: "json"
  });

  if (!stored) {
    return {
      ...DEFAULT_CONFIG
    };
  }

  try {
    return normalizeConfig(stored);
  } catch {
    return {
      ...DEFAULT_CONFIG
    };
  }
}

async function saveConfig(env, config) {
  const normalized = normalizeConfig({
    ...config,
    updatedAt: Date.now(),
    version: 1
  });

  await env.LOCATION_KV.put(
    "loc_config",
    JSON.stringify(normalized)
  );

  return normalized;
}

function authorized(url, env) {
  if (!env.TOKEN) {
    return false;
  }

  const token = url.searchParams.get("token");

  return Boolean(token && token === env.TOKEN);
}

async function readRequestBody(request) {
  const contentType =
    request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return await request.json();
  }

  const text = await request.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function handleSet(request, url, env) {
  let input = {};

  if (request.method === "POST") {
    input = await readRequestBody(request);
  } else {
    input = {
      latitude: url.searchParams.get("lat"),
      longitude: url.searchParams.get("lng"),
      altitude: url.searchParams.get("alt"),
      enabled: url.searchParams.get("enabled")
    };
  }

  const current = await getConfig(env);

  const latitude = Number(
    input.latitude ??
    input.lat ??
    current.latitude
  );

  const longitude = Number(
    input.longitude ??
    input.lng ??
    input.lon ??
    current.longitude
  );

  if (!validLatitude(latitude)) {
    return json(
      {
        success: false,
        error: "Invalid latitude"
      },
      400
    );
  }

  if (!validLongitude(longitude)) {
    return json(
      {
        success: false,
        error: "Invalid longitude"
      },
      400
    );
  }

  const enabled =
    input.enabled === undefined ||
    input.enabled === null
      ? current.enabled
      : !(
          input.enabled === false ||
          String(input.enabled).toLowerCase() === "false"
        );

  const config = await saveConfig(env, {
    latitude,
    longitude,
    altitude:
      input.altitude ??
      input.alt ??
      current.altitude,

    horizontalAccuracy:
      input.horizontalAccuracy ??
      current.horizontalAccuracy,

    verticalAccuracy:
      input.verticalAccuracy ??
      current.verticalAccuracy,

    enabled
  });

  return json({
    success: true,
    data: config
  });
}

async function handleEnable(request, url, env) {
  let enabled;

  if (request.method === "POST") {
    const body = await readRequestBody(request);

    enabled =
      body.enabled === undefined
        ? true
        : !(
            body.enabled === false ||
            String(body.enabled).toLowerCase() === "false"
          );
  } else {
    const value = url.searchParams.get("enabled");

    enabled =
      value === null
        ? true
        : !(
            value === "false" ||
            value === "0" ||
            value === "off"
          );
  }

  const current = await getConfig(env);

  const config = await saveConfig(env, {
    ...current,
    enabled
  });

  return json({
    success: true,
    data: config
  });
}

function renderHtml(token, initialConfig) {
  const safeToken = JSON.stringify(token);
  const initial = JSON.stringify(initialConfig);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">

<meta
  name="viewport"
  content="width=device-width,
  initial-scale=1,
  maximum-scale=1,
  user-scalable=no"
>

<title>xloc 定位控制台</title>

<link
  rel="stylesheet"
  href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
/>

<script
  src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js">
</script>

<style>

html,
body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

#map {
  width: 100%;
  height: 100%;
}

.panel {
  position: absolute;
  z-index: 1000;

  top: 15px;
  left: 15px;
  right: 15px;

  max-width: 380px;

  padding: 16px;

  border-radius: 14px;

  background:
    rgba(255,255,255,.95);

  box-shadow:
    0 8px 30px
    rgba(0,0,0,.18);
}

.title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 12px;
}

.search {
  display: flex;
  gap: 8px;
}

.search input {
  flex: 1;

  min-width: 0;

  padding: 11px;

  border: 1px solid #ccc;
  border-radius: 9px;

  font-size: 14px;
}

button {
  border: 0;
  border-radius: 9px;

  padding: 11px 14px;

  font-size: 14px;
  font-weight: 600;

  cursor: pointer;
}

.search button {
  background: #007aff;
  color: white;
}

.info {
  margin-top: 12px;

  padding: 12px;

  border-radius: 9px;

  background: #f2f2f7;

  font-size: 13px;

  line-height: 1.8;
}

.status {
  font-weight: 700;
}

.status.on {
  color: #1c9c45;
}

.status.off {
  color: #ff3b30;
}

.action {
  width: 100%;

  margin-top: 10px;

  background: #007aff;
  color: white;
}

.disable {
  background: #ff3b30;
}

</style>
</head>

<body>

<div class="panel">

  <div class="title">
    📍 xloc 定位控制台
  </div>

  <div class="search">

    <input
      id="search"
      placeholder="搜索地点，例如：故宫"
    >

    <button id="searchButton">
      搜索
    </button>

  </div>

  <div class="info">

    <div>
      状态：
      <span id="status" class="status">
        --
      </span>
    </div>

    <div>
      地点：
      <span id="name">
        --
      </span>
    </div>

    <div>
      纬度：
      <span id="lat">
        --
      </span>
    </div>

    <div>
      经度：
      <span id="lng">
        --
      </span>
    </div>

    <div>
      海拔：
      <span id="alt">
        --
      </span>
      m
    </div>

    <div>
      更新时间：
      <span id="updated">
        --
      </span>
    </div>

  </div>

  <button
    id="save"
    class="action"
  >
    💾 保存并启用
  </button>

  <button
    id="disable"
    class="action disable"
  >
    🚫 恢复真实定位
  </button>

</div>

<div id="map"></div>

<script>

const TOKEN = ${safeToken};

let state = ${initial};

let marker = null;

const map =
  L.map("map")
   .setView(
     [
       Number(state.latitude),
       Number(state.longitude)
     ],
     13
   );

L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    maxZoom: 19
  }
).addTo(map);

function setText(id, value) {

  document.getElementById(id).textContent =
    value;

}

function updateUI() {

  setText(
    "lat",
    Number(state.latitude).toFixed(7)
  );

  setText(
    "lng",
    Number(state.longitude).toFixed(7)
  );

  setText(
    "alt",
    Number(state.altitude).toFixed(1)
  );

  setText(
    "name",
    state.name || "地图选点"
  );

  setText(
    "updated",
    state.updatedAt
      ? new Date(state.updatedAt)
          .toLocaleString()
      : "--"
  );

  const status =
    document.getElementById("status");

  if (state.enabled) {

    status.textContent =
      "🟢 模拟定位已开启";

    status.className =
      "status on";

  } else {

    status.textContent =
      "🔴 模拟定位已关闭";

    status.className =
      "status off";
  }
}

function setMarker(
  lat,
  lng,
  move
) {

  if (marker) {

    map.removeLayer(marker);
  }

  marker =
    L.marker([lat, lng])
     .addTo(map);

  if (move) {

    map.setView(
      [lat, lng],
      15
    );
  }
}

async function getElevation(
  lat,
  lng
) {

  try {

    const response =
      await fetch(
        "https://api.open-meteo.com/v1/elevation" +
        "?latitude=" +
        encodeURIComponent(lat) +
        "&longitude=" +
        encodeURIComponent(lng)
      );

    const data =
      await response.json();

    if (
      data &&
      Array.isArray(data.elevation) &&
      data.elevation.length
    ) {

      state.altitude =
        Number(data.elevation[0]);
    }

  } catch (error) {

    console.log(
      "elevation error",
      error
    );
  }

  updateUI();
}

async function selectLocation(
  lat,
  lng,
  name
) {

  state.latitude =
    Number(lat);

  state.longitude =
    Number(lng);

  state.name =
    name || "地图选点";

  setMarker(
    state.latitude,
    state.longitude,
    true
  );

  await getElevation(
    state.latitude,
    state.longitude
  );
}

map.on(
  "click",
  event => {

    selectLocation(
      event.latlng.lat,
      event.latlng.lng,
      "地图手动选点"
    );
  }
);

async function searchLocation() {

  const input =
    document.getElementById(
      "search"
    );

  const query =
    input.value.trim();

  if (!query) return;

  const button =
    document.getElementById(
      "searchButton"
    );

  button.disabled = true;
  button.textContent = "搜索中";

  try {

    const response =
      await fetch(
        "https://nominatim.openstreetmap.org/search" +
        "?format=json" +
        "&limit=1" +
        "&q=" +
        encodeURIComponent(query)
      );

    const results =
      await response.json();

    if (!results.length) {

      alert(
        "没有找到该地点"
      );

      return;
    }

    const result =
      results[0];

    await selectLocation(
      Number(result.lat),
      Number(result.lon),
      result.display_name
    );

  } catch (error) {

    alert(
      "搜索失败：" +
      error.message
    );

  } finally {

    button.disabled = false;
    button.textContent = "搜索";
  }
}

async function saveLocation() {

  const button =
    document.getElementById(
      "save"
    );

  button.disabled = true;
  button.textContent = "保存中...";

  try {

    const response =
      await fetch(
        "/set?token=" +
        encodeURIComponent(TOKEN),
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({

            latitude:
              Number(state.latitude),

            longitude:
              Number(state.longitude),

            altitude:
              Number(state.altitude),

            horizontalAccuracy:
              15,

            verticalAccuracy:
              30,

            enabled:
              true
          })
        }
      );

    const result =
      await response.json();

    if (!result.success) {

      throw new Error(
        result.error ||
        "保存失败"
      );
    }

    state =
      result.data;

    state.name =
      "当前生效坐标";

    updateUI();

    setMarker(
      state.latitude,
      state.longitude,
      false
    );

    alert(
      "保存成功。\\n\\n" +
      "现在 Shadowrocket 会在下一次 " +
      "Apple /clls/wloc 请求时读取新坐标。"
    );

  } catch (error) {

    alert(
      "保存失败：" +
      error.message
    );

  } finally {

    button.disabled = false;
    button.textContent =
      "💾 保存并启用";
  }
}

async function disableLocation() {

  if (
    !confirm(
      "确定恢复真实定位吗？"
    )
  ) {
    return;
  }

  try {

    const response =
      await fetch(
        "/enable?token=" +
        encodeURIComponent(TOKEN),
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            enabled: false
          })
        }
      );

    const result =
      await response.json();

    if (!result.success) {

      throw new Error(
        result.error ||
        "操作失败"
      );
    }

    state =
      result.data;

    updateUI();

    alert(
      "模拟定位已关闭。"
    );

  } catch (error) {

    alert(
      "操作失败：" +
      error.message
    );
  }
}

document
  .getElementById(
    "searchButton"
  )
  .addEventListener(
    "click",
    searchLocation
  );

document
  .getElementById(
    "search"
  )
  .addEventListener(
    "keydown",
    event => {

      if (
        event.key === "Enter"
      ) {
        searchLocation();
      }
    }
  );

document
  .getElementById(
    "save"
  )
  .addEventListener(
    "click",
    saveLocation
  );

document
  .getElementById(
    "disable"
  )
  .addEventListener(
    "click",
    disableLocation
  );

setMarker(
  Number(state.latitude),
  Number(state.longitude),
  false
);

updateUI();

</script>

</body>
</html>`;
}

export default {

  async fetch(request, env) {

    const url =
      new URL(request.url);

    if (
      request.method === "OPTIONS"
    ) {
      return corsPreflight();
    }

    if (
      !authorized(url, env)
    ) {

      return json(
        {
          error:
            "Unauthorized / Invalid Token"
        },
        401
      );
    }

    try {

      /*
       * GET /health
       *
       * 用于确认 Cloudflare Worker
       * 本身正常。
       */
      if (
        url.pathname === "/health"
      ) {

        return json({
          success: true,
          service: "xloc",
          worker: "online",
          timestamp: Date.now()
        });
      }

      /*
       * GET /loc.json
       *
       * Shadowrocket location.js
       * 读取的位置配置。
       */
      if (
        url.pathname === "/loc.json"
      ) {

        const config =
          await getConfig(env);

        return json(config, 200, {
          "X-Xloc-Config-Version":
            String(config.version || 1),

          "X-Xloc-Updated-At":
            String(config.updatedAt || 0)
        });
      }

      /*
       * GET /config
       *
       * 调试接口。
       */
      if (
        url.pathname === "/config"
      ) {

        const config =
          await getConfig(env);

        return json({
          success: true,
          data: config
        });
      }

      /*
       * POST /set
       *
       * 推荐使用方式。
       */
      if (
        url.pathname === "/set"
      ) {

        if (
          request.method !== "POST" &&
          request.method !== "GET"
        ) {

          return json(
            {
              error:
                "Method Not Allowed"
            },
            405
          );
        }

        return await handleSet(
          request,
          url,
          env
        );
      }

      /*
       * POST /enable
       *
       * 开启/关闭模拟定位。
       */
      if (
        url.pathname === "/enable"
      ) {

        if (
          request.method !== "POST" &&
          request.method !== "GET"
        ) {

          return json(
            {
              error:
                "Method Not Allowed"
            },
            405
          );
        }

        return await handleEnable(
          request,
          url,
          env
        );
      }

      /*
       * Web UI
       */
      if (
        url.pathname === "/"
      ) {

        const config =
          await getConfig(env);

        const htmlConfig = {
          ...config,
          name: "当前生效坐标"
        };

        return new Response(
          renderHtml(
            url.searchParams.get("token"),
            htmlConfig
          ),
          {
            headers: {
              "Content-Type":
                "text/html; charset=utf-8",

              "Cache-Control":
                "no-store"
            }
          }
        );
      }

      return new Response(
        "Not Found",
        {
          status: 404
        }
      );

    } catch (error) {

      return json(
        {
          success: false,
          error:
            error &&
            error.message
              ? error.message
              : String(error)
        },
        500
      );
    }
  }
};
