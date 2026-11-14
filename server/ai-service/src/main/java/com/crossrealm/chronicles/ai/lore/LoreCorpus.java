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
 *
 * <p>Two deliberate engineering choices here, both paid for in debugging:
 * <ul>
 *   <li>段落切分用手写逐行扫描（{@link #paragraphs}），不用正则——行为可见、可预测；</li>
 *   <li>长段切分时 {@code i} 必须前进至少一个字符（{@code cut > i}），否则某个
 *       恰好等于 {@code i} 的落点（窗口被夹到段尾 + 前一刀正好落在标点位）会让
 *       这一刀卡死在同一偏移上，段落被无限重复切片（实测 GLOSSARY-en 一段 970 字符挂死）。</li>
 * </ul>
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
        int i = 0;
        int n = raw.length();
        while (i < n) {
            int nl = raw.indexOf('\n', i);
            if (nl < 0) nl = n;
            String line = raw.substring(i, nl).trim();
            if (line.startsWith("# source: ")) {
                if (i > blockStart) {
                    String block = raw.substring(blockStart, i).trim();
                    splitIntoDocs(source, block);
                }
                source = line.substring("# source: ".length()).trim();
                blockStart = nl + 1;
            }
            i = nl + 1;
        }
        if (blockStart < n) {
            String block = raw.substring(blockStart).trim();
            splitIntoDocs(source, block);
        }
        if (docs.isEmpty()) {
            throw new IllegalStateException("corpus.txt contains no retrievable blocks — not an empty knowledge base, a build bug");
        }
    }

    private void splitIntoDocs(String source, String block) {
        // 按空行切段——任何段落型 md 源都自然落在段间。
        for (String paragraph : paragraphs(block)) {
            paragraph = paragraph.trim();
            if (paragraph.isEmpty()) continue;
            // 过长段按句界切分，并且不混淆节标题
            if (paragraph.length() > 900) {
                for (int i = 0; i < paragraph.length();) {
                    int end = Math.min(i + 900, paragraph.length());
                    // 尽量在标点处切断——但这控制只是检索召回，不是语义块
                    int cut = findEnd(paragraph, end);
                    // 守门：findEnd 的最低返回值是 end-180。窗口被夹到段长时它可能恰好等于 i
                    // （前一刀正好落在标点位上）——那一刀必须硬切进至少一个字符，否则 i 永不前进。
                    if (cut <= i) cut = i + 1;
                    if (cut > paragraph.length()) cut = paragraph.length();
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

    /** 段落扫描：空（或全空白）行冲出当前段；其余行拼进当前段，\n 续行。 */
    private static List<String> paragraphs(String block) {
        List<String> out = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        int start = 0;
        int n = block.length();
        while (start < n) {
            int nl = block.indexOf('\n', start);
            if (nl < 0) nl = n;
            String line = block.substring(start, nl);
            if (line.trim().isEmpty()) {
                if (cur.length() > 0) {
                    out.add(cur.toString());
                    cur.setLength(0);
                }
            } else {
                if (cur.length() > 0) cur.append('\n');
                cur.append(line);
            }
            start = nl + 1;
        }
        if (cur.length() > 0) out.add(cur.toString());
        return out;
    }

    private static int findEnd(String s, int target) {
        for (int p = target; p > Math.max(0, target - 180); p--) {
            char c = s.charAt(p - 1);
            if (c == '。' || c == '？' || c == '！' || c == '?' || c == '!' || c == '\n') {
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
