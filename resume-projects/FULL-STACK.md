# 赵欣曈 · 简历全栈（与游戏联动）

游戏内 **J→工程栈** 为机制化演示；**真实可运行实现** 在 `resume-stack/`（指向 `l-package` 全栈仓库）。

## 一键启动

```bat
start-resume-stack.bat
```

或进入 `resume-stack/` 执行 `start-full.bat`。

## 验证（无需 Docker）

```powershell
powershell -ExecutionPolicy Bypass -File resume-stack/scripts/verify-resume.ps1
```

通过时应看到 `ALL PYTHON MODULES OK` 与 `API /verify ALL OK`。

## 关键入口

| 功能 | URL |
|------|-----|
| 简历中心 | http://127.0.0.1:8080/#resume-lab |
| Vue 订单（微信/购物车） | http://127.0.0.1:8080/resume-order/ |
| Python 自检 | GET http://127.0.0.1:8787/api/resume/verify |
| PiZero 压缩 | POST http://127.0.0.1:8787/research/pizero/compress |
| Java Swagger | http://127.0.0.1:8090/swagger-ui.html |
| Seata 下单 | POST http://127.0.0.1:9000/api/orders |
| 微信支付 | POST http://127.0.0.1:8090/api/pay/wechat/unified/{orderId} |

## Docker 全栈

```bat
cd resume-stack
docker compose -f docker-compose.full.yml up -d --build
```

首次 Spring Cloud + Seata 构建约 10–20 分钟。

## 游戏内联动

- **J → 工程栈 → 「检测真实服务」**：调用 `/api/resume/verify`
- **F3 助手**：后端在线时优先走 ReAct API，离线回退本地 RAG
- 枢纽 POI「Swagger 文档亭」等可打开对应 URL

## 微信支付真实环境

```powershell
$env:WECHAT_APP_ID="wx..."
$env:WECHAT_MCH_ID="..."
$env:WECHAT_API_V3_KEY="..."
```

`order-system` 的 `application.yml` 中 `wechat.pay.mock: false`。
