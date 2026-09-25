import { REST_NPC_DEFS } from '../content/restNpcDefs.js';
import { REST_DIALOGUE_EVENTS } from '../engine/events.js';
import { emit } from '../engine/EventBus.js';
import { mergeRestDialogueNodes } from './RestDialogueExtras.js';
import { mergeRestDialogueWave2 } from './RestDialogueExtras2.js';
import { mergeRestDialoguePopCulture } from './RestDialoguePopCulture.js';

/** 营火分支对话树 — speaker / mood / 章节门控 / NPC 联动 */
const _BASE_REST_DIALOGUES = {
  hub: {
    title: '世界之锚营火',
    nodes: {
      start: {
        speaker: '锚火看守',
        mood: 'calm',
        text: '火焰在世界之锚旁跳动，你能感到三个位面的脉动在此交汇。\n\n看守者抬眼：「又要出发了？」',
        choices: [
          { label: '休息 / 升级', action: 'rest' },
          { label: '这火从哪来？', next: 'origin' },
          { label: '打听当前使命', next: 'quest' },
          { label: '位面行者是什么？', next: 'walker', minChapter: 2 },
        ],
      },
      origin: {
        speaker: '锚火看守',
        mood: 'calm',
        text: '「锚点裂于三界之交。这火不是柴烧的 — 是位面摩擦出的余温。」\n\n收集碎片、重铸锚点，火才会稳定。',
        choices: [
          { label: '明白了，休息吧', action: 'rest' },
          { label: '还有别的事吗？', next: 'start' },
          { label: '魂火有什么用？', next: 'souls' },
        ],
      },
      souls: {
        speaker: '锚火看守',
        text: '「魂火在营火升级属性，也在「剧情技能」Tab 解锁叙事技。别攒太多 — Boss 不会等你。」',
        journal: { id: 'rest-hub-souls', title: '营火·魂火', text: '魂火用于升级与剧情技能。' },
        choices: [{ label: '休息', action: 'rest' }, { label: '返回', next: 'start' }],
      },
      walker: {
        speaker: '锚火看守',
        mood: 'warn',
        text: '「位面行者能穿越灰林、遗境与荒原 — 不是游客，是缝合裂隙的人。你已经在路上了。」',
        choices: [{ label: '继续休息', action: 'rest' }],
      },
      quest: {
        speaker: '锚火看守',
        text: null,
        choices: [
          { label: '去休息', action: 'rest' },
          { label: '返回', next: 'start' },
        ],
      },
    },
  },
  fantasy: {
    title: '灰白森林营火',
    nodes: {
      start: {
        speaker: '精灵斥候',
        text: '精灵斥候坐在火边擦剑。树皮烟味混着旧战争的铁锈气。',
        choices: [
          { label: '休息 / 升级', action: 'rest' },
          { label: '森林深处有什么？', next: 'deep' },
          { label: '教我一招', next: 'tip' },
          { label: '影界守护者？', next: 'boss1' },
        ],
      },
      deep: {
        speaker: '精灵斥候',
        text: '「至尊石环在西，Boss 红圈在东。地下城入口在北侧遗城 — 地图 G 键看紫点。」',
        choices: [{ label: '休息', action: 'rest' }, { label: '返回', next: 'start' }],
      },
      tip: {
        speaker: '精灵斥候',
        mood: 'warn',
        text: '「Q 锁定，第三段连击有**终结技** — 镜头会慢下来。敌人红圈最后一瞬 **F 弹反**，比硬扛聪明。」',
        choices: [{ label: '试试就休息', action: 'rest' }],
      },
      boss1: {
        speaker: '精灵斥候',
        mood: 'warn',
        text: '「影界守护者两阶段 — 红圈砸地前翻滚。弹反成功有**致命反击**慢镜头。别贪第三刀。」',
        journal: { id: 'rest-fantasy-boss1', title: '营火·影界', text: 'Boss 红圈砸地前翻滚；弹反有慢镜头反击。' },
        choices: [{ label: '休息', action: 'rest' }, { label: '返回', next: 'start' }],
      },
    },
  },
  magic: {
    title: '魔法遗境营火',
    nodes: {
      start: {
        speaker: '奥术旅者',
        text: '悬浮城堡的倒影在火焰里摇晃。奥术旅者自火焰中浮现半寸，又落回地面。',
        choices: [
          { label: '休息 / 升级', action: 'rest' },
          { label: '法术建议？', next: 'spell' },
          { label: '禁书图书馆在哪？', next: 'lib' },
          { label: '大奥术师弱点？', next: 'boss2', minChapter: 2 },
        ],
      },
      spell: {
        speaker: '奥术旅者',
        text: '「1–4 法术，长按蓄力。对大奥术师尤其有效 — 紫球飞来时先躲再反击。」',
        choices: [{ label: '休息', action: 'rest' }],
      },
      lib: {
        speaker: '奥术旅者',
        text: '「向南偏东，地图紫点。迷宫里读石碑 — 碎片会进日志 [J]。」',
        choices: [{ label: '休息', action: 'rest' }, { label: '返回', next: 'start' }],
      },
      boss2: {
        speaker: '奥术旅者',
        mood: 'warn',
        text: '「萨尔林会放紫色法球 — 靠近弹反可打断。二阶段法球加速，用法术牵制。」',
        choices: [{ label: '休息', action: 'rest' }],
      },
    },
  },
  space: {
    title: '米勒荒原营火',
    nodes: {
      start: {
        speaker: '宇航员回声',
        text: 'Endurance 号的应急火。宇航员回声的全息面罩映着星光。',
        choices: [
          { label: '休息 / 升级', action: 'rest' },
          { label: '引力井是什么？', next: 'well' },
          { label: '裂隙迷宫入口？', next: 'rift' },
          { label: '奇点领主？', next: 'boss3', minChapter: 3 },
        ],
      },
      well: {
        speaker: '宇航员回声',
        mood: 'warn',
        text: '「米勒荒原的引力井不是自然现象。奇点领主在井下挖东西 — 三阶段，别被拉进中心。」',
        choices: [{ label: '休息', action: 'rest' }],
      },
      rift: {
        speaker: '宇航员回声',
        text: '「裂隙观测站 — 地图东侧紫点。守钥者二阶段会加速，备好翻滚。」',
        choices: [{ label: '休息', action: 'rest' }],
      },
      boss3: {
        speaker: '宇航员回声',
        text: '「轨道弹幕会追踪 — 保持移动。蓄力法术可破引力盾。击败后有**Boss 击破**慢镜头。」',
        choices: [{ label: '休息', action: 'rest' }],
      },
    },
  },
  void: {
    title: '破碎时线营火',
    nodes: {
      start: {
        speaker: '时线残影',
        text: '时线在此折叠。火焰时而倒燃，时而静止 — 像被谁按了暂停。',
        choices: [
          { label: '休息 / 升级', action: 'rest' },
          { label: '时停怎么破？', next: 'stop' },
          { label: '隐藏 Boss？', next: 'hidden' },
          { label: '处决技巧？', next: 'exec' },
        ],
      },
      stop: {
        speaker: '时线残影',
        mood: 'warn',
        text: '「蓄力法术可打断时线执政官的时停。真火、引力都行 — 伤害要够。」',
        choices: [{ label: '休息', action: 'rest' }],
      },
      hidden: {
        speaker: '时线残影',
        text: '「时线执政官在裂隙北侧 — 不是主线三座 Boss 之一。击败它才能触及真·位面行者。」',
        journal: { id: 'rest-void-hidden', title: '营火·隐藏试炼', text: '时线执政官为隐藏 Boss。' },
        choices: [{ label: '休息', action: 'rest' }],
      },
      exec: {
        speaker: '时线残影',
        text: '「打满架势条后的重击会触发**处决** — 镜头绕轨锁定，时间变慢。别在时停里浪费。」',
        choices: [{ label: '休息', action: 'rest' }, { label: '返回', next: 'start' }],
      },
    },
  },
  abyss: {
    title: '混沌边境营火',
    nodes: {
      start: {
        speaker: '裂隙引路人',
        mood: 'warn',
        text: '混沌低语：「门越多，界越薄。」闪电在远处劈落，火却烧得稳。',
        choices: [
          { label: '休息 / 升级', action: 'rest' },
          { label: '终局建议', next: 'end' },
          { label: '深渊再探？', next: 'rerun' },
          { label: '混沌领主？', next: 'boss5', minChapter: 5 },
        ],
      },
      end: {
        speaker: '裂隙引路人',
        text: '「裂隙领主三阶段 — 混沌脉冲会灼烧近身。武器技能树在营火「剧情技能」Tab 查看。」',
        choices: [{ label: '休息', action: 'rest' }],
      },
      rerun: {
        speaker: '裂隙引路人',
        text: '「Ch5 后可重复挑战地下城 — 随机迷宫布局。全图 G 键，自定义路点 Shift+点击。」',
        choices: [{ label: '休息', action: 'rest' }],
      },
      boss5: {
        speaker: '裂隙引路人',
        mood: 'warn',
        text: '「终焉试炼。X 切换剑/杖，技能树加成拉满。击破瞬间 — 全屏慢镜头与 letterbox。」',
        choices: [{ label: '休息', action: 'rest' }],
      },
    },
  },
};

export const REST_DIALOGUES = mergeRestDialoguePopCulture(mergeRestDialogueWave2(mergeRestDialogueNodes(_BASE_REST_DIALOGUES)));

function highlightKeywords(text) {
  if (!text) return '';
  return text.replace(/\*\*(.+?)\*\*/g, '<strong class="dialog-kw">$1</strong>');
}

export class RestDialogue {
  constructor(game) {
    this.game = game;
    this.activeRest = null;
    this.visited = new Set();
    this.nodeVisited = new Set();
  }

  start(restPoint) {
    this.activeRest = restPoint;
    const tree = REST_DIALOGUES[restPoint.id ?? 'hub'];
    if (!tree) {
      this.game.combat.restHeal();
      this.game.upgrade.show(restPoint.name);
      return;
    }
    this._emit('open', restPoint.id, 'start', tree.nodes.start);
    this.game.audio?.restDialogueOpen?.();
    this._showNode(tree, 'start');
  }

  _emit(phase, restId, nodeId, node) {
    /* 事件名从登记表取（修 B44）：原来这里按 `phase` 拼字符串，
     * phase 写错就是一条没人监听也没人报错的 CustomEvent，扫描工具还看不见它。 */
    const type = Object.hasOwn(REST_DIALOGUE_EVENTS, phase) ? REST_DIALOGUE_EVENTS[phase] : null;
    if (!type) {
      throw new Error(`RestDialogue._emit: 未知对话阶段「${phase}」，可选：${Object.keys(REST_DIALOGUE_EVENTS).join(' / ')}`);
    }
    const def = REST_NPC_DEFS[restId];
    const preview = typeof node?.text === 'string' ? node.text.replace(/\*\*/g, '').split('\n')[0] : '';
    emit(type, {
      restId,
      nodeId,
      speaker: node?.speaker ?? def?.name,
      speakerId: restId,
      mood: node?.mood ?? 'calm',
      accent: def?.accent ?? '#c9a962',
      linePreview: preview,
    });
  }

  _showNode(tree, nodeId) {
    const node = tree.nodes[nodeId];
    if (!node) return;

    const chapter = this.game.quests?.chapter ?? 1;
    if (node.minChapter && chapter < node.minChapter) {
      this.game.dialog.toast(`需要 Chapter ${node.minChapter} 后再来问这个。`);
      this._showNode(tree, 'start');
      return;
    }

    let text = node.text;
    if (nodeId === 'quest' && tree === REST_DIALOGUES.hub) {
      const q = this.game.quests;
      text = q.current
        ? `当前：${q.current.title}\n${q.getProgressText()}\n\n${q.getAssistantHint()}`
        : '主线已完成 — 自由探索，或按 N 自动通关。';
    }

    const def = REST_NPC_DEFS[this.activeRest?.id];
    const filteredChoices = node.choices.filter((c) => !c.minChapter || chapter >= c.minChapter);

    const choices = filteredChoices.map((c, i) => ({
      id: String(i),
      label: c.label,
      onPick: () => this._pick(tree, c, nodeId),
    }));

    this._emit('node', this.activeRest.id, nodeId, node);
    this.nodeVisited.add(`${this.activeRest.id}:${nodeId}`);

    this.game.dialog.showChoices(tree.title, highlightKeywords(text), choices, {
      speaker: node.speaker ?? def?.name,
      speakerTitle: def?.title,
      accent: def?.accent ?? '#c9a962',
      mood: node.mood ?? 'calm',
      restId: this.activeRest.id,
      nodeId,
    });

    if (node.journal) {
      this.game.storyJournal?.add({
        ...node.journal,
        category: 'campfire',
        chapter,
      });
    }
  }

  _pick(tree, choice, fromNodeId) {
    if (choice.action === 'rest') {
      window.dispatchEvent(new CustomEvent('dialog-choice-picked', {
        detail: { action: 'rest', restId: this.activeRest?.id },
      }));
      window.dispatchEvent(new CustomEvent('rest-dialogue-close', { detail: { restId: this.activeRest?.id } }));
      window.dispatchEvent(new CustomEvent('dialog-overlay-hidden'));
      this.game.dialog.hide();
      this.game.combat.restHeal();
      this.game.upgrade.show(this.activeRest?.name);
      if (!this.visited.has(this.activeRest?.id)) {
        this.visited.add(this.activeRest?.id);
        this.game.stats.addSouls(5);
        this.game.dialog.toast('营火余温 +5 魂火');
        window.dispatchEvent(new CustomEvent('stats-changed', { detail: this.game.stats.toJSON() }));
      }
      const npc = this.game.restNpcs?.getByRestId?.(this.activeRest?.id);
      if (npc) this.game.dialog.toast(`${npc.name}：「愿火护佑下一程。」`, 2400);
      return;
    }
    if (choice.next) {
      this._showNode(tree, choice.next);
      return;
    }
    window.dispatchEvent(new CustomEvent('rest-dialogue-close', { detail: { restId: this.activeRest?.id } }));
    this.game.dialog.hide();
  }

  toJSON() {
    return { visited: [...this.visited], nodeVisited: [...this.nodeVisited] };
  }

  fromJSON(data) {
    if (!data) return;
    this.visited = new Set(data.visited ?? []);
    this.nodeVisited = new Set(data.nodeVisited ?? []);
  }
}
