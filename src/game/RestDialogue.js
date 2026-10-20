import { REST_NPC_DEFS } from '../content/restNpcDefs.js';
import { REST_DIALOGUE_EVENTS } from '../engine/events.js';
import { emit } from '../engine/EventBus.js';
// 对话树本体在 `content/restDialogues.js`（W-B2）：本文件只管运行时，不再存文案，
// 也不再把它转口一遍 —— 转口会让"这张表的真源在哪"重新变成两个答案。
import { REST_DIALOGUES } from '../content/restDialogues.js';
import { keyText } from '../content/keyHints.js';
import { t } from '../engine/i18n.js';

function highlightKeywords(text) {
  if (!text) return '';
  return text.replace(/\*\*(.+?)\*\*/g, '<strong class="dialog-kw">$1</strong>');
}

/**
 * 这一句是谁说的 → 给人看的名字（W-D2 切片15）。
 *
 * `REST_NPC_DEFS[zone].name` 存的是**文案键**，节点自己那 93 处 `speaker` 抄本已删净
 * （探针证明 93/93 逐字等于定义里的名字），所以这里的取值顺序仍是"节点若写了就用节点的
 * （写的话要是键），否则用这一座定义的名字"，只是**统一在出口展开一次**。
 * 认不出这一座就没有名字（返回 `undefined`，由调用方决定怎么显示），不冒充锚火看守 ——
 * 成对关系由 `registry.js` 的 `checkRestDialogueTree` 第四、五条开机核。
 */
function speakerNameOf(node, def) {
  const key = node?.speaker ?? def?.name;
  return key ? t(key) : undefined;
}

/** 这一座 NPC 的头衔（同样是键；认不出就没有） */
function speakerTitleOf(def) {
  return def?.title ? t(def.title) : undefined;
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
    // 认不出 id 的营火就走"没有对话"那一条（回血 + 升级面板），不再借世界之锚的台词说话
    const tree = REST_DIALOGUES[restPoint.id];
    if (!tree) {
      this.game.player.combat.restHeal();
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
    // 台词里的 `{动作}` 在**离开这张表之前**展开：下游（NPC 气泡、营火记忆）拿到的是给人看的那一份，
    // 它们不认识占位 —— 传一句 `{escape}` 过去就是让玩家在气泡里看见花括号。
    const preview = typeof node?.text === 'string' ? keyText(node.text).replace(/\*\*/g, '').split('\n')[0] : '';
    // 说话人名与配色只从 `REST_NPC_DEFS` 取（W-B4 切片1）：认不出这一座就没有名字 / 用默认色，
    // 而不是冒充锚火看守 —— 成对关系由 `registry.js` 的 `checkRestDialogueTree` 第四、五条开机核。
    // 名字在**离开这一格之前**换成给人看的那一份（W-D2 切片15）：`rest-dialogue` 的负载会被
    // 营火记忆存成日志条目，存进去的就是定稿，改语言之后回头翻不该看到键名。
    emit(type, {
      restId,
      nodeId,
      speaker: speakerNameOf(node, def),
      speakerId: restId,
      mood: node?.mood ?? 'calm',
      accent: def?.accent,
      linePreview: preview,
    });
  }

  _showNode(tree, nodeId) {
    const node = tree.nodes[nodeId];
    if (!node) return;

    const chapter = this.game.quests?.chapter ?? 1;
    if (node.minChapter && chapter < node.minChapter) {
      this.game.dialog.toast(t('dialog_toast_chapter_required', { chapter: node.minChapter }));
      this._showNode(tree, 'start');
      return;
    }

    // 台词与选项都是 `{动作}` 占位（W-B2 切片4）—— 出这张表的那一刻展开一次，
    // 让下游（对话框、气泡、营火记忆、日志）拿到的都是给人看的那一份。
    let text = node.text ? keyText(node.text) : node.text;
    if (nodeId === 'quest' && tree === REST_DIALOGUES.hub) {
      const q = this.game.quests;
      text = q.current
        ? t('rest_dialogue_progress_fmt', { title: q.current.title, progress: q.getProgressText(), hint: q.getAssistantHint() })
        : t('rest_dialogue_main_complete', { autoPlay: keyText('{autoPlay}') });
    }

    const def = REST_NPC_DEFS[this.activeRest?.id];
    const filteredChoices = node.choices.filter((c) => !c.minChapter || chapter >= c.minChapter);

    const choices = filteredChoices.map((c, i) => ({
      id: String(i),
      label: keyText(c.label),
      onPick: () => this._pick(tree, c, nodeId),
    }));

    this._emit('node', this.activeRest.id, nodeId, node);
    this.nodeVisited.add(`${this.activeRest.id}:${nodeId}`);

    // 标题说的是"这座火叫什么"，所以取营火自己的名字（`restPoints` 的那一格），不再抄在对话树里：
    // 抄本曾经和实际名漂过两座 —— 站在枢纽火边，提示写"世界之锚休息点"，一秒后对话标题写"世界之锚营火"
    // （W-B4 切片2）。名字表在 `content/restPointNames.js`，`keyText` 由 `Dialog` 那一道口径负责，这里不重复展开
    // W-D2 切片16i：营火名存的是**文案键**，展开走 `restPoints.nameOf()` 一处（那里把 `${zone}` 那格也算好）
    const 营火名 = this.game.restPoints?.nameOf?.(this.activeRest.id) ?? this.activeRest.name;
    this.game.dialog.showChoices(营火名, highlightKeywords(text), choices, {
      speaker: speakerNameOf(node, def),
      speakerTitle: speakerTitleOf(def),
      accent: def?.accent,
      mood: node.mood ?? 'calm',
      restId: this.activeRest.id,
      nodeId,
    });

    if (node.journal) {
      this.game.storyJournal?.add({
        ...node.journal,
        title: keyText(node.journal.title),
        text: keyText(node.journal.text),
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
      // 回血的宿主是 `player.combat`（`95c0533` 把 CombatController 从 Game 顶层搬进了 PlayerController）：
      // 读 `game.combat` 不报错、只是拿到 undefined，于是六座营火点"休息"全部当场崩 —— 修 B63
      this.game.player.combat.restHeal();
      this.game.upgrade.show(this.activeRest?.name);
      if (!this.visited.has(this.activeRest?.id)) {
        this.visited.add(this.activeRest?.id);
        this.game.stats.addSouls(5);
        this.game.dialog.toast(t('dialog_toast_rest_heal'));
        window.dispatchEvent(new CustomEvent('stats-changed', { detail: this.game.stats.toJSON() }));
      }
      const npc = this.game.restNpcs?.getByRestId?.(this.activeRest?.id);
      if (npc) this.game.dialog.toast(t('dialog_toast_npc_farewell', { name: npc.name }), 2400);
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
