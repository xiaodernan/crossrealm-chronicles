package com.crossrealm.chronicles.ai.lore;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * The canon corpus as an in-memory, lineage-labelled block list.
 * Loaded once at boot from {@code classpath:/lore/corpus.txt} (see scripts/build-lore-corpus.mjs).
 *
 * <p>Each corpus file contributes one or more {@link LoreDoc} entries. The file is
 * expected to be the same exact file compiled by build-lore-corpus.mjs — a CI gate
 * (`--check`) asserts it doesn't drift.
 */
@Component
public class LoreCorpus {

    private final List<LoreDoc> docs = new ArrayList<>();

    public LoreCorpus() {
        load();
    }

    public List<LoreDoc> docs() {
        return docs;
    }

    private void load() {
        String raw = readCorpus();
        if (raw == null) {
            throw new IllegalStateException("missing classpath:/lore/corpus.txt — run scripts/build-lore-corpus.mjs");
        }
        String source = "creative/novel/00-prologue.md"; // fallback; replaced on first # source: line
        int blockStart = 0;
        int blockEnd = raw.length();
        int i = 0;
        while (i < raw.length()) {
            int next = raw.indexOf('\n', i);
            if (next < 0) next = raw.length();
            String line = raw.substring(i, next).trim();
            if (line.startsWith("# source: ")) {
                if (i > blockStart) {
                    String block = raw.substring(blockStart, i).trim();
                    splitIntoDocs(source, block);
                }
                source = line.substring("# source: ".length()).trim();
                blockStart = next + 1;
            }
            i = next + 1;
        }
        if (blockStart < raw.length()) {
            String block = raw.substring(blockStart).trim();
            splitIntoDocs(source, block);
        }
        if (docs.isEmpty()) {
            throw new IllegalStateException("corpus.txt contains no retrievable blocks — not an empty knowledge base, a build bug");
        }
    }

    private void splitIntoDocs(String source, String block) {
        // 按空行切段——任何段落型 md 源都自然落在段间。过长的段进一步按 ~800 字切分。
        for (String paragraph : block.split("\\R\\s*\\R")) {
            paragraph = paragraph.trim();
            if (paragraph.isEmpty()) continue;
            // 过长段按句界切分，并且不混淆节标题
            if (paragraph.length() > 900) {
                for (int i = 0; i < paragraph.length();) {
                    int end = Math.min(i + 900, paragraph.length());
                    // 尽量在标点处切断——但这控制只是检索召回，不是语义块
                    int cut = findEnd(paragraph, end);
                    String chunk = paragraph.substring(i, cut).trim();
                    if (chunk.length() > 60) {
                        docs.add(new LoreDoc(source, chunk));
                    }
                    i = cut;
                }
            } else {
                docs.add(new LoreDoc(source, paragraph));
            }
        }
    }

    private static int findEnd(String s, int target) {
        for (int p = target; p > Math.max(0, target - 180); p--) {
            char c = s.charAt(p - 1);
            if (c == '。' || c == '。' || c == '?' || c == '？' || c == '!' || c == '！' || c == '\n') {
                return p;
            }
        }
        return target;
    }

    private static String readCorpus() {
        try (InputStream in = LoreCorpus.class.getResourceAsStream("/lore/corpus.txt")) {
            if (in == null) return null;
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("cannot read classpath:/lore/corpus.txt", e);
        }
    }
}
