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
    private double averageLength;

    public Bm25Index(LoreCorpus corpus) {
        for (LoreDoc doc : corpus.docs()) {
            List<String> tokens = tokenize(doc.text());
            if (tokens.isEmpty()) continue;
            docs.add(doc);
            tokenized.add(tokens);
            for (String token : new java.util.HashSet<>(tokens)) {
                documentFrequency.merge(token, 1, Integer::sum);
            }
        }
        if (docs.isEmpty()) {
            throw new IllegalStateException("BM25 index over an empty corpus — not a knowledge base, a build failure");
        }
        this.averageLength = tokenized.stream().mapToInt(List::size).average().orElse(1);
    }

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
        double[] scores = new double[n];
        Map<String, Integer> queryTf = new HashMap<>();
        for (String token : queryTokens) {
            queryTf.merge(token, 1, Integer::sum);
        }
        for (Map.Entry<String, Integer> entry : queryTf.entrySet()) {
            String token = entry.getKey();
            Integer df = documentFrequency.get(token);
            if (df == null) continue;
            double idf = Math.log(1.0 + (n - df + 0.5) / (df + 0.5));
            if (idf <= 0) continue;
            for (int i = 0; i < n; i++) {
                List<String> doc = tokenized.get(i);
                int tf = 0;
                for (String t : doc) if (t.equals(token)) tf++;
                if (tf == 0) continue;
                double norm = tf * (K1 + 1) / (tf + K1 * (1 - B + B * doc.size() / averageLength));
                scores[i] += idf * norm;
            }
        }
        // top-k (stable tie-breaking on index — identical scores keep source order)
        List<Integer> idx = new ArrayList<>();
        for (int i = 0; i < n; i++) if (scores[i] > 0) idx.add(i);
        idx.sort(Comparator.comparingDouble((Integer i) -> scores[i]).reversed().thenComparingInt(i -> i));
        int cutoff = Math.min(limit, idx.size());
        List<Hit> out = new ArrayList<>(cutoff);
        for (int k = 0; k < cutoff; k++) {
            int i = idx.get(k);
            out.add(new Hit(docs.get(i), scores[i]));
        }
        return out;
    }

    public record Hit(LoreDoc doc, double score) {}
}
