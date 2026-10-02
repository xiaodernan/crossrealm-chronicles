/**
 * 营火分支对话树 —— 全部区域（W-B2 数据外移）。
 *
 * 树上**不带营火名**（W-B4 切片2）：这座火叫什么只有 `content/restPointNames.js` 那一格说了算。
 * 这里曾经每棵树抄一份 `title` 当对话标题，于是玩家站在枢纽火边看到提示写"世界之锚休息点"、
 * 一秒后开出来的对话标题写"世界之锚营火"，而 `magic` 抄的还是早已废弃的区名 '魔法遗境'。
 * 两份都是合法字符串，加载期与内容校验都没意见 —— 只有玩家看得出这座火有两个名字。
 *
 * 搬前分四层：`RestDialogue.js` 的基础树 + `RestDialogueExtras.js` +
 * `RestDialogueExtras2.js` + `RestDialoguePopCulture(Wave2/3/4).js`，
 * 每层都是 `structuredClone(base)` 之后 `nodes[nodeId] = node` 再往 `start.choices`
 * 里插几条。合并顺序会真的改变玩家看到的选项顺序（hub 那一层用的是 `splice(2, 0, …)`），
 * 所以"增量表 + 追加"这种形状搬不动它 —— 直接把**合并以后的整棵树**放在这里，
 * 一棵树一处改，`registry.js` 在加载期校验区域 id、节点形状与 `next` 的落点。
 */
export const REST_DIALOGUES = {
  hub: {
    nodes: {
      start: {
        speaker: "锚火看守",
        mood: "calm",
        text: `火焰在世界之锚旁跳动，你能感到三个位面的脉动在此交汇。

看守者抬眼：「又要出发了？」`,
        choices: [
          { label: "休息 / 升级", action: "rest" },
          { label: "这火从哪来？", next: "origin" },
          { label: "CG 画廊在哪？", next: "gallery" },
          { label: "战斗风格是什么？", next: "style" },
          { label: "Boss 能再打吗？", next: "rematch", minChapter: 2 },
          { label: "打听当前使命", next: "quest" },
          { label: "位面行者是什么？", next: "walker", minChapter: 2 },
          { label: "地下城记录？", next: "dungeon" },
          { label: "有支线吗？", next: "side" },
          { label: "次元回声？", next: "echoes" },
          { label: "三巨头母题？", next: "triad" },
          { label: "Wave4 四系？", next: "wave4" },
        ],
      },
      origin: {
        speaker: "锚火看守",
        mood: "calm",
        text: `「锚点裂于三界之交。这火不是柴烧的 — 是位面摩擦出的余温。」

收集碎片、重铸锚点，火才会稳定。`,
        choices: [
          { label: "明白了，休息吧", action: "rest" },
          { label: "还有别的事吗？", next: "start" },
          { label: "魂火有什么用？", next: "souls" },
        ],
      },
      souls: {
        speaker: "锚火看守",
        text: "「魂火在营火升级属性，也在「剧情技能」页签解锁叙事技。别攒太多 — Boss 不会等你。」",
        journal: { id: "rest-hub-souls", title: "营火·魂火", text: "魂火用于升级与剧情技能。" },
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      walker: {
        speaker: "锚火看守",
        mood: "warn",
        text: "「位面行者能穿越灰林、遗境与荒原 — 不是游客，是缝合裂隙的人。你已经在路上了。」",
        choices: [
          { label: "继续休息", action: "rest" },
        ],
      },
      quest: {
        speaker: "锚火看守",
        text: null,
        choices: [
          { label: "去休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      gallery: {
        speaker: "锚火看守",
        text: "「日志 [{journal}] 里新增了 **CG画廊** — 营火分支与 Boss 击破都会留下插画。收藏 ★ 后可在灯箱放大。」",
        journal: { id: "rest-hub-gallery", title: "营火·CG画廊", text: "{journal} 键日志可查看已解锁 CG。" },
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      style: {
        speaker: "锚火看守",
        text: "「弹反、连击终结、处决都会累积 **战斗风格** — 右上角会闪评级。别只砍，要打得漂亮。」",
        choices: [
          { label: "明白了", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      rematch: {
        speaker: "锚火看守",
        mood: "warn",
        text: "「击败过的 Boss 可在信标处 **再战** — 按 {interact} 召唤。再战不会推进主线，但会补魂火与 CG。」",
        journal: { id: "rest-hub-rematch", title: "营火·Boss再战", text: "已击败 Boss 的信标可 {interact} 再战。" },
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
        minChapter: 2,
      },
      dungeon: {
        speaker: "锚火看守",
        text: "「五座地下城散落各位面 — 日志 [{journal}] 的 **地下城** 页签会记你的清空记录。」",
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      side: {
        speaker: "锚火看守",
        text: "「除了主线，还有 **支线** — 魂火萤、风格试炼、CG 收集。完成自动奖魂火。」",
        journal: { id: "rest-hub-side", title: "营火·支线", text: "{journal} 键支线页签查看可选目标。" },
        choices: [
          { label: "休息", action: "rest" },
        ],
      },
      echoes: {
        speaker: "锚火看守",
        text: `「枢纽东侧有 **位面海报墙** — 六张褪色海报。

{journal} 键 → **次元回声** 记录你共鸣过的致敬点。」`,
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      triad: {
        speaker: "锚火看守",
        text: `「三巨头母题已渗入各位面：

· 灰林 — **边境往事**（西部）
· 混沌 — **幽冥帮派**（黑帮）
· 荒原 — **深空纪元**（科幻）

J → 次元回声 按系列筛选。」`,
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      wave4: {
        speaker: "锚火看守",
        text: "「四系回声：赛博霓虹·武士残响·旧日低语·星港商路 — {journal} 键筛选。」",
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
    },
  },
  fantasy: {
    nodes: {
      start: {
        speaker: "精灵斥候",
        text: "精灵斥候坐在火边擦剑。树皮烟味混着旧战争的铁锈气。",
        choices: [
          { label: "休息 / 升级", action: "rest" },
          { label: "森林深处有什么？", next: "deep" },
          { label: "教我一招", next: "tip" },
          { label: "影界守护者？", next: "boss1" },
          { label: "魂火萤？", next: "wisp" },
          { label: "日志怎么用？", next: "journal" },
          { label: "连杀奖励？", next: "streak" },
          { label: "石环铭文？", next: "lotr" },
          { label: "边境往事？", next: "western" },
          { label: "决斗圈？", next: "duel" },
          { label: "幽灵铁道？", next: "rails" },
          { label: "武士残响？", next: "samurai" },
        ],
      },
      deep: {
        speaker: "精灵斥候",
        text: "「至尊石环在西，Boss 红圈在东。地下城入口在北侧遗城 — 地图 {worldMap} 键看紫点。」",
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      tip: {
        speaker: "精灵斥候",
        mood: "warn",
        text: "「{lockOn} 锁定，第三段连击有**终结技** — 镜头会慢下来。敌人红圈最后一瞬 **{parry} 弹反**，比硬扛聪明。」",
        choices: [
          { label: "试试就休息", action: "rest" },
        ],
      },
      boss1: {
        speaker: "精灵斥候",
        mood: "warn",
        text: "「影界守护者两阶段 — 红圈砸地前翻滚。弹反成功有**致命反击**慢镜头。别贪第三刀。」",
        journal: { id: "rest-fantasy-boss1", title: "营火·影界", text: "Boss 红圈砸地前翻滚；弹反有慢镜头反击。" },
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      wisp: {
        speaker: "精灵斥候",
        text: "「森林里有 **魂火萤** — 靠近会飘向营火。攒够魂火在升级面板点属性。」",
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      journal: {
        speaker: "精灵斥候",
        text: "「营火对话会进日志 [{journal}] 的 **营火** 分类。碎片在迷宫石碑 — 别漏读。」",
        choices: [
          { label: "休息", action: "rest" },
        ],
      },
      streak: {
        speaker: "精灵斥候",
        text: "「短时间连杀会触发 **魂火连击** — 屏幕 toast 提示额外魂火。」",
        choices: [
          { label: "休息", action: "rest" },
        ],
      },
      lotr: {
        speaker: "精灵斥候",
        text: "「至尊石环的铭文改了词 — One Realm to bind them all。指环已碎，石环仍在。」",
        choices: [
          { label: "休息", action: "rest" },
        ],
      },
      western: {
        speaker: "精灵斥候",
        text: `「灰林边缘有旧西部回声 — 沙龙镜墙、正午决斗圈、幽灵铁道。

别在 chalk 圈里恋战，太阳不会等你。」`,
        journal: { id: "rest-fantasy-western", title: "营火·边境往事", text: "灰白森林致敬西部 frontier 母题。" },
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      duel: { speaker: "精灵斥候", text: "「正午决斗圈在西侧 — 倒影永远比你快半拍。{parry} 弹反比拔枪快。」", choices: [
  { label: "休息", action: "rest" },
] },
      rails: { speaker: "精灵斥候", text: "「幽灵铁道向东延伸 — 汽笛在雾里，火车从不到站。」", choices: [
  { label: "休息", action: "rest" },
] },
      samurai: {
        speaker: "精灵斥候",
        text: "「武士残响 — 鸟居、道场、樱落刃冢。最后一式用 {parry} 弹反接。」",
        journal: { id: "rest-fantasy-samurai", title: "营火·武士残响", text: "灰白森林武士道母题。" },
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
    },
  },
  magic: {
    nodes: {
      start: {
        speaker: "奥术旅者",
        text: "悬浮城堡的倒影在火焰里摇晃。奥术旅者自火焰中浮现半寸，又落回地面。",
        choices: [
          { label: "休息 / 升级", action: "rest" },
          { label: "法术建议？", next: "spell" },
          { label: "禁书图书馆在哪？", next: "lib" },
          { label: "大奥术师弱点？", next: "boss2", minChapter: 2 },
          { label: "CG 收藏？", next: "cg" },
          { label: "秘典是什么？", next: "codex" },
          { label: "技能树在哪看？", next: "skills" },
          { label: "咒术学院？", next: "wizard" },
          { label: "飞天环赛？", next: "broom" },
          { label: "九分站台？", next: "nine" },
          { label: "护念湖？", next: "patronus" },
          { label: "三强赛台？", next: "triwizard" },
          { label: "赛博霓虹？", next: "cyber" },
        ],
      },
      spell: {
        speaker: "奥术旅者",
        text: "「1–4 法术，长按蓄力。对大奥术师尤其有效 — 紫球飞来时先躲再反击。」",
        choices: [
          { label: "休息", action: "rest" },
        ],
      },
      lib: {
        speaker: "奥术旅者",
        text: "「向南偏东，地图紫点。迷宫里读石碑 — 碎片会进日志 [{journal}]。」",
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      boss2: {
        speaker: "奥术旅者",
        mood: "warn",
        text: "「萨尔林会放紫色法球 — 靠近弹反可打断。二阶段法球加速，用法术牵制。」",
        choices: [
          { label: "休息", action: "rest" },
        ],
      },
      cg: {
        speaker: "奥术旅者",
        text: "「大奥术师击破时会解锁 **战斗 CG** — 紫焰与慢镜头，值得收藏。」",
        choices: [
          { label: "休息", action: "rest" },
        ],
      },
      codex: {
        speaker: "奥术旅者",
        text: "「禁书残页散在迷宫 — 集齐会在日志 **秘典** 页签显示位面 lore。」",
        journal: { id: "rest-magic-codex", title: "营火·秘典", text: "{journal} 键秘典页签收录位面 lore。" },
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      skills: {
        speaker: "奥术旅者",
        text: "「日志 [{journal}] 的 **流派** 页签可预览剑/杖技能树 — 营火升级面板里加点。」",
        choices: [
          { label: "休息", action: "rest" },
        ],
      },
      wizard: {
        speaker: "奥术旅者",
        text: "「悬浮咒术学院 — 蜡烛会自己飞，楼梯爱换方向。别在禁林里追会发光的眼睛。」",
        journal: { id: "rest-magic-wizard", title: "营火·咒术学院", text: "霍格沃兹遗境致敬魔法学院母题。" },
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      broom: {
        speaker: "奥术旅者",
        text: "「飞天环赛看台还在 — 三根金环。没人骑扫帚了，但魂火萤仍会绕着环飞。」",
        choices: [
          { label: "休息", action: "rest" },
        ],
      },
      nine: {
        speaker: "奥术旅者",
        text: "「九分又四分三站台 — 砖墙会在月台中央裂开。别找检票口，找「相信」的那一步。」",
        journal: { id: "rest-magic-nine", title: "营火·九分站台", text: "霍格沃兹遗境致敬经典站台母题。" },
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      patronus: { speaker: "奥术旅者", text: "「护念湖镜在东岸 — 湖面映出的不是脸，是你最需要的勇气。」", choices: [
  { label: "休息", action: "rest" },
] },
      triwizard: { speaker: "奥术旅者", text: "「三强赛台的三只杯已空 — 龙息与迷宫的回声还在石台打转。」", choices: [
  { label: "休息", action: "rest" },
] },
      cyber: {
        speaker: "奥术旅者",
        text: "「赛博霓虹渗入遗境 — 霓虹后巷、铬合金诊所、巨企尖塔。魔药与芯片同柜。」",
        journal: { id: "rest-magic-cyber", title: "营火·赛博霓虹", text: "霍格沃兹遗境赛博朋克母题。" },
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
    },
  },
  space: {
    nodes: {
      start: {
        speaker: "宇航员回声",
        text: "Endurance 号的应急火。宇航员回声的全息面罩映着星光。",
        choices: [
          { label: "休息 / 升级", action: "rest" },
          { label: "引力井是什么？", next: "well" },
          { label: "裂隙迷宫入口？", next: "rift" },
          { label: "奇点领主？", next: "boss3", minChapter: 3 },
          { label: "拍照模式？", next: "photo" },
          { label: "Boss 再战？", next: "rematch", minChapter: 3 },
          { label: "星际方程？", next: "interstellar" },
          { label: "Stay 书架？", next: "stay" },
          { label: "虫洞拱门？", next: "wormhole" },
          { label: "曼恩信标？", next: "brand" },
          { label: "爱即坐标？", next: "love" },
          { label: "深空纪元？", next: "scifi" },
          { label: "AI 核心？", next: "ai" },
          { label: "跃迁门？", next: "jump" },
          { label: "星港商路？", next: "starport" },
        ],
      },
      well: {
        speaker: "宇航员回声",
        mood: "warn",
        text: "「米勒荒原的引力井不是自然现象。奇点领主在井下挖东西 — 三阶段，别被拉进中心。」",
        choices: [
          { label: "休息", action: "rest" },
        ],
      },
      rift: {
        speaker: "宇航员回声",
        text: "「裂隙观测站 — 地图东侧紫点。守钥者二阶段会加速，备好翻滚。」",
        choices: [
          { label: "休息", action: "rest" },
        ],
      },
      boss3: {
        speaker: "宇航员回声",
        text: "「轨道弹幕会追踪 — 保持移动。蓄力法术可破引力盾。击败后有**Boss 击破**慢镜头。」",
        choices: [
          { label: "休息", action: "rest" },
        ],
      },
      photo: {
        speaker: "宇航员回声",
        text: "「荒原的引力透镜很适合拍照 — **{photoMode}** 隐藏 UI 截屏。Boss 击破慢镜头时按 {escape} 可跳过。」",
        choices: [
          { label: "休息", action: "rest" },
        ],
      },
      rematch: {
        speaker: "宇航员回声",
        mood: "warn",
        text: "「奇点领主信标在东 — 击败后可 {interact} 再战练轨道弹幕。再战 +15 魂火。」",
        choices: [
          { label: "休息", action: "rest" },
        ],
        minChapter: 3,
      },
      interstellar: {
        speaker: "宇航员回声",
        text: `「坚韧号的日志、米勒的沙漏、墨菲的书架 — 都是同一条方程的不同项。

爱能跨越时间，但翻滚不能。」`,
        journal: { id: "rest-space-inter", title: "营火·星际方程", text: "米勒荒原致敬星际穿越母题。" },
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      stay: {
        speaker: "宇航员回声",
        text: "「书架上有人用引力写字 — 像在说 Stay。别问我那是谁，问五维_tesseract。」",
        choices: [
          { label: "休息", action: "rest" },
        ],
      },
      wormhole: {
        speaker: "宇航员回声",
        text: "「虫洞拱门在荒原西侧 — 光在环里折叠。穿过它的人，年龄与记忆不同步。」",
        journal: { id: "rest-space-wormhole", title: "营火·虫洞", text: "米勒荒原致敬虫洞母题。" },
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      brand: {
        speaker: "宇航员回声",
        text: "「曼恩假信标在冰原上闪 — 日志写完美，脚印写谎言。别被光骗。」",
        choices: [
          { label: "休息", action: "rest" },
        ],
      },
      love: {
        speaker: "宇航员回声",
        text: "「爱即坐标 — 五维_tesseract 里唯一不变的导航星是「不要放手」。」",
        choices: [
          { label: "休息", action: "rest" },
        ],
      },
      scifi: {
        speaker: "宇航员回声",
        text: `「米勒荒原不只有星际方程 — 还有深空纪元：殖民穹顶、休眠 AI、跃迁门阵列。

三门同相才能跃迁。」`,
        journal: { id: "rest-space-scifi", title: "营火·深空纪元", text: "米勒荒原致敬殖民/AI/跃迁科幻母题。" },
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      ai: {
        speaker: "宇航员回声",
        text: "「休眠 AI 核心低语：任务未完成 — 它指的不是飞船，是你。」",
        choices: [
          { label: "休息", action: "rest" },
        ],
      },
      jump: { speaker: "宇航员回声", text: "「跃迁门阵列在北 — 错相的人会在门里永远循环第一秒。」", choices: [
  { label: "休息", action: "rest" },
] },
      starport: {
        speaker: "宇航员回声",
        text: "「星港商路 — 酒肆、走私码头、全息星图。航线是谈判出来的。」",
        journal: { id: "rest-space-starport", title: "营火·星港商路", text: "米勒荒原太空歌剧母题。" },
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
    },
  },
  void: {
    nodes: {
      start: {
        speaker: "时线残影",
        text: "时线在此折叠。火焰时而倒燃，时而静止 — 像被谁按了暂停。",
        choices: [
          { label: "休息 / 升级", action: "rest" },
          { label: "时停怎么破？", next: "stop" },
          { label: "隐藏 Boss？", next: "hidden" },
          { label: "处决技巧？", next: "exec" },
          { label: "{escape} 跳过演出？", next: "skip" },
          { label: "营火记忆？", next: "memory" },
          { label: "死了怎么办？", next: "death" },
          { label: "逆相界？", next: "upside" },
          { label: "旧电台？", next: "radio" },
          { label: "街机厅？", next: "arcade" },
          { label: "单车灯串？", next: "bike" },
          { label: "裂相钟塔？", next: "vecna" },
          { label: "地下实验室？", next: "lab" },
          { label: "旧日低语？", next: "cosmic" },
        ],
      },
      stop: {
        speaker: "时线残影",
        mood: "warn",
        text: "「蓄力法术可打断时线执政官的时停。真火、引力都行 — 伤害要够。」",
        choices: [
          { label: "休息", action: "rest" },
        ],
      },
      hidden: {
        speaker: "时线残影",
        text: "「时线执政官在裂隙北侧 — 不是主线三座 Boss 之一。击败它才能触及真·位面行者。」",
        journal: { id: "rest-void-hidden", title: "营火·隐藏试炼", text: "时线执政官为隐藏 Boss。" },
        choices: [
          { label: "休息", action: "rest" },
        ],
      },
      exec: {
        speaker: "时线残影",
        text: "「打满架势条后的重击会触发**处决** — 镜头绕轨锁定，时间变慢。别在时停里浪费。」",
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      skip: {
        speaker: "时线残影",
        text: "「处决与终结慢镜头中按 **{escape}** 可跳过 — 第一次会提示。别在教程关急着跳。」",
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      memory: {
        speaker: "时线残影",
        text: "「每次在营火选「休息」都会写入 **营火记忆** — {journal} 键可回顾你睡过哪些火。」",
        choices: [
          { label: "休息", action: "rest" },
        ],
      },
      death: {
        speaker: "时线残影",
        text: "「倒下后会在枢纽重生 — 系统会给 **操作提示**，别重复犯同一错。」",
        choices: [
          { label: "休息", action: "rest" },
        ],
      },
      upside: {
        speaker: "时线残影",
        text: `「逆相界裂口在时线北边 — 红色孢子、旧电台、80 年代霓虹。

裂隙猎犬的爪印别在夜里追。」`,
        journal: { id: "rest-void-upside", title: "营火·逆相界", text: "破碎时线致敬 80 年代逆相界母题。" },
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      radio: {
        speaker: "时线残影",
        text: "「广播塔还在播 1983 年的歌 — 你听见的是 SOS，不是怀旧。」",
        choices: [
          { label: "休息", action: "rest" },
        ],
      },
      arcade: {
        speaker: "时线残影",
        text: "「街机厅残影还在播 — 吃豆人与恶魔循环，投币口塞满红色孢子。」",
        journal: { id: "rest-void-arcade", title: "营火·街机厅", text: "破碎时线致敬 80 年代街机母题。" },
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      bike: {
        speaker: "时线残影",
        text: "「四盏单车灯在雾中排成线 — 像有人还在找失踪的朋友。别在夜里单独追。」",
        choices: [
          { label: "休息", action: "rest" },
        ],
      },
      vecna: {
        speaker: "时线残影",
        mood: "warn",
        text: "「裂相钟塔指针停在 11 点 6 分 — 每次钟声，天花板就远一点。」",
        choices: [
          { label: "休息", action: "rest" },
        ],
      },
      lab: {
        speaker: "时线残影",
        text: "「地下实验室门牌 rusted shut — 门后仍有低频嗡鸣，像未关的实验。」",
        choices: [
          { label: "休息", action: "rest" },
        ],
      },
      cosmic: {
        speaker: "时线残影",
        mood: "warn",
        text: "「旧日低语 — 方尖碑、抄写室、螺旋井。井底回声在数数。」",
        journal: { id: "rest-void-cosmic", title: "营火·旧日低语", text: "破碎时线宇宙恐怖母题。" },
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
    },
  },
  abyss: {
    nodes: {
      start: {
        speaker: "裂隙引路人",
        mood: "warn",
        text: "混沌低语：「门越多，界越薄。」闪电在远处劈落，火却烧得稳。",
        choices: [
          { label: "休息 / 升级", action: "rest" },
          { label: "终局建议", next: "end" },
          { label: "深渊再探？", next: "rerun" },
          { label: "混沌领主？", next: "boss5", minChapter: 5 },
          { label: "成就墙？", next: "achieve" },
          { label: "终局后再战？", next: "legend", minChapter: 5 },
          { label: "通关之后？", next: "credits", minChapter: 5 },
          { label: "幽冥帮派？", next: "gangster" },
          { label: "禁酒窖？", next: "speakeasy" },
          { label: "码头货仓？", next: "dock" },
        ],
      },
      end: {
        speaker: "裂隙引路人",
        text: "「裂隙领主三阶段 — 混沌脉冲会灼烧近身。武器技能树在营火「剧情技能」页签查看。」",
        choices: [
          { label: "休息", action: "rest" },
        ],
      },
      rerun: {
        speaker: "裂隙引路人",
        text: "「Ch5 后可重复挑战地下城 — 随机迷宫布局。全图 {worldMap} 键，自定义路点 Shift+点击。」",
        choices: [
          { label: "休息", action: "rest" },
        ],
      },
      boss5: {
        speaker: "裂隙引路人",
        mood: "warn",
        text: "「终焉试炼。{swapWeapon} 切换剑/杖，技能树加成拉满。击破瞬间 — 全屏慢镜头与 letterbox。」",
        choices: [
          { label: "休息", action: "rest" },
        ],
      },
      achieve: {
        speaker: "裂隙引路人",
        text: "「日志 [{journal}] 的 **成就** 页签追踪弹反、连击、Boss — 全收集有魂火奖励。」",
        choices: [
          { label: "休息", action: "rest" },
        ],
      },
      legend: {
        speaker: "裂隙引路人",
        mood: "warn",
        text: "「终局之后仍可再战混沌领主 — 信标 {interact} 召唤。这是证明你仍是位面行者的最后仪式。」",
        journal: { id: "rest-abyss-legend", title: "营火·终局仪式", text: "Ch5 后可在信标再战混沌领主。" },
        choices: [
          { label: "休息", action: "rest" },
        ],
        minChapter: 5,
      },
      credits: {
        speaker: "裂隙引路人",
        text: "「Ch5 通关后有 **滚动字幕** — 可按 {escape} 跳过。你的旅程会被记录。」",
        choices: [
          { label: "休息", action: "rest" },
        ],
        minChapter: 5,
      },
      gangster: {
        speaker: "裂隙引路人",
        mood: "warn",
        text: `「混沌边境有幽冥帮派回声 — 禁酒窖、家族圣龛、码头货仓。

走私的不是酒，是位面间的魂火关税。」`,
        journal: { id: "rest-abyss-gangster", title: "营火·幽冥帮派", text: "混沌边境致敬黑帮 noir 母题。" },
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      speakeasy: { speaker: "裂隙引路人", text: "「无标记的后巷有禁酒窖门 — 进去别问价，问界。」", choices: [
  { label: "休息", action: "rest" },
] },
      dock: { speaker: "裂隙引路人", text: "「码头货仓的木箱烙旧纹章 — 魂火走私线仍通。」", choices: [
  { label: "休息", action: "rest" },
] },
    },
  },
  gloom: {
    nodes: {
      start: {
        speaker: "迷雾行者",
        text: "薄雾里的火苗微弱却坚定。迷雾行者停在火边，手里的灯笼散着冷光。",
        choices: [
          { label: "休息 / 升级", action: "rest" },
          { label: "迷雾深处有什么？", next: "deep" },
          { label: "荧光苔藓怎么用？", next: "moss" },
          { label: "幽暗怨影怎么打？", next: "wraith" },
          { label: "灯笼怎么做？", next: "lantern" },
          { label: "迷雾会消散吗？", next: "mist" },
          { label: "支线任务？", next: "side" },
          { label: "古树铭文？", next: "ancient" },
        ],
      },
      deep: {
        speaker: "迷雾行者",
        text: "「迷雾最浓处藏着古老入口 — 地图西北紫点。进去前把灯笼点亮，别让迷雾吃了路。」",
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      moss: {
        speaker: "迷雾行者",
        text: "「荧光苔藓只长在幽暗林地 — 采下来在营火炼成「迷雾灯笼」。灯笼能让迷雾里的路现形。」",
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      wraith: {
        speaker: "迷雾行者",
        mood: "warn",
        text: "「幽暗怨影会瞬移到身后 — 看见它蓄势时立刻翻滚。别在雾里硬抗，听声辨位。」",
        journal: { id: "rest-gloom-wraith", title: "营火·幽暗怨影", text: "幽暗怨影瞬移落地后有硬直，那是反击窗口。" },
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      lantern: {
        speaker: "迷雾行者",
        text: "「三枚荧光苔藓 + 一截枯枝 = 迷雾灯笼。装备后迷雾里能看清 15 米外的轮廓。」",
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      mist: {
        speaker: "迷雾行者",
        text: "「迷雾不会全消 — 它是这片林子的呼吸。灯笼只能在脚下开出一条路。」",
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      side: {
        speaker: "迷雾行者",
        text: "「林子里有两条支线 — 「雾林三歇」坐火三次，「雾林双萤」收两枚萤火。完成都给魂火。」",
        journal: { id: "rest-gloom-side", title: "营火·幽暗支线", text: "幽暗林地支线：三歇与双萤。" },
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      ancient: {
        speaker: "迷雾行者",
        text: "「扭曲古树树皮上有铭文 — 不是精灵文，更像某种契约。读懂它可能要先点亮三盏灯。」",
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
    },
  },
  radiant: {
    nodes: {
      start: {
        speaker: "晨曦祭司",
        text: "金沙流淌间，火焰燃得格外温暖。晨曦祭司在光环中合十低语。",
        choices: [
          { label: "休息 / 升级", action: "rest" },
          { label: "圣域深处怎么进？", next: "deep" },
          { label: "晨曦祝福是什么？", next: "blessing" },
          { label: "辉煌骑士怎么打？", next: "knight" },
          { label: "金沙有什么用？", next: "gold" },
          { label: "祭坛在几点刷新？", next: "altar" },
          { label: "支线任务？", next: "side" },
          { label: "星港商路延伸？", next: "starport" },
        ],
      },
      deep: {
        speaker: "晨曦祭司",
        text: "「晨曦时分（5:00-7:00）大门全开 — 地图正南紫点。别在正午去，金沙会烫穿靴子。」",
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      blessing: {
        speaker: "晨曦祭司",
        text: "「晨曦祭坛在晨曦时分祈祷，可得「晨曦祝福」 — 下次营火休息恢复双倍体力。」",
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      knight: {
        speaker: "晨曦祭司",
        mood: "warn",
        text: "「辉煌骑士重甲抗斩 — 用 {parry} 弹反它的盾击，落地那瞬间腿部无甲。别贪连击。」",
        journal: { id: "rest-radiant-knight", title: "营火·辉煌骑士", text: "辉煌骑士盾击后收招长，弹反接处决。" },
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      gold: {
        speaker: "晨曦祭司",
        text: "「流动金沙可在营火炼成「晨曦护符」 — 受击时有几率触发护盾，挡一次致命伤。」",
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      altar: {
        speaker: "晨曦祭司",
        text: "「晨曦祭坛每日 5:00-7:00 刷新 — 只有这两小时能祈祷。错过就等明天。」",
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      side: {
        speaker: "晨曦祭司",
        text: "「圣域有两条支线 — 「圣域三歇」坐火三次，「圣域双萤」收两枚萤火。完成都给魂火。」",
        journal: { id: "rest-radiant-side", title: "营火·圣域支线", text: "辉煌圣域支线：三歇与双萤。" },
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
      starport: {
        speaker: "晨曦祭司",
        text: "「星港商路不止在荒原 — 金沙彼端也有走私码头。货物是「晨曦护符」，税是魂火。」",
        journal: { id: "rest-radiant-starport", title: "营火·星港延伸", text: "辉煌圣域连接星港商路母题。" },
        choices: [
          { label: "休息", action: "rest" },
          { label: "返回", next: "start" },
        ],
      },
    },
  },
};
