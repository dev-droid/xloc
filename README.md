# xloc

一个基于 Cloudflare Worker 的 iOS 定位修改工具，配合 Shadowrocket 使用，自带网页地图选点面板。

## 主要特性

- 零成本运维**：跑在 Cloudflare Worker 上，不需要买 VPS。
- Web 可视化面板**：打开网页直接点地图，点哪定哪。
- 地名搜索**：支持搜中英文地名，自动解析坐标。
- 自动适配海拔**：选点后自动拉取真实的当地海拔数据，防止坐标和海拔不匹配导致露馅。
- 状态持久化**：坐标数据存在 CF KV 里，支持在网页端一键切回真实定位。

## 部署说明

1. 进 Cloudflare 控制台，创建一个 KV 命名空间（比如命名为 `LOCATION_KV`）。
2. 新建一个 Worker，把 `worker.js` 的代码全贴进去。
3. 在 Worker 的设置里：
   - 绑定 KV 命名空间（变量名必须填 `LOCATION_KV`）。
   - 添加一个环境变量 `TOKEN`，填一个你自己知道的强密码（防止别人乱改你的定位）。
4. 在 Shadowrocket（小火箭）里配置好模块，把 `configUrl` 指向你的 Worker 链接即可。

## 项目来源 / 鸣谢

本项目核心原理和 `.sgmodule` 模块配置基于 [mekos2772/ios-location-spoofer](https://github.com/mekos2772/ios-location-spoofer) 进行二次开发。感谢原作者提供的 MitM 拦截思路与详尽的教程。

**主要修改点**：
- 将原本依赖服务器常驻运行的 Node.js 后端，完全重写为 Cloudflare Worker 版本，实现 Serverless 零成本部署。
- 重构了前端地图交互逻辑，新增了地名搜索以及自动调用 Open-Meteo API 获取真实海拔的功能。