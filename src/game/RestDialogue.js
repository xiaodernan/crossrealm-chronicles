import { REST_NPC_DEFS } from '../content/restNpcDefs.js';
import { REST_DIALOGUE_EVENTS } from '../engine/events.js';
import { emit } from '../engine/EventBus.js';
// 对话树本体在 `content/restDialogues.js`（W-B2）：本文件只管运行时，不再存文案，
// 也不再把它转口一遍 —— 转口会让"这张表的真源在哪"重新变成两个答案。
import { REST_DIALOGUES } from '../content/restDialogues.js';
import { keyText } from '../content/keyHints.js';

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
    // 台词里的 `{动作}` 在**离开这张表之前**展开：下游（NPC 气泡、营火记忆）拿到的是给人看的那一份，
    // 它们不认识占位 —— 传一句 `{escape}` 过去就是让玩家在气泡里看见花括号。
    const preview = typeof node?.text === 'string' ? keyText(node.text).replace(/\*\*/g, '').split('\n')[0] : '';
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

    // 台词与选项都是 `{动作}` 占位（W-B2 切片4）—— 出这张表的那一刻展开一次，
    // 让下游（对话框、气泡、营火记忆、日志）拿到的都是给人看的那一份。
    let text = node.text ? keyText(node.text) : node.text;
    if (nodeId === 'quest' && tree === REST_DIALOGUES.hub) {
      const q = this.game.quests;
      text = q.current
        ? `当前：${q.current.title}\n${q.getProgressText()}\n\n${q.getAssistantHint()}`
        : keyText('主线已完成 — 自由探索，或按 {autoPlay} 自动通关。');
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

    this.game.dialog.showChoices(keyText(tree.title), highlightKeywords(text), choices, {
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
