# J· 成就 — 全栈工程师的一个可玩注释（English Mirror）

> English mirror of `resume-projects/FULL-STACK.md`. The in-game J-achievement screen is also a **live full-stack portfolio demo** — a *résumé you can walk through* — pointing at the full-stack collection in `resume-stack/` (the `l-package` family).

## How to boot

```bat
start-resume-stack.bat
```

Runs `start-full.bat` inside `resume-stack/`.

## Verify it (Docker)

```powershell
powershell -ExecutionPolicy Bypass -File resume-stack/scripts/verify-resume.ps1
```

On success:
- `ALL PYTHON MODULES OK`
- `API /verify ALL OK`

## Endpoints

| What | URL |
|------|-----|
| Main résumé page | http://127.0.0.1:8080/#resume-lab |
| Vue playground (orders + payments) | http://127.0.0.1:8080/resume-order/ |
| Python service | GET http://127.0.0.1:8787/api/resume/verify |
| PiZero compression | POST http://127.0.0.1:8787/research/pizero/compress |
| Java API · Swagger | http://127.0.0.1:8090/swagger-ui.html |
| Seata distributed tx | POST http://127.0.0.1:9000/api/orders |
| WeChat Pay unified order | POST http://127.0.0.1:8090/api/pay/wechat/unified/{orderId} |

## Full Docker stack

```bat
cd resume-stack
docker compose -f docker-compose.full.yml up -d --build
```

Brings up the Spring Cloud + Seata ecosystem (10–20 containers).

## How this plugs into the game

- **J achievements → full-stack résumé**: J calls `/api/resume/verify` directly.
- **F3 research flow**: backed by a live ReAct-style LLM service with tools (retrieval + verify + report); kept playable rather than a closet inventory.
- Hub POI surfaces the Swagger API — documentary, no live call from inside the game.

## WeChat Pay sandbox (optional)

```powershell
$env:WECHAT_APP_ID="wx..."
$env:WECHAT_MCH_ID="..."
$env:WECHAT_API_V3_KEY="..."
```

`order-system` → `application.yml` → `wechat.pay.mock: false`.

---

*The game ships none of these services; it references them by URL. The résumé is the artifact.*
