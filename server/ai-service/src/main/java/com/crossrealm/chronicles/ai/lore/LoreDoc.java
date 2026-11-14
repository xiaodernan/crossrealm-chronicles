package com.crossrealm.chronicles.ai.lore;

/**
 * A single retrievable lore — a paragraph of source matter from the canon corpus.
 *
 * <p>{@code source} is the chapter/codex file path as written in the corpus, e.g.
 * {@code creative/novel/07-chapter-seven.md}; it's the public citation label AND the
 * BM25 trimming boundary. {@code text} is the extracted paragraph (never mutated).
 */
public record LoreDoc(String source, String text) {}
