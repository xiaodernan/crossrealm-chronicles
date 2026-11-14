package com.crossrealm.chronicles.ai.lore;

import com.crossrealm.chronicles.ai.LlmClient;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * The Lore Oracle — a retrieval-augmented answer channel for canon questions.
 *
 * <p>Ranking: BM25 over the corpus (no vector DB; fully in-memory; the corpus fits in
 * 130 KB compressed~). The LLM only ever reads:
 *   (1) the system oracle prompt, and
 *   (2) the retrieved excerpts with bracket citations.
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
        List<Bm25Index.Hit> hits = index.search(question, limit);
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
