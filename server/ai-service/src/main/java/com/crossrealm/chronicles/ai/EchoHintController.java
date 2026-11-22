package com.crossrealm.chronicles.ai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * W-X22「回声灯」收编版（原本散落在 game-service 的未接线半成品）。
 *
 * <p>为什么要搬进 ai-service：① 网关的 {@code /api/ai/**} 已经指向这里——
 * 留在 game-service 的端点*永远收不到请求*；② 密钥只该有一个进程持有；
 * ③ 回声灯同样需要超时、重试、熔断与缓存 —— 这些在 {@link LlmClient#complete}
 * 里只有一份，再写一套等于两份迟早对不上的口径。
 *
 * <p>人格提示与星轨顾问*刻意不同*：顾问是守在篝火边的旅人，回声灯是梦话般的先知。
 *
 * <p>2026-11-19 起：compose（LLM）→ guard（确定性，leak 词表/长度/markdown）两节点 StateGraph
 * 在 invoke；返回体新增<b>guarded</b> 与 <b>path</b>（["compose","guard"]）。
 * 回声灯提示词是中文冻结口径，guard 按 zh 收敛（60 字 / leak 词表）。
 */
@RestController
@RequestMapping("/api/ai")
public class EchoHintController {

    /** 45 字、不出戏、不解释的先知口吻。 */
    static final String ECHO_SYSTEM =
            "你是《跨界纪元》里的回声先知。每次只回一句短句（zh 中文不超过 45 字，en 英文不超过 60 字符）。"
                    + "用玩家报告的语言写这一句。像在说梦话一样点出这一枚回声的来历或去处；"
                    + "不解释、不加 Emoji、不出戏、不复述玩家给的原句。";

    /** 允许的语言白名单，与 KindleLetter / DeathEpitaph 同一套纪律。 */
    private static final java.util.Set<String> LANGS = java.util.Set.of("zh", "en");

    /** 两节点图：compose（LLM）→ guard（确定性）。提示词中文冻结口径，guard 按 zh 收敛。 */
    static final String NODE_COMPOSE = "compose";
    static final String NODE_GUARD = "guard";

    private final LlmClient client;
    private final StateGraph.Compiled graph;

    public EchoHintController(LlmClient client) {
        this.client = client;
        this.graph = buildGraph();
    }

    private StateGraph.Compiled buildGraph() {
        StateGraph g = new StateGraph();
        g.addNode(NODE_COMPOSE, state -> {
            String lang = String.valueOf(state.getOrDefault("lang", "zh"));
            String user = "玩家报告的语言：" + lang + "\n" + String.valueOf(state.get("user"));
            LlmClient.Answer answer = client.complete(
                    ECHO_SYSTEM,
                    user,
                    LlmClient.CacheKeys.ECHO);
            return Map.<String, Object>of(
                    "rawHint", String.valueOf(answer.answer()),
                    "cached", answer.cached(),
                    "upstreamCached", answer.upstreamCached(),
                    "model", answer.model());
        });
        g.addNode(NODE_GUARD, state -> {
            String lang = String.valueOf(state.getOrDefault("lang", "zh"));
            EmberReplyController.GuardResult guarded = EmberReplyController.guardReply(
                    String.valueOf(state.getOrDefault("rawHint", "")), lang);
            return Map.<String, Object>of("hint", guarded.reply(), "guarded", guarded.guarded());
        });
        g.addEdge(NODE_COMPOSE, NODE_GUARD);
        g.setEntryPoint(NODE_COMPOSE);
        g.setMeta(NODE_COMPOSE, Map.<String, Object>of("kind", "llm", "stage", "echo-hint", "persona", "sleepwalking-oracle"));
        g.setMeta(NODE_GUARD, Map.<String, Object>of("kind", "deterministic", "stage", "gate", "persona", "safe-line"));
        return g.compile();
    }

    /** 输入全部限长：它们会被拼进提示词，不是一条可以无限长的管道。 */
    public record EchoRequest(
            @NotBlank @Size(max = 64) String franchise,
            @NotBlank @Size(max = 120) String title,
            @Size(max = 400) String desc,
            @Size(max = 8) String lang) {}

    @PostMapping("/echo-hint")
    public Map<String, Object> echoHint(@Valid @RequestBody EchoRequest request,
            @RequestHeader(value = "X-Request-Id", required = false) String headerRequestId) {
        String lang = request.lang() == null || request.lang().isBlank() ? "zh" : request.lang();
        if (!LANGS.contains(lang)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid-lang");
        }
        // 与 BossVerse/KindleLetter 同一道防线：控制字符在入口抹掉，再拼进提示词。
        String franchise = sanitize(request.franchise());
        String title = sanitize(request.title());
        String desc = request.desc() == null ? "" : sanitize(request.desc());
        String user = "母题：%s\n回声名：%s\n回声描述：%s\n\n请给一个游戏内的暗示（只回一句）。"
                .formatted(franchise, title, desc.isBlank() ? "（无描述）" : desc);

        Map<String, Object> initial = new LinkedHashMap<>();
        initial.put("lang", lang);
        initial.put("user", user);
        StateGraph.CompiledInvoke result = graph.invoke(initial);
        Map<String, Object> state = result.state();
        List<String> path = result.trace().stream().map(StateGraph.TraceEntry::node).toList();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("available", true);
        body.put("hint", state.get("hint"));
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

    /** 控制字符（C0 + DEL）折成空格：它们会被拼进提示词，不是可显示的正文。 */
    private static String sanitize(String in) {
        return in.replaceAll("[\\x00-\\x1f\\x7f]", " ").trim();
    }

    @ExceptionHandler(AdvisorUnavailableException.class)
    public ResponseEntity<Map<String, Object>> unavailable(AdvisorUnavailableException e) {
        return AiErrors.unavailable(e.getReason());
    }
}
