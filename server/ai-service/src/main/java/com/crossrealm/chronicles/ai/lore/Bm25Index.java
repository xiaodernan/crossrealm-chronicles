package com.crossrealm.chronicles.ai.lore;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * BM25 over the corpus — the retriever behind the Lore Oracle.
 *
 * <p>Few assumptions, many lines: Chinese ideographs are tokens (one codepoint); ASCII
 * identifiers/alphanumeric runs are tokens (lowercased). k1=1.5, b=0.75 — these
 * constants are standard; do not touch without a measurement.
 *
 * <p>At boot time we build the inverted index; every subsequent search is allocation-free on the
 * hot path other than the result list.
 */
@Component
public class Bm25Index {

    private static final double K1 = 1.5, B = 0.75;

    private final List<LoreDoc> docs = new ArrayList<>();
    private final List<List<String>> tokenized = new ArrayList<>();
    private final Map<String, Integer> documentFrequency = new HashMap<>();
    // W-Z269：反向索引 posting list——search() 只扫命中的 (docId, tf) 对，不再对全库 O(N×|q|) 重扫每篇文档的 tf。
    private final Map<String, List<Posting>> postings = new HashMap<>();
    private double averageLength;

    public Bm25Index(LoreCorpus corpus) {
        for (LoreDoc doc : corpus.docs()) {
            List<String> tokens = tokenize(doc.text());
            if (tokens.isEmpty()) continue;
            docs.add(doc);
            tokenized.add(tokens);
            Map<String, Integer> tf = new HashMap<>();
            for (String t : new java.util.HashSet<>(tokens)) {
                documentFrequency.merge(t, 1, Integer::sum);
            }
            for (String t : tokens) tf.merge(t, 1, Integer::sum);
            for (var entry : tf.entrySet()) {
                postings.computeIfAbsent(entry.getKey(), k -> new ArrayList<>())
                        .add(new Posting(docs.size() - 1, entry.getValue()));
            }
        }
        if (docs.isEmpty()) {
            throw new IllegalStateException("BM25 index over an empty corpus — not a knowledge base, a build failure");
        }
        this.averageLength = tokenized.stream().mapToInt(List::size).average().orElse(1);
    }

    private record Posting(int docId, int tf) {}

    /**
     * Lowercase ASCII runs + single Han ideographs. Punctuation/whitespace are boundaries —
     * they don't get indexed; Chinese commas/periods don't care — the tokenizer walks codepoints.
     */
    /** 包内静态：把查询/文档都拆成 token（每个 Han 各一、每个 ASCII 串各一，小写）。 */
    public static List<String> tokenize(String src) {
        return Bm25Tokenizer.tokenize(src);
    }

    public List<Hit> search(String query, int limit) {
        List<String> queryTokens = tokenize(query);
        if (queryTokens.isEmpty()) return List.of();
        int n = docs.size();
        Map<String, Integer> queryTf = new HashMap<>();
        for (String token : queryTokens) {
            queryTf.merge(token, 1, Integer::sum);
        }
        // W-Z269：BM25 posting-list 反向索引——search() 只扫被命中的 (docId, tf)，不再对全库 O(N×|q|) 重扫。
        // 结果集与旧算法完全一致：同样的 idf × 同样的 norm(tf, k1, b, avgLen)、同样的 tie-break 顺序。
        Map<Integer, Double> scores = new HashMap<>();
        for (Map.Entry<String, Integer> entry : queryTf.entrySet()) {
            String token = entry.getKey();
            Integer df = documentFrequency.get(token);
            if (df == null || df == 0) continue;
            double idf = Math.log(1.0 + (n - df + 0.5) / (df + 0.5));
            if (idf <= 0) continue;
            for (Posting p : postings.getOrDefault(token, List.of())) {
                int i = p.docId();
                List<String> doc = tokenized.get(i);
                double docLen = doc.size();
                double tf = p.tf();
                double norm = tf * (K1 + 1) / (tf + K1 * (1 - B + B * docLen / averageLength));
                scores.merge(i, idf * norm, Double::sum);
            }
        }
        // top-k (stable tie-breaking on index — identical scores keep source order)
        List<Integer> idx = new ArrayList<>(scores.keySet());
        idx.sort(Comparator.comparingDouble((Integer i) -> scores.get(i)).reversed().thenComparingInt(Integer::intValue));
        int cutoff = Math.min(limit, idx.size());
        List<Hit> out = new ArrayList<>(cutoff);
        for (int k = 0; k < cutoff; k++) {
            int i = idx.get(k);
            out.add(new Hit(docs.get(i), scores.get(i)));
        }
        return out;
    }

    public record Hit(LoreDoc doc, double score) {}
}
