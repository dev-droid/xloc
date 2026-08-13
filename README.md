# xloc

基于 Cloudflare Worker 和 Shadowrocket 的 Serverless iOS 定位修改工具。
本项目核心拦截逻辑基于 `mekos2772/ios-location-spoofer` 进行二次开发，移除了对传统 Node.js 服务端的依赖，实现完全的边缘节点无服务器部署。

## ✨ 核心特性

- **Serverless 架构**：后端部署于 Cloudflare Worker，免去 VPS 维护成本。
- **可视化面板**：提供 Web 地图交互界面，支持地名搜索与自动高程解析。
- **无损协议重写**：完整保留 Apple WLoc / ARPC 协议的 Protobuf 解析与封包逻辑。
- **状态持久化**：基于 Cloudflare KV 存储坐标状态，支持一键下发与恢复真实定位。

## 🛠️ 部署指南

### 1. 服务端部署 (Cloudflare)

1. 在 Cloudflare 控制台创建 KV 命名空间，命名为 `LOCATION_KV`。
2. 创建新的 Worker，将 `worker.js` 代码部署至该 Worker。
3. 在 Worker 的 Settings -> Variables 中进行以下绑定：
   - **KV Namespace Bindings**: 变量名填入 `LOCATION_KV`，绑定刚创建的命名空间。
   - **Environment Variables**: 添加 `TOKEN` 变量，值为自定义的鉴权密钥。

### 2. 客户端部署 (Shadowrocket)

1. 将项目中的 `xloc.sgmodule` 导入至 Shadowrocket 的模块列表。
2. 编辑该模块，将 `argument` 字段中的 URL 替换为实际的 Worker 域名及鉴权 `TOKEN`：
   `argument=configUrl=https://<你的Worker域名>/loc.json?token=<你的TOKEN>`
3. 确保模块中的 `script-path` 指向你自己仓库的 `location.js`，并且模块中必须包含 `binary-body-mode=1` 等关键配置。
4. 启用该模块，并确保 Shadowrocket 已开启 **HTTPS 解密**（生成 CA 证书 -> 描述文件安装 -> 关于本机信任证书）。

## 🎮 使用方法

1. **修改定位**：通过浏览器访问 `https://<你的Worker域名>/?token=<你的TOKEN>`，在地图上选点或搜索，点击“保存并启用”。
2. **刷新缓存**：前往 iOS 系统设置 -> 隐私与安全性 -> 定位服务，关闭开关，等待 10 秒后重新打开。如果缓存顽固，请开启飞行模式 15 秒，彻底切断蜂窝和 GPS 星历，并彻底杀掉地图 App 后台。
3. **恢复定位**：在 Web 面板点击恢复真实定位，并重复上述刷新缓存操作。

## ⚠️ 免责声明

本项目仅供技术开发与网络测试使用，使用者需自行承担因使用本工具而产生的一切风险与责任。请勿用于任何违反法律法规或第三方软件用户协议的场景。