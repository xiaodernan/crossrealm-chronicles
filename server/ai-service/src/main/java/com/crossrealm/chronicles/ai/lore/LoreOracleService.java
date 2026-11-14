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
        StringBuilder context = new StringBuilder();
        for (Bm25Index.Hit hit : hits) {
            context.append("[").append(hit.doc().source()).append("]\n")
                    .append(hit.doc().text().trim())
                    .append("\n\n---\n\n");
        }
        String system = loadOracleSystem();
        String user = "Player question (use the language the player asked in):\n" + question
                + "\n\nExcerpts from the canon (use ONLY these; cite the bracket paths):\n\n"
                + context.toString().trim();

        LlmClient.Answer answer = client.complete(system, user);
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

    private static String loadOracleSystem() {
        try (InputStream in = LoreOracleService.class.getResourceAsStream("/ai/lore-system-prompt.txt")) {
            if (in == null) throw new IllegalStateException("missing classpath:/ai/lore-system-prompt.txt");
            return new String(in.readAllBytes(), StandardCharsets.UTF_8).trim();
        } catch (IOException e) {
            throw new IllegalStateException("cannot read oracle system prompt", e);
        }
    }
}
