/**
 * W-B10 切片4f 的**历史抄本**（门禁与誊写对账脚本共用一份）。
 *
 * ## 为什么这份东西单独成一个模块
 *
 * `tests/dungeon-dimension-copies.test.js` 的 ⑥ 层要做两件事：
 * ① 证明"一个尺寸事实抄几份"那种写法在役源码里已经绝迹；② 证明那把尺**认得**旧写法
 * —— 否则"扫到 0"只是在读空集（这条坑在切片3c 里被 `wb10s3c-copies.js` 踩过一次，形状相同）。
 * 第二件事需要动手之前的字节。字节在 `git show f609801:src/<文件>` 里，而测试运行时不保证有 git
 * —— 所以把它们逐字誊一份进来，由 `.tmp-20261004/wb10s4f-transcribe-check.mjs` 拿同一把尺
 * 在那一笔提交的真实 blob 上复量：每一段摘录必须是那一笔里的真字节，命中数必须等于这一行登记的数。
 *
 * ## 为什么 `旧文本` 是**一组摘录**而不是一整段
 * 抄本在旧文件里**不挨着**：`LevelEditor` 那三份局部格长分别在 201、221、270 行。把它们拼成一段字符串
 * 再要求"整段命中"，等于要求它们当年恰好挨在一起 —— 那是对历史的幻想，对账脚本就是这么抓到的
 * （首跑红 3 条，全是这种"把不相邻的三行抄成一段"）。所以摘录逐条登记、逐条验真；
 * arming 的命中数在**这些摘录拼起来的文本**上数（这几把尺都不跨行，分几条抄不影响计数）。
 *
 * ## 尺为什么不是一把通用正则
 *
 * 尺寸数字在别的子系统里有 entirely 不同的含义：`src/game/ExplorationMap.js:4` 的 `const CELL = 12`
 * 是世界迷雾的格子边长（坐标 −320..320），`src/engine/Collision.js:62` 的 `cellSize = 16` 是
 * 碰撞宽相位的格子 —— 它们都不是 18 的抄本，所以声明层与字面量层都**只在 `src/world/` 这一片里问**
 * （地下城几何住的地方）。`0.6` 更不能当"墙厚"的尺：`RoomTemplates` 的装饰盒本来就以 0.6 米为
 * 单位尺寸（`.tmp-20261004/wb10s4f-census.log` ① 那一档 5 处里有 4 处是装饰），所以这一片
 * 只钉"墙厚必须由 `layout.wallT` 来"这一条形状，不宣布 0.6 绝迹。
 *
 * 每一行的 `尺` 按那一处**自己的拼法**写，`旧文本` 是从那一笔提交里逐条抄下来的原文行。
 */

/** 誊写基准：切片4f 开工时的 HEAD（f609801 是 4e 的文档回填，代码字节等于 867030b） */
export const 基准提交 = 'f609801';

/** 只在这些文件里问抄本绝迹（地下城几何与布局住的那几份） */
export const 在役文件 = [
  'world/MazeLayout.js',
  'world/RoomTemplates.js',
  'world/LevelEditor.js',
  'world/ProceduralDungeonGenerator.js',
  'world/DungeonManager.js',
];

/** 声明层：`src/world/` 里唯一一份尺寸名册，每个名字恰好声明一次 */
export const 声明名册 = [
  'CELL', 'BOSS_CELL', 'WALL_H', 'WALL_T', 'DOOR_WIDTH', 'BOSS_DOOR_WIDTH',
  'DOOR_JAMB', 'DOOR_H', 'DOOR_T', 'DOOR_FRAME_OVER', 'DOOR_FRAME_H', 'DOOR_FRAME_T',
  'DOOR_COLLIDER_HALF_DEPTH', 'SPAWN_SPAN_MARGIN',
];

/** 运行时载体：每张布局对象必须带着这几枚数字走 */
export const 载体字段 = ['cellSize', 'bossCell', 'wallH', 'wallT', 'doorWidth', 'bossDoorWidth'];

/** 几何层真正消费的几枚 —— 缺哪一枚就得当场点名哪一枚 */
export const 几何必需字段 = ['wallH', 'wallT', 'doorWidth', 'bossDoorWidth'];

/**
 * 历史抄本表。`期望旧命中` 是这一行 `尺` 在 `旧文本` 上应当数到的次数，
 * 门禁拿它当**arming 下限**：数不到就说明这把尺或这段誊写坏了，而"在役 0 命中"那句话就一文不值。
 */
export const 抄本表 = [
  {
    标题: 'MazeLayout 的模块级格长',
    文件: 'world/MazeLayout.js',
    尺: /const CELL = 18;/,
    期望旧命中: 1,
    旧文本: [
      'const CELL = 18;',
    ],
    现在: 'import { CELL } from ./dungeonDimensions.js',
  },
  {
    标题: 'RoomTemplates 的模块级格长（还转手 export 过一次）',
    文件: 'world/RoomTemplates.js',
    尺: /const CELL = 18;/,
    期望旧命中: 1,
    旧文本: [
      'const CELL = 18;',
    ],
    现在: 'import { CELL } from ./dungeonDimensions.js',
  },
  {
    标题: 'LevelEditor 拖动 / 放置 / 建房里的三份局部格长',
    文件: 'world/LevelEditor.js',
    // 同一把尺量两侧：旧写法叫 `const CELL = 18;`，改完之后别名换成 `step`，
    // 但"编辑器把步长写成裸 18"这一件事没变 —— 尺只认别名与数字，不认别名的来历。
    尺: /(?:CELL|step)\s*=\s*18\b/g,
    期望旧命中: 3,
    // 201（拖动，多一层缩进）、221（放置）、270（建房）—— 三处隔着一整个类
    旧文本: [
      '      const CELL = 18;',
      '    const CELL = 18;',
      '    const CELL = 18;',
    ],
    现在: 'const step = this.layout.cellSize',
  },
  {
    标题: 'LevelEditor 拖动后反推格号时除的那两个裸 18',
    文件: 'world/LevelEditor.js',
    尺: /Math\.round\([a-z]+ \/ 18\)/g,
    期望旧命中: 2,
    旧文本: [
      '    room.gx = Math.round(x / 18);',
      '    room.gz = Math.round(z / 18);',
    ],
    现在: 'Math.round(x / this.layout.cellSize)',
  },
  {
    标题: 'LevelEditor 导入布局的裸 18 兜底（`||` 还会把 0 当缺）',
    文件: 'world/LevelEditor.js',
    尺: /cellSize: data\.cellSize \|\| 18,/,
    期望旧命中: 1,
    旧文本: [
      '      cellSize: data.cellSize || 18,',
    ],
    现在: 'cellSize: data.cellSize ?? CELL',
  },
  {
    标题: 'LevelEditor 清场时手写的裸 18',
    文件: 'world/LevelEditor.js',
    尺: /cellSize: 18,/,
    期望旧命中: 1,
    旧文本: [
      '      cellSize: 18,',
    ],
    现在: 'cellSize: CELL',
  },
  {
    标题: 'RoomTemplates 端口归一化里的幻影门宽（零消费者，还写着"这扇洞 4 米"）',
    文件: 'world/RoomTemplates.js',
    尺: /width: p\.width \?\? 4/,
    期望旧命中: 1,
    旧文本: [
      '    ports[dir] = p ? { required: p.required ?? false, solid: p.solid ?? false, width: p.width ?? 4 } : null;',
    ],
    现在: 'ports 只留 required / solid；洞宽由 dungeonDimensions 说一次',
  },
  {
    标题: '模板注册里手写的门宽（5 处，含 `treasure:small` 那条说谎的 3）',
    文件: 'world/RoomTemplates.js',
    尺: /width: [34]\b/g,
    期望旧命中: 5,
    // 159（两处 4）/ 184（说谎的 3）/ 191（两处 4）—— 三行互不相邻
    旧文本: [
      '    ports: { n: { required: true, width: 4 }, s: { required: true, width: 4 } },',
      '    ports: { s: { required: true, width: 3 } },',
      '    ports: { n: { required: true, width: 4 }, s: { required: true, width: 4 }, e: { solid: true }, w: { solid: true } },',
    ],
    现在: '洞宽不在模板里：模板无权改门宽',
  },
  {
    标题: '几何层的普通门洞宽字面量',
    文件: 'world/ProceduralDungeonGenerator.js',
    尺: /const doorW = 4;/,
    期望旧命中: 1,
    旧文本: [
      '    const doorW = 4;',
    ],
    现在: 'const doorW = layout.doorWidth',
  },
  {
    标题: '几何层的 Boss 门洞宽字面量',
    文件: 'world/ProceduralDungeonGenerator.js',
    尺: /const doorW = 5;/,
    期望旧命中: 1,
    旧文本: [
      '    const doorW = 5;',
    ],
    现在: 'const doorW = layout.bossDoorWidth',
  },
  {
    标题: '门板三元组（3.5 是"洞宽减两侧让缝"抄成常量的那一处，于是每侧见光 0.25 米）',
    文件: 'world/ProceduralDungeonGenerator.js',
    尺: /sharedBox\(3\.5, 4\.2, 0\.5\)/,
    期望旧命中: 1,
    旧文本: [
      '      const panel = new THREE.Mesh(sharedBox(3.5, 4.2, 0.5), doorClosedMat);',
    ],
    现在: 'sharedBox(doorW - 2 * DOOR_JAMB, DOOR_H, DOOR_T)',
  },
  {
    标题: '门板离地高度 2.1（= 板高 / 2 的手抄）',
    文件: 'world/ProceduralDungeonGenerator.js',
    尺: /position\.set\(door\.x, 2\.1, door\.z\)/,
    期望旧命中: 1,
    旧文本: [
      '      panel.position.set(door.x, 2.1, door.z);',
    ],
    现在: 'position.set(door.x, DOOR_H / 2, door.z)',
  },
  {
    标题: '门碰撞跨洞半轴 2（= 洞宽 / 2 的手抄）',
    文件: 'world/ProceduralDungeonGenerator.js',
    尺: /hw: 2, hd: 0\.45/,
    期望旧命中: 1,
    旧文本: [
      '      door.collider = { x: door.x, z: door.z, hw: 2, hd: 0.45, open: false };',
    ],
    现在: 'hw: doorW / 2, hd: DOOR_COLLIDER_HALF_DEPTH',
  },
  {
    标题: '门框三元组（4.2 = 洞宽 + 收边 的手抄）',
    文件: 'world/ProceduralDungeonGenerator.js',
    尺: /sharedBox\(4\.2, 4\.8, 0\.15\)/,
    期望旧命中: 1,
    旧文本: [
      '      const frame = new THREE.Mesh(sharedBox(4.2, 4.8, 0.15), accentMat);',
    ],
    现在: 'sharedBox(doorW + DOOR_FRAME_OVER, DOOR_FRAME_H, DOOR_FRAME_T)',
  },
  {
    标题: '门框离地高度 2.4（= 框高 / 2 的手抄）',
    文件: 'world/ProceduralDungeonGenerator.js',
    尺: /frame\.position\.y = 2\.4;/,
    期望旧命中: 1,
    旧文本: [
      '      frame.position.y = 2.4;',
    ],
    现在: 'frame.position.y = DOOR_FRAME_H / 2',
  },
  {
    标题: '房间尺寸的 `?? CS` 兜底（B80 之后 room.w/room.d 恒在，兜底是死代码）',
    文件: 'world/ProceduralDungeonGenerator.js',
    尺: /room\.[wd] \?\? CS/g,
    期望旧命中: 4,
    // 84（一行两处）与 116/117 相隔三十二行
    旧文本: [
      '        ob.position.set(room.x + (room.w ?? CS) * 0.25, 0.8, room.z - (room.d ?? CS) * 0.2);',
      '    const rw = room.w ?? CS;',
      '    const rd = room.d ?? CS;',
    ],
    现在: 'const rw = room.w; const rd = room.d;',
  },
  {
    标题: '几何层的 cellSize 局部别名（就是它让"读布局"在一半代码里变成读参数）',
    文件: 'world/ProceduralDungeonGenerator.js',
    尺: /const CS = layout\.cellSize;/,
    期望旧命中: 1,
    旧文本: [
      '    const CS = layout.cellSize;',
    ],
    现在: '地面/墙直接读 room.w / room.d',
  },
  {
    标题: '敌人出生散布内缩的裸 6（两行，跟着格长走）',
    文件: 'world/MazeLayout.js',
    尺: /\(CELL - 6\)/g,
    期望旧命中: 2,
    旧文本: [
      '        x: room.x + (rnd() - 0.5) * (CELL - 6),',
      '        z: room.z + (rnd() - 0.5) * (CELL - 6),',
    ],
    现在: '(CELL - SPAWN_SPAN_MARGIN)',
  },
];

/**
 * 全域形状尺（只在 `src/world/` 里问，理由见文件头）。
 * 每一把都配一段"旧字节必须命中"的反向对照，同一个扫描器同时数两侧。
 * 摘录可以来自**不同的文件**（形状尺问的是整片 `src/world`），所以这一侧只验计数与散布，
 * 逐条验真由上面的抄本表负责。
 */
export const 形状尺 = [
  {
    标题: '尺寸名在 `src/world/` 里被二次声明',
    尺: /(?:export\s+)?const (?:CELL|BOSS_CELL|WALL_H|WALL_T|DOOR_WIDTH|BOSS_DOOR_WIDTH|DOOR_H|DOOR_T|DOOR_JAMB|DOOR_FRAME_OVER|DOOR_FRAME_H|DOOR_FRAME_T|DOOR_COLLIDER_HALF_DEPTH|SPAWN_SPAN_MARGIN)\s*=\s*[\d.]/g,
    只许出现在: 'world/dungeonDimensions.js',
    旧文本: [
      'const CELL = 18;',
      'const BOSS_CELL = 34;',
      'const WALL_H = 5;',
      'const WALL_T = 0.6;',
      '    const CELL = 18;',
    ],
    期望旧命中: 5,
  },
  {
    标题: '布局默认值里直接写死的 cellSize（数字面量）',
    尺: /cellSize:\s*[\d.]+/g,
    只许出现在: null,
    旧文本: [
      '      cellSize: 18,',
    ],
    期望旧命中: 1,
  },
  {
    标题: 'cellSize 的 `||` / `??` 数字兜底（`||` 还会把 0 当缺）',
    尺: /cellSize\s*[:=][^;\n]*(?:\|\||\?\?)\s*[\d.]+/g,
    只许出现在: null,
    旧文本: [
      '      cellSize: data.cellSize || 18,',
    ],
    期望旧命中: 1,
  },
  {
    标题: '门洞宽写成 `doorW = <数字>`',
    尺: /doorW\s*=\s*[\d.]+/g,
    只许出现在: null,
    旧文本: [
      '    const doorW = 4;',
      '    const doorW = 5;',
    ],
    期望旧命中: 2,
  },
];
