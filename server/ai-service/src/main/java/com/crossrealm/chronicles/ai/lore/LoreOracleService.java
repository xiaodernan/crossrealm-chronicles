package com.crossrealm.chronicles.ai.lore;

import com.crossrealm.chronicles.ai.LlmClient;
import com.crossrealm.chronicles.ai.LlmGuards;
import com.crossrealm.chronicles.ai.StateGraph;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * The Lore Oracle — a retrieval-augmented answer channel for canon questions.
 *
 * <p>Ranking: BM25 over the corpus (no vector DB; fully in-memory). The LLM only ever reads:
 *   (1) the system oracle prompt, and
 *   (2) the retrieved excerpts with bracket citations.
 *
 * <p>{@code retrieve()} is a tiny two-stage state machine (W-Z84, the LangGraph shape, no edges, one lane):
 * <pre>
 *   RETRIEVE(primary=BM25(question)) → ENRICH(bigram/entity candidates by inverse df, ≤3, +2 each) → ANSWER(LLM)
 * </pre>
 * The enrichment stage only <b>widens recall</b> for compound questions (「林渡和引擎为什么都不熄火？」-shaped);
 * it never replaces or reorders primary hits, never calls the LLM again, and is a single switch away
 * ({@code ai-service.lore.multihop=false}) from the pre-W-Z84 behavior.
 *
 * <p>Concurrency posture: every method is thread-safe via the underlying LlmClient
 * (circuit breaker, cache, retry). No locks added here.
 */
@Service
public class LoreOracleService {

    /** Result shape mirrored in the HTTP response. {@code path} = the StateGraph nodes actually walked (retrieve → compose → gate / retrieve → gate on a no-match short-circuit). */
    public record OracleResult(boolean ok, String answer, List<String> sources, String model,
            boolean cached, boolean upstreamCached, long latencyMs, boolean guarded, List<String> path) {}

    private final LlmClient client;
    private final Bm25Index index;
    private final StateGraph.Compiled oracleGraph;
    /** W-Z485：史诗深潜——v5 双语全量前缀 + 独立 cache lane；与普通 Oracle 图同形、系统/缓存键不同。 */
    private final StateGraph.Compiled oracleDeepGraph;

    @Value("${ai-service.lore.limit:4}")
    private int defaultLimit;

    @Value("${ai-service.lore.multihop:true}")
    private boolean multihop;

    static final String NODE_RETRIEVE = "retrieve";
    static final String NODE_COMPOSE = "compose";
    static final String NODE_GATE = "gate";

    /** 没有任何典籍子句命中的拒绝语——和「han」一样稳定，客户端可以依赖它判断「典籍没有」。 */
    static final String REFUSAL = "此物未在典籍中 · This is not in the record.";

    public LoreOracleService(LlmClient client, Bm25Index index) {
        this.client = client;
        this.index = index;
        this.oracleGraph = buildOracleGraph();
        this.oracleDeepGraph = buildOracleGraph(true);
    }

    /** 普通 Oracle（v4）图。 */
    private StateGraph.Compiled buildOracleGraph() {
        return buildOracleGraph(false);
    }

    /** 检索→编排→门禁三节点 StateGraph 在 invoke；未命中子句时 compose 节点整个跳过（不打 LLM）。 */
    private StateGraph.Compiled buildOracleGraph(boolean deep) {
        StateGraph g = new StateGraph();
        g.addNode(NODE_RETRIEVE, state -> {
            String question = String.valueOf(state.get("question"));
            int limit = clampLimit((Integer) state.get("limitRaw"));
            List<Bm25Index.Hit> hits = retrieve(question, limit);
            Map<String, Object> patch = new LinkedHashMap<>();
            patch.put("hitCount", hits.size());
            patch.put("hits", new ArrayList<Bm25Index.Hit>(hits));
            patch.put("sources", hits.stream().map(h -> h.doc().source()).distinct().toList());
            return patch;
        });
        g.addConditionalEdges(NODE_RETRIEVE, state ->
                ((Number) state.getOrDefault("hitCount", 0)).intValue() > 0 ? NODE_COMPOSE : NODE_GATE);
        g.addNode(NODE_COMPOSE, state -> {
            String question = String.valueOf(state.get("question"));
            List<Bm25Index.Hit> hits = new ArrayList<>();
            Object rawHits = state.get("hits");
            if (rawHits instanceof List<?> list) {
                for (Object o : list) {
                    if (o instanceof Bm25Index.Hit hit) {
                        hits.add(hit);
                    }
                }
            }
            if (hits.isEmpty()) {
                return Map.<String, Object>of("rawAnswer", "", "model", "none",
                        "cached", false, "upstreamCached", false, "latencyMs", 0L);
            }
            StringBuilder firstBlock = new StringBuilder();
            Bm25Index.Hit anchor = hits.get(0);
            firstBlock.append("[").append(anchor.doc().source()).append("]\n")
                    .append(anchor.doc().text().trim());
            StringBuilder rest = new StringBuilder();
            for (int i = 1; i < hits.size(); i++) {
                rest.append("[").append(hits.get(i).doc().source()).append("]\n")
                        .append(hits.get(i).doc().text().trim())
                        .append("\n\n---\n\n");
            }
            String system = deep ? loadOracleSystemDeep() : loadOracleSystem();
            String routeNote = prefersRealWorldRefs(question) ? "\n\n" + REALWORLD_ROUTE_NOTE : "";
            String user = "Player question (use the language the player asked in):\n" + question
                    + routeNote
                    + "\n\nMost relevant excerpt (quote it verbatim if it answers the question):\n\n"
                    + firstBlock.toString().trim()
                    + (rest.length() > 0 ? "\n\nOther excerpts (use only if the first doesn't answer):\n\n"
                            + rest.toString().trim() : "")
                    + "\n\nReminder (read this FIRST):\nThe question asks about the entry in the **most relevant excerpt** block — locate its heading line (the one containing the exact name from the player question) and answer with that block's line verbatim. If no heading line contains the asked name, refuse with 「此物未在典籍中 · This is not in the record.」\n\nQuote branch: if the player question quotes a line verbatim (any quote/quotation marks included), treat the quoted text as the \"name\" to locate — find the excerpt line containing that quote exactly, and answer with that quote together with the file path it came from. Only refuse when the quoted text does not appear anywhere in the excerpts.";
            LlmClient.Answer answer = client.complete(system, user,
                    deep ? LlmClient.CacheKeys.ORACLE_DEEP : LlmClient.CacheKeys.ORACLE);
            return Map.<String, Object>of("rawAnswer", String.valueOf(answer.answer()),
                    "model", String.valueOf(answer.model()),
                    "cached", answer.cached(),
                    "upstreamCached", answer.upstreamCached(),
                    "latencyMs", answer.latencyMs());
        });
        g.addNode(NODE_GATE, state -> {
            if (((Number) state.getOrDefault("hitCount", 0)).intValue() == 0) {
                return Map.<String, Object>of("answer", REFUSAL, "guarded", false,
                        "model", "oracle-bm25", "cached", false,
                        "upstreamCached", false, "latencyMs", 0L);
            }
            String raw = String.valueOf(state.getOrDefault("rawAnswer", ""));
            String cleaned = LlmGuards.stripMarkdown(raw);
            boolean guarded = LlmGuards.containsLeak(cleaned) || cleaned.isBlank();
            String line = guarded ? REFUSAL : cleaned;
            return Map.<String, Object>of("answer", line, "guarded", guarded,
                    "model", String.valueOf(state.get("model")),
                    "cached", state.get("cached"),
                    "upstreamCached", state.get("upstreamCached"),
                    "latencyMs", state.get("latencyMs"));
        });
        g.addEdge(NODE_COMPOSE, NODE_GATE);
        g.setEntryPoint(NODE_RETRIEVE);
        g.setMeta(NODE_RETRIEVE, Map.<String, Object>of("kind", "deterministic", "stage", "retrieve", "engine", "bm25+multihop"));
        g.setMeta(NODE_COMPOSE, Map.<String, Object>of("kind", "llm", "stage", "compose", "persona", "canon-scribe", "prefix", deep ? "oracle-v5" : "oracle-v4"));
        g.setMeta(NODE_GATE, Map.<String, Object>of("kind", "deterministic", "stage", "gate", "persona", "safe-line"));
        return g.compile();
    }

    /**
     * Answer a lore question. {@code limit} = max excerpts fed to the model
     * (clamped to [1, 6]). Pass {@code 0} to take the default.
     */
    /** Routing note for "real-world prototype" territory — appended to the user message (never the system). */
    static final String REALWORLD_ROUTE_NOTE =
            "Routing note (mechanical, obey it): this question sits in real-world-reference territory. "
            + "Prefer the refs: blocks when answering; "
            + "if the canon itself is the answer, say that plainly. Do not answer from general knowledge alone.";

    /**
     * W-Z244: route a "real-world prototype" question to the refs volume — keyword router,
     * zero extra LLM tokens. Only refs-specific multi-word tokens count; anything canon shares is out.
     */
    static boolean prefersRealWorldRefs(String question) {
        if (question == null || question.isBlank()) {
            return false;
        }
        String q = question.toLowerCase(java.util.Locale.ROOT);
        for (String token : REALWORLD_TOKENS) {
            if (q.contains(token)) {
                return true;
            }
        }
        return false;
    }

    private static final List<String> REALWORLD_TOKENS = List.of(
            // zh — refs 卷专属短语（任何 canon 字单独不入）
            "现实", "史实", "真实世界", "对应原型", "对照", "对应",
            "祭灶", "灶神", "火塘", "灶头边", "命火不熄",
            "赫斯提亚", "维斯塔", "维斯塔童女", "祭月", "月饼", "月亮",
            "白桦", "秋分", "二十四节气", "中秋", "寒露",
            "永恒火焰", "长明灯", "圣火", "奥运圣火",
            // en — equally narrow, lowercase-matched
            "real world", "real-world", "prototype", "historical", "history",
            "zhao jun", "zao jun", "stove god", "kitchen god",
            "hestia", "vesta", "vestal", "birch", "equinox", "solstice",
            "mid-autumn", "zhongqiu", "chuseok", "jūgoya", "tet trung thu",
            "eternal flame", "olympic torch", "torch relay",
            "24 solar terms", "lunar new year", "lunar november", "lunar august"
    );

    public OracleResult answer(String question, Integer limitRaw) {
        if (question == null || question.isBlank()) {
            return failure("blank question");
        }
        Map<String, Object> initial = new LinkedHashMap<>();
        initial.put("question", question);
        initial.put("limitRaw", limitRaw);
        StateGraph.CompiledInvoke result = oracleGraph.invoke(initial);
        Map<String, Object> state = result.state();
        List<String> path = result.trace().stream().map(StateGraph.TraceEntry::node).toList();
        @SuppressWarnings("unchecked")
        List<String> sources = (List<String>) state.get("sources");
        return new OracleResult(true,
                String.valueOf(state.get("answer")),
                sources == null ? List.of() : sources,
                String.valueOf(state.get("model")),
                Boolean.TRUE.equals(state.get("cached")),
                Boolean.TRUE.equals(state.get("upstreamCached")),
                ((Number) state.get("latencyMs")).longValue(),
                Boolean.TRUE.equals(state.get("guarded")),
                path);
    }

    /**
     * W-Z485 史诗深潜：用 v5 双语全量前缀（~8-9 万 tok）+ 独立 cache lane 回答典籍问题。
     * 与普通 answer 同形（同一 BM25 检索 / 同一 StateGraph / 同一门禁），仅 system + cacheKey 不同。
     */
    public OracleResult answerDeep(String question, Integer limitRaw) {
        if (question == null || question.isBlank()) {
            return failure("blank question");
        }
        Map<String, Object> initial = new LinkedHashMap<>();
        initial.put("question", question);
        initial.put("limitRaw", limitRaw);
        StateGraph.CompiledInvoke result = oracleDeepGraph.invoke(initial);
        Map<String, Object> state = result.state();
        List<String> path = result.trace().stream().map(StateGraph.TraceEntry::node).toList();
        @SuppressWarnings("unchecked")
        List<String> sources = (List<String>) state.get("sources");
        return new OracleResult(true,
                String.valueOf(state.get("answer")),
                sources == null ? List.of() : sources,
                String.valueOf(state.get("model")),
                Boolean.TRUE.equals(state.get("cached")),
                Boolean.TRUE.equals(state.get("upstreamCached")),
                ((Number) state.get("latencyMs")).longValue(),
                Boolean.TRUE.equals(state.get("guarded")),
                path);
    }

    /**
     * Two-stage retrieval (package-private for tests).
     * Primary hits keep their order and their slots; enrichment only <b>appends</b> previously unseen blocks,
     * capped at {@code min(limit+2, 6)} blocks in total.
     *
     * <p>ENRICH = 按问号/句号/分号/否定把复合问题切成 ≤3 子句，每子句单独检索——互补的是
     * 复合问题里被混在一个池子里的两个语义，而不是再问一遍同样的词（那永远拿不到新块）。
     */
    List<Bm25Index.Hit> retrieve(String question, int limit) {
        List<Bm25Index.Hit> primary = index.search(question, limit);
        if (!multihop) return primary;

        LinkedHashMap<LoreDoc, Bm25Index.Hit> merged = new LinkedHashMap<>();
        for (Bm25Index.Hit hit : primary) {
            merged.put(hit.doc(), hit);
        }
        int cap = Math.min(Math.max(limit + 2, 4), 6);
        String trimmed = question.trim();
        for (String clause : clauses(question)) {
            if (merged.size() >= cap) break;
            if (clause.equals(trimmed)) continue; // 单子句问句：再问一遍同样的东西，拿不到新块
            for (Bm25Index.Hit hit : index.search(clause, 2)) {
                if (merged.size() >= cap) break;
                merged.putIfAbsent(hit.doc(), hit);
            }
        }
        return new ArrayList<>(merged.values());
    }

    /**
     * 子句切分：CJK 与 ASCII 问号/句号/分号/感叹号/逗号 + 「并且/而且/以及/还有」。
     * 每段 ≥4 个码点才算一句（再短就是问句骨架上的关键符号，不值得单独检索）；最多 3 段，按原文出现顺序。
     */
    static List<String> clauses(String question) {
        String[] parts = question.split("[？?。；;，,！!]|（?:而且|并且|以及|还有）|\\s+(and|with|plus)\\s+");
        List<String> out = new ArrayList<>();
        for (String part : parts) {
            String clause = part.trim();
            if (clause.codePointCount(0, clause.length()) < 4) continue;
            out.add(clause);
            if (out.size() >= 3) break;
        }
        return out;
    }

    public Map<String, Object> health() {
        long bm25Hits = index.search("锚火", 1).size();
        return Map.of(
                "ready", true,
                "candidates", index.search("火", 6).size(),
                "bm25Probe", bm25Hits);
    }

    private int clampLimit(Integer limit) {
        if (limit == null || limit <= 0) return Math.max(1, defaultLimit);
        return Math.max(1, Math.min(6, limit));
    }

    private OracleResult failure(String reason) {
        return new OracleResult(false, reason, List.of(), "none", false, false, 0L, false, List.of());
    }

    /**
     * The frozen Oracle system prompt — lore-system-prompt.txt + the verbatim glossary digest
     * (lore-digest-frozen.txt, rebuilt by scripts/build-freeze-glossary.mjs). The digest is a
     * byte-identical copy of the GLOSSARY head, frozen to keep the prefix prompt-cacheable
     * (W-Z247: the bare lore-system-prompt was ~500 tokens — below the upstream prompt-cache page
     * threshold, so Oracle calls ran cold even with stream+include_usage+ephemeral+prompt_cache_key).
     */
    /**
     * 启动热身走这条（W-Z345）：吐出**完整 Oracle 冻结前缀（v2 大前缀 + lore-system-prompt）**给
     * LlmClient.warmupUpstream()，无需第二份手抄——手抄就是两份迟早分家的前缀。
     */
    /** Oracle 冻结前缀（v4）：lore-system-prompt + GLOSSARY verbatim 全量（≈90K tok）。 */
    private static final String ORACLE_V4_PATH = "/ai/oracle-v4-frozen-prefix.txt";

    public static String loadOracleSystem() {
        // W-Z349：优先 v4（全量典籍正典）；老降级路径保留，单元测试不必碰大文件
        InputStream in = LoreOracleService.class.getResourceAsStream(ORACLE_V4_PATH);
        if (in != null) {
            try (in) {
                return new String(in.readAllBytes(), StandardCharsets.UTF_8).trim();
            } catch (IOException e) {
                throw new IllegalStateException("cannot read Oracle v4 resource " + ORACLE_V4_PATH, e);
            }
        }
        String base = loadResource("/ai/lore-system-prompt.txt");
        String digest = loadResource("/ai/lore-digest-frozen.txt");
        return (base + "\n\n" + digest).trim();
    }

    /** W-Z485：v5 双语全量前缀（史诗深潜）。缺文件时降级到 v4——深潜功能不因资源缺失而 500。 */
    private static final String ORACLE_V5_PATH = "/ai/oracle-v5-frozen-prefix.txt";

    public static String loadOracleSystemDeep() {
        InputStream in = LoreOracleService.class.getResourceAsStream(ORACLE_V5_PATH);
        if (in != null) {
            try (in) {
                return new String(in.readAllBytes(), StandardCharsets.UTF_8).trim();
            } catch (IOException e) {
                throw new IllegalStateException("cannot read Oracle v5 resource " + ORACLE_V5_PATH, e);
            }
        }
        return loadOracleSystem();
    }

    private static String loadResource(String path) {
        try (InputStream in = LoreOracleService.class.getResourceAsStream(path)) {
            if (in == null) throw new IllegalStateException("missing classpath:" + path);
            return new String(in.readAllBytes(), StandardCharsets.UTF_8).trim();
        } catch (IOException e) {
            throw new IllegalStateException("cannot read Oracle resource " + path, e);
        }
    }
}
