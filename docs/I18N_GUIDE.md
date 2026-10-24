# i18n 新内容接入规范（W-D2 切片56）

> 适用范围：任何**玩家可见**的文案（界面文本、toast、aria-label、canvas 绘制的文字），
> 以及任何**带显示名的内容 id**（Boss / 区域 / 敌人 / 支线 / 成就 / 物品 / 旗标）。
> 开发者向的 console / throw / 不变量消息不键化（键化反而遮眼），本规范不管它们。

## 一、加一条玩家可见文案

1. **两表同键同步加**：`src/content/strings.zh.js` 与 `src/content/strings.en.js` 同键同义。
   只加一侧 = import 期 `assertI18nParity()` 直接抛红（`src/engine/i18n.js` 加载自检）。
2. **键名规范**：小写 snake_case，`^[a-z][a-z0-9_]*$`，按"模块_用途"起名
   （`hud_souls_display_fmt`、`settings_keybind_head_action`）。
3. **带插值的键以 `_fmt` 结尾**，且模板里必须真有 `${name}` 占位（后缀承诺了插值，
   模板里就得有得可插）。调用时传参数对象：`t('hud_souls_display_fmt', { souls, level })`。
4. **复用优先**：同一份文案最多两个键（一中一英各一）。意思一样先找旧键，找不到再建。
5. **占位键不许走 DOM 走查**：`data-i18n` / `data-i18n-aria` 的替换是 `textContent`
   整体写入、**不插值** —— 含 `${}` 的键挂上去，玩家看到的就是字面量 `${x}`。
   带占位的键一律走 `t(key, params)` 的 JS 路径。
6. **改完跑门禁**（见第四节）。

## 二、给新内容 id 配显示名（名册模式）

显示名不写进内容表，而是建一张**名册**：id → **文案键**（不是文案本身），
播出那一刻由解析器 `t()` 展开。这样改文案只改双表，内容表一个字节不用动。

```js
// src/content/<family>Names.js
export const XXX_NAMES = {
  'content-id': 'family_display_name_key',   // id -> 文案键
};
```

现有八族名册（锁因解析器同源，`src/game/StoryWeaponSkills.js`）：

| 族 | 名册 | 解析器 |
|----|------|--------|
| Boss | `content/bossRoster.js` | `bossLabel` |
| 区域 | `content/zoneNames.js` | `zoneLabel` |
| 击杀类型 | `content/enemyNames.js` | `enemyLabel` |
| 效果 | `content/skillTrees.js` 映射 | `effectLabel` |
| 支线 | `content/sideQuests.js` | `questLabel` |
| 成就 | `content/achievements.js` | `achievementLabel` |
| 物品 | `content/items.js` | `itemLabel` |
| 旗标 | `content/storyFlags.js` | `flagLabel` |

新族接入三件事：名册文件 → `src/content/registry.js` 登记一张表 →
`tests/content-i18n-keys.test.js` 映射表清单加一行（该门禁逐键核对两表非空）。
**查不到原样退回 id** 是解析器的既定行为（新内容忘了取名也不会崩，只是显示 id）。

## 三、运行时口径（`src/engine/i18n.js`）

- 两张表 import 期一次解析（源码合计约 354KB），**不按语言懒加载**：全仓 1300+ 个
  `t()` 调用点都是同步取值，懒加载要把每个调用点改异步，收益远小于成本。
- 缺键返回 `[MISSING: key]` 并 `console.warn`；**同一个键整局只 warn 一次**
  （`t()` 在每帧路径上，逐帧刷屏会埋掉真正的报错）。
- `TABLES` 映射已 `Object.freeze`：换语言走 `setLanguage`，运行时不许换表。

## 四、门禁清单（改完跑这些）

| 门禁文件 | 盯什么 |
|----------|--------|
| `tests/i18n.test.js` | 双表对齐、键完整性（t()/data-i18n 引用的键都在表里）、死键只减不增（约 75s，可最后跑） |
| `tests/i18n-conventions.test.js` | 键名规范、`_fmt` ↔ `${}` 约定、占位键不走 DOM、缺键告警去重 |
| `tests/content-i18n-keys.test.js` | 名册映射的每个文案键两表都在场 |
| `tests/content-registry.test.js` | registry 登记的形状与数量 |
| `tests/hud-*-i18n.test.js` / `tests/panel-titles-i18n.test.js` 等 | 各面板行为腿：换语言后界面真的改口 |

定向跑法（不要动辄全量回归）：

```
node node_modules/vitest/vitest.mjs run tests/i18n-conventions.test.js tests/i18n.test.js
```

## 五、常见错误 → 症状对照

| 症状 | 原因 | 对着的门禁 |
|------|------|-----------|
| 界面出现 `[MISSING: xxx]` | 只加了一侧 / 键名拼错 | i18n.test.js 键的引用完整性 |
| 界面出现字面量 `${count}` | 占位键挂上了 `data-i18n` | i18n-conventions 泄漏腿 |
| 插值位置空白 | `_fmt` 键模板忘了写占位，或参数对象传成了标量 | i18n-conventions `_fmt` 腿 |
| 切英文后某格不变 | 该格没走 `t()` / 没挂 `data-i18n` | 各面板行为腿 |
| 新内容显示裸 id | 名册里没有这个 id（退回行为，不崩） | content-i18n-keys / 各解析器腿 |
