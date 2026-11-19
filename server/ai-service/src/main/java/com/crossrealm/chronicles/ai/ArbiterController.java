package com.crossrealm.chronicles.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
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
 * W-Z288「烬灯回信」—终章抉择之后，炉火为玩家亲笔写下的一封短信。
 *
 * <p>为什么它和顾问 / 回声灯长得都不一样：
 * <ul>
 *   <li><b>输入是账本，不是提问</b>：{@code choice} 是玩家亲手按下的终局抉择（留灯 / 安静走完 / 老档未显式选）；
 *       {@code stats} 是旅途账本的紧凑 JSON 片段（回声数 / 通关数 / 探索数 / 击杀数等）；模型只准收束旅途，
 *       不准编造任何数值、掉落、版本号、地名。</li>
 *   <li><b>输出是内容，不是对话</b>：回信分三行（题名 / 正文 / 下一次指向），全部由客户端解析后按
 *       {@code textContent} 落盘；模型回的 JSON 文本从来不进游戏 DOM 的 innerHTML 路径。</li>
 *   <li><b>失败要静默</b>：AiErrors 503 + AdvisorUnavailableException——客户端收到不可达即悄悄回退，
 *       片尾不假装「它说过话」。玩家永远不需要理解这个端点。</li>
 *   <li>2026-11-19 起：compose（LLM）→ parse（确定性）两节点 StateGraph 在 invoke；
 *       服务端不再只透传 raw——它会把模型回信解析并校验成 {title, epilogue, omen}。
 *       解析失败返回 parsed=null + guarded=true（客户端既有行为：整段不渲染，片尾依旧完整）。
 *       返回体新增<b>parsed / guarded / path</b>，<b>raw</b> 原样保留（客户端解析器零改动）。</li>
 * </ul>
 * </p>
 */
@RestController
@RequestMapping("/api/ai")
public class ArbiterController {

    /** 烬灯记录者的人格：只收束旅途，不出戏，不编造，三行输出，语言随玩家。**W-Z456**：v4 全量大前缀打底（~4-5 万 tok）——一次上下文顶 25 次 v3。 */
    static final String ARBITER_CONTRACT =
            "你是《跨界纪事》里炉火的记录者。玩家刚刚走完终章，并且在门前做好了自己的终局抉择。\n"
            + "请基于他的旅途数据，为他写一封短信。\n"
            + "\n"
            + "严格只输出一个 JSON 对象，不要任何额外字符、不要前言、不要解释，键必须是英文：\n"
            + "{\"title\":\"不超过 12 个字的题名\",\"epilogue\":\"不超过 70 个字的归途短句\",\"omen\":\"不超过 26 个字的下一次指向\"}\n"
            + "\n"
            + "规则：\n"
            + "· choice=keep（留灯，把火留给后来人）：题名用门开着的语气，话里要有人还会进来。\n"
            + "· choice=quiet（安静走完，把旅程收好）：题名用门收起来的语气，话里要有走完的人被郑重看见。\n"
            + "· choice=unwritten（老档 / 未显式抉择）：题名用雾还在等的语气，话里不替任何人选。\n"
            + "· 不编造任何具体数值、掉落、版本号或地名；旅途数据只作情绪与密度的依据。\n"
            + "· epilogue 可以出现母题、回声、判官、铁矿、白桦、七百年、炉火、守夜人、锚点这类本作印记。\n"
            + "· 用收信人的母语回答：zh 用中文，en 用英文；三行都必须同语。\n"
            + "· 三行都是内容，没有对白、没有引号标出说话人、没有列表。\n";

    /** 系统 = v4 全量大前缀 + 烬灯回信的车道收敛（cache key 单桶：v4 前缀与 Oracle 共享同一 cache page） */
    static final String ARBITER_SYSTEM = PromptPrefixes.FROZEN_CANON_CONTEXT_V4 + ARBITER_CONTRACT;

    static final String NODE_COMPOSE = "compose";
    static final String NODE_PARSE = "parse";

    private static final Pattern JSON_BLOCK = Pattern.compile("\\{[\\s\\S]*\\}");
    private static final int TITLE_CAP = 30;
    private static final int EPILOGUE_CAP = 160;
    private static final int OMEN_CAP = 60;
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static final Set<String> CHOICES = Set.of("keep", "quiet", "unwritten");
    private static final Set<String> LANGS = Set.of("zh", "en");

    private final LlmClient client;
    private final StateGraph.Compiled graph;

    public ArbiterController(LlmClient client) {
        this.client = client;
        this.graph = buildGraph();
    }

    private StateGraph.Compiled buildGraph() {
        StateGraph g = new StateGraph();
        g.addNode(NODE_COMPOSE, state -> {
            LlmClient.Answer answer = client.complete(
                    ARBITER_SYSTEM,
                    String.valueOf(state.get("user")),
                    LlmClient.CacheKeys.ARBITER);
            return Map.<String, Object>of(
                    "raw", String.valueOf(answer.answer()),
                    "cached", answer.cached(),
                    "upstreamCached", answer.upstreamCached(),
                    "model", answer.model());
        });
        g.addNode(NODE_PARSE, state -> {
            Map<String, Object> parsed = parseArbiterJson(String.valueOf(state.getOrDefault("raw", "")));
            return parsed == null
                    ? Map.<String, Object>of("parsed", Map.of(), "guarded", true, "parseFailed", true)
                    : Map.<String, Object>of("parsed", parsed, "guarded", false, "parseFailed", false);
        });
        g.addEdge(NODE_COMPOSE, NODE_PARSE);
        g.setEntryPoint(NODE_COMPOSE);
        g.setMeta(NODE_COMPOSE, Map.<String, Object>of("kind", "llm", "stage", "arbiter", "persona", "keeper-of-the-finale"));
        g.setMeta(NODE_PARSE, Map.<String, Object>of("kind", "deterministic", "stage", "gate", "persona", "three-lines-parser"));
        return g.compile();
    }

    /**
     * 确定性解析 + 裁决：找第一段 {...} → JSON.parse → 三个字段必须是非空字符串 →
     * 逐字段剥 markdown / leak 词表检查 / 码点截断 —— 任何一步失败返回 null（guarded=true），
     * 绝不把模型的半成品当内容落屏。
     */
    static Map<String, Object> parseArbiterJson(String raw) {
        if (raw == null) {
            return null;
        }
        Matcher m = JSON_BLOCK.matcher(raw.replaceAll("[\\x00-\\x1f\\x7f]", " "));
        if (!m.find()) {
            return null;
        }
        try {
            JsonNode root = MAPPER.readTree(m.group());
            String title = field(root, "title", TITLE_CAP);
            String epilogue = field(root, "epilogue", EPILOGUE_CAP);
            String omen = field(root, "omen", OMEN_CAP);
            if (title == null || epilogue == null) {
                return null;
            }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("title", title);
            out.put("epilogue", epilogue);
            out.put("omen", omen == null ? "" : omen);
            return out;
        } catch (Exception e) {
            return null;
        }
    }

    private static String field(JsonNode root, String key, int cap) {
        JsonNode node = root.get(key);
        if (node == null || !node.isTextual()) {
            return null;
        }
        String text = node.asText();
        String cleaned = LlmGuards.stripMarkdown(text).trim();
        if (cleaned.isBlank() || LlmGuards.containsLeak(cleaned)) {
            return null;
        }
        int cps = (int) cleaned.codePointCount(0, cleaned.length());
        if (cps > cap) {
            cleaned = cleaned.substring(0, cleaned.offsetByCodePoints(0, cap));
        }
        return cleaned;
    }

    /** 输入全部限长：它们会被拼进提示词，不是一条可以无限长的管道。 */
    public record ArbiterRequest(
            @NotBlank @Size(max = 16) String choice,
            @NotBlank @Size(max = 8) String lang,
            @Size(max = 500) String stats,
            @Size(max = 64) String player) {}

    @PostMapping("/arbiter")
    public Map<String, Object> arbiter(@Valid @RequestBody ArbiterRequest request,
            @RequestHeader(value = "X-Request-Id", required = false) String headerRequestId) {
        String choice = sanitize(request.choice());
        if (!CHOICES.contains(choice)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid-choice");
        }
        String lang = sanitize(request.lang());
        if (!LANGS.contains(lang)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid-lang");
        }
        String stats = request.stats() == null ? "" : sanitize(request.stats());
        String player = request.player() == null ? "" : sanitize(request.player());

        String user = ("终局抉择(choice)：%s\n"
                + "旅途账本(stats, 紧凑 JSON 片段)：%s\n"
                + "收信人(player)：%s\n"
                + "语言(language)：%s\n"
                + "\n请写归途短信（只输出 JSON）。\n")
                .formatted(choice,
                        stats.isBlank() ? "（无账本数据）" : stats,
                        player.isBlank() ? "（一名无名旅人）" : player,
                        lang);

        Map<String, Object> initial = new LinkedHashMap<>();
        initial.put("lang", lang);
        initial.put("user", user);
        StateGraph.CompiledInvoke result = graph.invoke(initial);
        Map<String, Object> state = result.state();
        List<String> path = result.trace().stream().map(StateGraph.TraceEntry::node).toList();

        boolean parseFailed = Boolean.TRUE.equals(state.get("parseFailed"));
        @SuppressWarnings("unchecked")
        Map<String, Object> parsed = parseFailed ? null : (Map<String, Object>) state.get("parsed");

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("available", true);
        body.put("raw", state.get("raw"));
        body.put("parsed", parsed);
        body.put("guarded", state.get("guarded"));
        body.put("path", path);
        body.put("model", state.get("model"));
        body.put("cached", state.get("cached"));
        body.put("upstreamCached", state.get("upstreamCached"));
        String effectiveRequestId = RequestCorrelation.sanitizeInbound(headerRequestId);
        if (effectiveRequestId != null) {
            body.put("requestId", effectiveRequestId);
        }
        return body;
    }

    /** 账本与名字只能做人话，不做协议：控制字符（换行 / 退格 / ESC 等）一律抹掉，再由 @Size 卡长度。 */
    private static String sanitize(String in) {
        return in.replaceAll("[\\x00-\\x1f\\x7f]", " ").trim();
    }

    @ExceptionHandler(AdvisorUnavailableException.class)
    public ResponseEntity<Map<String, Object>> unavailable(AdvisorUnavailableException e) {
        return AiErrors.unavailable(e.getReason());
    }
}
