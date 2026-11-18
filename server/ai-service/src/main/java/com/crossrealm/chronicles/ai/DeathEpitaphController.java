package com.crossrealm.chronicles.ai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
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
 * W-Z340「执笔人」—— 玩家在 Boss 面前倒下后，为这一滴残墨写下一句合适的话。
 *
 * <p>为什么存在：漏斗里从「首日引导完成」到「首个 Boss 通关」流失最大（Admin LLM P0 · 首个 boss 辅助组）。
 * 倒下那一刻是最容易失去耐心的节点；炉火那一边只送一句话——不劝不推、不绕过去，
 * 只是一句可能让他回来看一眼之前试过几次的话。</p>
 *
 * <p>口径：
 * <ul>
 *   <li>每次只回一句 ≤45 个字，分三档（≤3 / 4–6 / ≥7），由 user 行报数，system 冻结供 prompt-cache 复用；</li>
 *   <li>单 token 桶 {@code crossrealm-death-epitaph-v1}，与 ember / boss-verse 不共享；</li>
 *   <li>不出戏、不复述题干、不伪造 Boss；上游不可用时 503 而非 5xx，走 AiErrors.unavailable 的统一收口；</li>
 *   <li>调用方永远不该把这一句当打通进度——它只是一张纸条，掉线不阻塞重生。</li>
 *   <li>2026-11-18 起：compose（LLM）→ guard（确定性，leak 词表/长度/markdown）两节点 StateGraph 在 invoke；
 *       返回体新增 <b>guarded</b> 与 <b>path</b>（["compose","guard"]）。</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/ai")
public class DeathEpitaphController {

    /** ≤45 字、不出戏、不复述题干——三档语气的分水岭全压在 user 行的「倒下次数：%d」里。 */
    static final String DEATH_SYSTEM =
            "你是《跨界纪元》里替死在 Boss 面前的旅人收走残墨的执笔人。"
                    + "每次只回一句话，不超过 45 个字，用温和的口吻看看倒下了几次，给出正好合适的话：\n"
                    + "3 次以内：像递来一张只写了半行的纸条，鼓励他再来一次；\n"
                    + "4 到 6 次：像在旁边笑着看一眼，说一句松一口气的话；\n"
                    + "7 次以上：像过来人提醒他一句可能真正该注意的规律；\n"
                    + "不出戏、不用 Emoji、不复述题干、不编造不存在的 Boss 或招式。";

    /** 两节点图：compose（LLM）→ guard（确定性）。执笔人没有 lang 字段——默认按项目原生语言 zh 收尾。 */
    static final String NODE_COMPOSE = "compose";
    static final String NODE_GUARD = "guard";

    private final LlmClient client;
    private final StateGraph.Compiled graph;

    public DeathEpitaphController(LlmClient client) {
        this.client = client;
        this.graph = buildGraph();
    }

    private StateGraph.Compiled buildGraph() {
        StateGraph g = new StateGraph();
        g.addNode(NODE_COMPOSE, state -> {
            String user = "Boss：%s%n倒下次数：%d%n%n请收下这一滴残墨。"
                    .formatted(String.valueOf(state.get("bossName")),
                            ((Number) state.get("attempts")).intValue());
            LlmClient.Answer answer = client.complete(DEATH_SYSTEM, user, LlmClient.CacheKeys.DEATH_EPITAPH);
            return Map.<String, Object>of("rawLine", String.valueOf(answer.answer()),
                    "cached", answer.cached());
        });
        g.addNode(NODE_GUARD, state -> {
            EmberReplyController.GuardResult guarded = EmberReplyController.guardReply(
                    String.valueOf(state.getOrDefault("rawLine", "")), "zh");
            return Map.<String, Object>of("line", guarded.reply(), "guarded", guarded.guarded());
        });
        g.addEdge(NODE_COMPOSE, NODE_GUARD);
        g.setEntryPoint(NODE_COMPOSE);
        g.setMeta(NODE_COMPOSE, Map.<String, Object>of("kind", "llm", "stage", "epitaph", "persona", "poised-hand"));
        g.setMeta(NODE_GUARD, Map.<String, Object>of("kind", "deterministic", "stage", "gate", "persona", "safe-line"));
        return g.compile();
    }

    /** 输入全部限长并做类型棱角校验：倒下次数必须是 1..999 的整数。 */
    public record DeathRequest(
            @NotBlank @Size(max = 120) String bossName,
            @NotNull @Min(1) @Max(999) Integer attempts) {}

    @PostMapping("/death-epitaph")
    public Map<String, Object> deathEpitaph(@Valid @RequestBody DeathRequest request,
            @RequestHeader(value = "X-Request-Id", required = false) String headerRequestId) {
        Map<String, Object> initial = new LinkedHashMap<>();
        initial.put("bossName", request.bossName());
        initial.put("attempts", request.attempts());
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
