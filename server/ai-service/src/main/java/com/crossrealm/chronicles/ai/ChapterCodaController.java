package com.crossrealm.chronicles.ai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * W-Z343「残章」—— 当玩家跨过一章章节门的那一刻，炉火的记录者写下一句残章，悄悄落进他的日志。
 *
 * <p>为什么存在（Admin LLM P1 · 章节推进断点）：章级推进是玩家最容易「看一眼钟、叹一口气、关掉页面」的节点。
 * 弹窗会被关，通知会被扫过——而日志条目会留在那里，等他回来的那一晚。</p>
 *
 * <p>设计约定：
 * <ul>
 *   <li>每次只回一句 ≤60 个字，只按「上一章 → 下一章」连一行残章；system 冻结，user 行带章节号；</li>
 *   <li>单 token 桶 {@code crossrealm-chapter-coda-v1}；</li>
 *   <li>调用方永远是 fire-and-forget——这篇稿子迟到几秒、甚至没写到，都不该让章节门卡在那里等；</li>
 *   <li>上游不可用 503，不出戏，不伪造章节内容；语言分行（zh 中文，en 英文）各自冻结。</li>
 *   <li>2026-11-18 起：compose（LLM）→ guard（确定性，leak 词表/长度/markdown）两节点 StateGraph 在 invoke；
 *       返回体新增 <b>guarded</b> 与 <b>path</b>（["compose","guard"]）。</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/ai")
public class ChapterCodaController {

    static final String CODA_SYSTEM = PromptPrefixes.FROZEN_NPC_DISCIPLINE + "\n\n"
            + "本车道契约 · 残章执笔人 · 跨章\n"
            + "玩家刚刚跨过了一个章节门，从上一章走进了下一章。请只回一句话残章：\n"
            + "用炉火的口吻，像是他合上上一页时、角落里有人替他把灯拨亮了一点；\n"
            + "不写『第X章』、不写梗概、不预告下一场、不伪造事件。\n"
            + "长度档：zh 不超过 60 字（en 同等密度，不超过 90 字符）。";

    /** 两节点图：compose（LLM）→ guard（确定性）。lang 沿用请求（默认 zh）。 */
    static final String NODE_COMPOSE = "compose";
    static final String NODE_GUARD = "guard";

    private final LlmClient client;
    private final StateGraph.Compiled graph;

    public ChapterCodaController(LlmClient client) {
        this.client = client;
        this.graph = buildGraph();
    }

    private StateGraph.Compiled buildGraph() {
        StateGraph g = new StateGraph();
        g.addNode(NODE_COMPOSE, state -> {
            String lang = String.valueOf(state.getOrDefault("lang", "zh"));
            String user = "玩家报告的语言：%s%n上一章：第%d章 →%n下一章：第%d章 %n%n请收下这一页落笔。"
                    .formatted(lang,
                            ((Number) state.get("prev")).intValue(),
                            ((Number) state.get("chapter")).intValue());
            LlmClient.Answer answer = client.complete(CODA_SYSTEM, user, LlmClient.CacheKeys.CHAPTER_CODA);
            return Map.<String, Object>of("rawLine", String.valueOf(answer.answer()),
                    "cached", answer.cached());
        });
        g.addNode(NODE_GUARD, state -> {
            String lang = String.valueOf(state.getOrDefault("lang", "zh"));
            EmberReplyController.GuardResult guarded = EmberReplyController.guardReply(
                    String.valueOf(state.getOrDefault("rawLine", "")), lang);
            return Map.<String, Object>of("line", guarded.reply(), "guarded", guarded.guarded());
        });
        g.addEdge(NODE_COMPOSE, NODE_GUARD);
        g.setEntryPoint(NODE_COMPOSE);
        g.setMeta(NODE_COMPOSE, Map.<String, Object>of("kind", "llm", "stage", "coda", "persona", "scribe-of-thresholds"));
        g.setMeta(NODE_GUARD, Map.<String, Object>of("kind", "deterministic", "stage", "gate", "persona", "safe-line"));
        return g.compile();
    }

    public record CodaRequest(
            @NotNull @Min(1) @Max(99) Integer chapter,
            @NotNull @Min(1) @Max(99) Integer prev,
            String lang) {}

    @PostMapping("/chapter-coda")
    public Map<String, Object> chapterCoda(@Valid @RequestBody CodaRequest request,
            @RequestHeader(value = "X-Request-Id", required = false) String headerRequestId) {
        String lang = request.lang() == null || request.lang().isBlank() ? "zh" : request.lang();
        Map<String, Object> initial = new LinkedHashMap<>();
        initial.put("lang", lang);
        initial.put("prev", request.prev());
        initial.put("chapter", request.chapter());
        StateGraph.CompiledInvoke result = graph.invoke(initial);
        Map<String, Object> state = result.state();
        List<String> path = result.trace().stream().map(StateGraph.TraceEntry::node).toList();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("available", true);
        body.put("line", state.get("line"));
        body.put("cached", state.get("cached"));
        body.put("guarded", state.get("guarded"));
        body.put("path", path);
        String effectiveRequestId = RequestCorrelation.sanitizeInbound(headerRequestId);
        if (effectiveRequestId != null) {
            body.put("requestId", effectiveRequestId);
        }
        return body;
    }

    @ExceptionHandler(AdvisorUnavailableException.class)
    public ResponseEntity<Map<String, Object>> unavailable(AdvisorUnavailableException e) {
        return AiErrors.unavailable(e.getReason());
    }
}
