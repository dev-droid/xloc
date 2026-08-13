export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");

    // 1. 鉴权校验
    if (!env.TOKEN || token !== env.TOKEN) {
      return new Response(JSON.stringify({ error: "Unauthorized / Invalid Token" }), {
        status: 401,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }

    const defaultConfig = {
      latitude: 39.9087,
      longitude: 116.3975,
      altitude: 44,
      horizontalAccuracy: 15,
      verticalAccuracy: 30,
      enabled: true
    };

    // 2. 路由：供小火箭读取的 JSON 接口
    if (url.pathname === "/loc.json") {
      const stored = await env.LOCATION_KV.get("loc_config", { type: "json" });
      const config = stored || defaultConfig;
      return new Response(JSON.stringify(config), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // 3. 路由：前端页面保存新坐标的接口
    if (url.pathname === "/set") {
      const lat = parseFloat(url.searchParams.get("lat"));
      const lng = parseFloat(url.searchParams.get("lng"));
      const enabled = url.searchParams.get("enabled") !== "false";
      
      // 接收前端传入的海拔，如果没有则使用默认值 10
      let alt = parseFloat(url.searchParams.get("alt"));
      if (isNaN(alt)) alt = 10;

      if (isNaN(lat) || isNaN(lng)) {
        return new Response(JSON.stringify({ error: "Invalid coordinates" }), { status: 400 });
      }

      const newConfig = {
        latitude: lat,
        longitude: lng,
        altitude: alt,
        horizontalAccuracy: 15, // 保持合理的GPS水平精度
        verticalAccuracy: 30,   // 保持合理的GPS垂直精度
        enabled: enabled
      };

      await env.LOCATION_KV.put("loc_config", JSON.stringify(newConfig));
      return new Response(JSON.stringify({ success: true, data: newConfig }), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // 4. 路由：带有搜索和自动海拔的 Web UI
    if (url.pathname === "/") {
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>高级 iOS 定位伪装控制台</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f0f0f0; }
    #map { height: 100vh; width: 100vw; z-index: 1; }
    .panel { position: absolute; top: 15px; left: 15px; right: 15px; max-width: 360px; z-index: 1000; background: rgba(255,255,255,0.95); padding: 16px; border-radius: 12px; box-shadow: 0 6px 16px rgba(0,0,0,0.2); backdrop-filter: blur(10px); }
    h3 { margin: 0 0 12px 0; font-size: 18px; color: #1c1c1e; }
    
    /* 搜索框样式 */
    .search-box { display: flex; gap: 8px; margin-bottom: 12px; }
    .search-box input { flex: 1; padding: 10px; border: 1px solid #d1d1d6; border-radius: 8px; font-size: 14px; outline: none; }
    .search-box input:focus { border-color: #007aff; }
    .search-box button { padding: 0 16px; background: #007aff; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
    
    /* 信息展示区 */
    .info-box { background: #f2f2f7; padding: 12px; border-radius: 8px; margin-bottom: 12px; font-size: 13px; color: #3a3a3c; line-height: 1.6; }
    .info-box span { font-weight: 600; color: #1c1c1e; }
    .tag { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-bottom: 4px; }
    .tag-active { background: #34c759; color: white; }
    .tag-inactive { background: #ff3b30; color: white; }

    /* 按钮区 */
    .btn { display: block; width: 100%; padding: 12px; margin-top: 8px; background: #007aff; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 15px; transition: 0.2s; }
    .btn:active { opacity: 0.8; }
    .btn-danger { background: #ff3b30; }
  </style>
</head>
<body>
  <div class="panel">
    <h3>📍 定位控制台</h3>
    
    <div class="search-box">
      <input type="text" id="searchInput" placeholder="搜索地点 (如: 故宫)">
      <button onclick="searchLocation()" id="searchBtn">搜索</button>
    </div>

    <div class="info-box">
      <div id="statusTag" class="tag tag-active">获取状态中...</div><br>
      名称: <span id="locName">当前保存的位置</span><br>
      坐标: <span id="coords">- , -</span><br>
      海拔: <span id="elevation">-</span> 米
    </div>

    <button class="btn" onclick="saveLocation()" id="saveBtn">💾 保存并应用此位置</button>
    <button class="btn btn-danger" onclick="toggleEnable(false)">🚫 恢复真实手机定位</button>
  </div>
  
  <div id="map"></div>

  <script>
    const token = "${token}";
    let currentMarker = null;
    
    // 当前选中的数据状态
    let state = {
      lat: 39.9087,
      lng: 116.3975,
      alt: 44,
      name: '加载中...',
      enabled: true
    };

    const map = L.map('map', { zoomControl: false }).setView([state.lat, state.lng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

    // UI 更新函数
    function updateUI() {
      document.getElementById('coords').innerText = state.lat.toFixed(5) + ', ' + state.lng.toFixed(5);
      document.getElementById('elevation').innerText = state.alt !== null ? state.alt : '计算中...';
      document.getElementById('locName').innerText = state.name;
      
      const tag = document.getElementById('statusTag');
      if (state.enabled) {
        tag.className = 'tag tag-active';
        tag.innerText = '🟢 模拟开启中';
      } else {
        tag.className = 'tag tag-inactive';
        tag.innerText = '🔴 模拟已禁用 (真实定位)';
      }
    }

    // 更新地图标记
    function setMarker(lat, lng, panTo = false) {
      if (currentMarker) map.removeLayer(currentMarker);
      currentMarker = L.marker([lat, lng]).addTo(map);
      if (panTo) map.setView([lat, lng], 14);
    }

    // 自动获取海拔高度 (通过 Open-Meteo API)
    async function fetchElevation(lat, lng) {
      try {
        const res = await fetch(\`https://api.open-meteo.com/v1/elevation?latitude=\${lat}&longitude=\${lng}\`);
        const data = await res.json();
        if (data && data.elevation && data.elevation.length > 0) {
          state.alt = data.elevation[0];
          updateUI();
        }
      } catch (e) {
        console.error('海拔获取失败:', e);
        state.alt = 10; // 失败时的降级方案
        updateUI();
      }
    }

    // 处理坐标变更 (点击或搜索)
    async function handleLocationChange(lat, lng, name) {
      state.lat = lat;
      state.lng = lng;
      state.name = name;
      state.alt = '计算中...';
      updateUI();
      setMarker(lat, lng, true);
      await fetchElevation(lat, lng);
    }

    // 地名搜索功能 (通过 OpenStreetMap Nominatim API)
    async function searchLocation() {
      const query = document.getElementById('searchInput').value;
      if (!query) return;
      
      const btn = document.getElementById('searchBtn');
      btn.innerText = '...';
      btn.disabled = true;

      try {
        const res = await fetch(\`https://nominatim.openstreetmap.org/search?format=json&q=\${encodeURIComponent(query)}\`);
        const results = await res.json();
        
        if (results && results.length > 0) {
          const lat = parseFloat(results[0].lat);
          const lng = parseFloat(results[0].lon);
          // 截取太长的地名
          let displayName = results[0].display_name.split(',').slice(0, 2).join(',');
          await handleLocationChange(lat, lng, displayName);
        } else {
          alert('未找到该地点，请尝试其他关键词');
        }
      } catch (e) {
        alert('搜索出错: ' + e);
      } finally {
        btn.innerText = '搜索';
        btn.disabled = false;
      }
    }

    // 监听地图点击
    map.on('click', (e) => {
      handleLocationChange(e.latlng.lat, e.latlng.lng, '地图手动选点');
    });

    // 初始加载服务器数据
    async function loadConfig() {
      try {
        const res = await fetch('/loc.json?token=' + token);
        const data = await res.json();
        state.lat = data.latitude;
        state.lng = data.longitude;
        state.alt = data.altitude;
        state.enabled = data.enabled;
        state.name = '当前生效坐标';
        updateUI();
        setMarker(state.lat, state.lng, true);
      } catch(e) {
        console.error('配置加载失败', e);
      }
    }

    // 保存设置并生效
    async function saveLocation() {
      const btn = document.getElementById('saveBtn');
      btn.innerText = '保存中...';
      
      // 传递完整的经度、纬度、海拔和启用状态
      const url = \`/set?token=\${token}&lat=\${state.lat}&lng=\${state.lng}&alt=\${state.alt}&enabled=true\`;
      
      try {
        const res = await fetch(url);
        const data = await res.json();
        if(data.success) { 
          state.enabled = true;
          updateUI();
          alert('✅ 保存成功！\\n\\n请去 iPhone 设置中:\\n1. 关闭定位服务\\n2. 等待 10 秒\\n3. 重新打开定位服务\\n以清除苹果系统缓存。'); 
        }
      } catch (e) {
        alert('保存失败: ' + e);
      } finally {
        btn.innerText = '💾 保存并应用此位置';
      }
    }

    // 禁用/恢复真实定位
    async function toggleEnable(enable) {
      if(!confirm('确定要恢复真实的手机定位吗？')) return;
      
      const url = \`/set?token=\${token}&lat=\${state.lat}&lng=\${state.lng}&alt=\${state.alt}&enabled=\${enable}\`;
      try {
        const res = await fetch(url);
        const data = await res.json();
        if(data.success) { 
          state.enabled = enable;
          updateUI();
          alert('🚫 已禁用伪装。去手机开关一次定位即可恢复真实物理位置。'); 
        }
      } catch (e) {
        alert('操作失败: ' + e);
      }
    }

    // 绑定回车键搜索
    document.getElementById('searchInput').addEventListener('keypress', function (e) {
      if (e.key === 'Enter') searchLocation();
    });

    // 启动拉取
    loadConfig();
  </script>
</body>
</html>`;
      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    return new Response("Not Found", { status: 404 });
  }
};