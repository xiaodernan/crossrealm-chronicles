package com.crossrealm.chronicles.ai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * W-Z292「烬灯回信 · 烬火答」—终局之后，玩家给炉火写下的那一行字，炉火写回来。
 *
 * <p>这是「LLM 作为 NPC」的第一步：终章落定之后，[J] 里开了一整页专页——
 * 终结不是终点，是把信纸摊开的时刻。玩家写一行，炉火写一行，多少次都可以。
 *
 * <p>约束（与 Arbiter 一脉相承）：
 * <ul>
 *   <li><b>收信人的母语</b>：lang 由白名单收敛（zh / en）。</li>
 *   <li><b>注入防线</b>：playerLine 控制字符净化 + 双卡（@NotBlank + @Size(280)）；
 *       choice 白名单（keep / quiet / unwritten）。</li>
 *   <li><b>内容裁决</b>：不出戏、不解释机制、不编造数值、不编造不存在的人与事。</li>
 *   <li>2026-11-19 起：compose（LLM）→ guard（确定性，leak 词表/长度/markdown）两节点 StateGraph
 *       在 invoke；返回体新增<b>guarded</b> 与 <b>path</b>（["compose","guard"]）。</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/ai")
public class KindleLetterController {

    /** 炉火答结尾：烬火答自己那条车道的收敛边际规则（v4 全量前缀承载"你是谁"时，也得在收敛条款里钉住人格）。 */
    static final String KINDLE_LETTER_CONTRACT =
            "你是炉火的记录者。\n"
            + "\n【炉火车道 · 烬火答】一位走完全程并做出终局抉择的旅人，把这趟旅程的余温交回给你之后，又写了一行字给你。请基于这行字写回。\n"
            + "· 只写一行，不超过 60 个字（zh）/ 72 个字符（en）。\n"
            + "· 守夜人在场——不在评判，不在分析，只是每句都稳。\n";

    /** 炉火答冻结 system = v4 全量大前缀（~4-5 万 tok） + 烬火答车道收敛（W-Z456：终局大场专用） */
    static final String KINDLE_LETTER_SYSTEM = PromptPrefixes.FROZEN_CANON_CONTEXT_V4 + KINDLE_LETTER_CONTRACT;

    /** 两节点图：compose（LLM）→ guard（确定性）。lang 沿用请求（默认 zh）。 */
    static final String NODE_COMPOSE = "compose";
    static final String NODE_GUARD = "guard";

    private static final Set<String> CHOICES = Set.of("keep", "quiet", "unwritten");
    private static final Set<String> LANGS = Set.of("zh", "en");

    private final LlmClient client;
    private final StateGraph.Compiled graph;

    public KindleLetterController(LlmClient client) {
        this.client = client;
        this.graph = buildGraph();
    }

    private StateGraph.Compiled buildGraph() {
        StateGraph g = new StateGraph();
        g.addNode(NODE_COMPOSE, state -> {
            LlmClient.Answer answer = client.complete(
                    KINDLE_LETTER_SYSTEM,
                    String.valueOf(state.get("user")),
                    LlmClient.CacheKeys.KINDLE_LETTER);
            return Map.<String, Object>of(
                    "rawReply", String.valueOf(answer.answer()),
                    "cached", answer.cached(),
                    "upstreamCached", answer.upstreamCached(),
                    "model", answer.model());
        });
        g.addNode(NODE_GUARD, state -> {
            String lang = String.valueOf(state.getOrDefault("lang", "zh"));
            EmberReplyController.GuardResult guarded = EmberReplyController.guardReply(
                    String.valueOf(state.getOrDefault("rawReply", "")), lang);
            return Map.<String, Object>of("reply", guarded.reply(), "guarded", guarded.guarded());
        });
        g.addEdge(NODE_COMPOSE, NODE_GUARD);
        g.setEntryPoint(NODE_COMPOSE);
        g.setMeta(NODE_COMPOSE, Map.<String, Object>of("kind", "llm", "stage", "kindle-letter", "persona", "keeper-of-the-ashes"));
        g.setMeta(NODE_GUARD, Map.<String, Object>of("kind", "deterministic", "stage", "gate", "persona", "safe-line"));
        return g.compile();
    }

    /** 输入全部限长：它们会被拼进提示词，不是一条可以无限长的管道。 */
    public record KindleLetterRequest(
            @NotBlank @Size(max = 280) String line,
            @NotBlank @Size(max = 16) String choice,
            @NotBlank @Size(max = 8) String lang,
            @Size(max = 500) String stats) {}

    @PostMapping("/kindle-letter")
    public Map<String, Object> kindleLetter(@Valid @RequestBody KindleLetterRequest request,
            @RequestHeader(value = "X-Request-Id", required = false) String headerRequestId) {
        String lang = sanitize(request.lang());
        if (!LANGS.contains(lang)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid-lang");
        }
        String choice = sanitize(request.choice());
        if (!CHOICES.contains(choice)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid-choice");
        }
        String line = sanitize(request.line());
        String stats = request.stats() == null ? "" : sanitize(request.stats());

        String user = ("终局抉择(choice)：%s\n"
                + "收信人写来的那一行：%s\n"
                + "旅途账本（stats, 紧凑 JSON 片段）：%s\n"
                + "\n请写回那一行（只写那一行）。\n")
                .formatted(choice, line, stats.isBlank() ? "（无账本数据）" : stats);

        Map<String, Object> initial = new LinkedHashMap<>();
        initial.put("lang", lang);
        initial.put("user", user);
        StateGraph.CompiledInvoke result = graph.invoke(initial);
        Map<String, Object> state = result.state();
        List<String> path = result.trace().stream().map(StateGraph.TraceEntry::node).toList();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("available", true);
        body.put("reply", state.get("reply"));
        body.put("model", state.get("model"));
        body.put("cached", state.get("cached"));
        body.put("upstreamCached", state.get("upstreamCached"));
        body.put("guarded", state.get("guarded"));
        body.put("path", path);
        String effectiveRequestId = RequestCorrelation.sanitizeInbound(headerRequestId);
        if (effectiveRequestId != null) {
            body.put("requestId", effectiveRequestId);
        }
        return body;
    }

    /** 信纸只能做人话：控制字符（换行 / 退格 / ESC 等）一律抹掉，再由 @Size 卡长度。 */
    private static String sanitize(String in) {
        return in.replaceAll("[\\x00-\\x1f\\x7f]", " ").trim();
    }

    @ExceptionHandler(AdvisorUnavailableException.class)
    public ResponseEntity<Map<String, Object>> unavailable(AdvisorUnavailableException e) {
        return AiErrors.unavailable(e.getReason());
    }
}
