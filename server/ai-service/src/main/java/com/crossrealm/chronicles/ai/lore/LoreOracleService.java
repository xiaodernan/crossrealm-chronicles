package com.crossrealm.chronicles.ai.lore;

import com.crossrealm.chronicles.ai.LlmClient;
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

    /** Result shape mirrored in the HTTP response. */
    public record OracleResult(boolean ok, String answer, List<String> sources, String model,
            boolean cached, boolean upstreamCached, long latencyMs) {}

    private final LlmClient client;
    private final Bm25Index index;

    @Value("${ai-service.lore.limit:4}")
    private int defaultLimit;

    @Value("${ai-service.lore.multihop:true}")
    private boolean multihop;

    public LoreOracleService(LlmClient client, Bm25Index index) {
        this.client = client;
        this.index = index;
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
        int limit = clampLimit(limitRaw);
        List<Bm25Index.Hit> hits = retrieve(question, limit);
        if (hits.isEmpty()) {
            // 没有任何匹配——不给模型找词也能硬编一个。该答假说了。
            return new OracleResult(true, "此物未在典籍中 · This is not in the record.",
                    List.of(), "oracle-bm25", false, false, 0L);
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
        String system = loadOracleSystem();
        String routeNote = prefersRealWorldRefs(question) ? "\n\n" + REALWORLD_ROUTE_NOTE : "";
        String user = "Player question (use the language the player asked in):\n" + question
                + routeNote
                + "\n\nMost relevant excerpt (quote it verbatim if it answers the question):\n\n"
                + firstBlock.toString().trim()
                + (rest.length() > 0 ? "\n\nOther excerpts (use only if the first doesn't answer):\n\n"
                        + rest.toString().trim() : "")
                + "\n\nReminder (read this FIRST):\nThe question asks about the entry in the **most relevant excerpt** block — locate its heading line (the one containing the exact name from the player question) and answer with that block's line verbatim. If no heading line contains the asked name, refuse with 「此物未在典籍中 · This is not in the record.」\n\nQuote branch: if the player question quotes a line verbatim (any quote/quotation marks included), treat the quoted text as the \"name\" to locate — find the excerpt line containing that quote exactly, and answer with that quote together with the file path it came from. Only refuse when the quoted text does not appear anywhere in the excerpts.";

        LlmClient.Answer answer = client.complete(system, user, LlmClient.CacheKeys.ORACLE);
        List<String> sources = hits.stream().map(h -> h.doc().source()).distinct().toList();
        return new OracleResult(true, answer.answer(), sources, answer.model(),
                answer.cached(), answer.upstreamCached(), answer.latencyMs());
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
        return new OracleResult(false, reason, List.of(), "none", false, false, 0L);
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
    public static String loadOracleSystem() {
        String base = loadResource("/ai/lore-system-prompt.txt");
        String digest = loadResource("/ai/lore-digest-frozen.txt");
        return (base + "\n\n" + digest).trim();
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
