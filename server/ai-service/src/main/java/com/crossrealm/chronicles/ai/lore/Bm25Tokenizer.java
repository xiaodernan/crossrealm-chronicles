package com.crossrealm.chronicles.ai.lore;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Tokenizer (fix): Han ideographs → one token per codepoint; ASCII alphanumeric runs → lowercase tokens.
 * The old regex matched whole Han *runs* as one token — that's why a query for 「锚火」 matched nothing.
 *
 * <p>Scoring stays BM25 with the standard constants (k1=1.5, b=0.75); the fix is purely the tokenizer.
 */
public class Bm25Tokenizer {

    public static List<String> tokenize(String src) {
        if (src == null || src.isEmpty()) return List.of();
        String lower = src.toLowerCase(Locale.ROOT);
        List<String> out = new ArrayList<>();
        StringBuilder ascii = new StringBuilder();
        int i = 0;
        int n = lower.codePointCount(0, lower.length());
        int cpIdx = 0;
        while (cpIdx < n) {
            int cp = lower.codePointAt(cpIdx);
            if (Character.isLetterOrDigit(cp) && cp < 0x80) {
                ascii.append((char) cp);
            } else {
                flushAscii(ascii, out);
                // Han ideographs OR anything not ASCII-word → one token per codepoint
                int codePt = lower.codePointAt(cpIdx);
                if (Character.isLetterOrDigit(codePt) || isHan(codePt)) {
                    out.add(new String(Character.toChars(codePt)));
                }
            }
            cpIdx += Character.charCount(src.codePointAt(cpIdx));
        }
        flushAscii(ascii, out);
        return out;
    }

    private static void flushAscii(StringBuilder ascii, List<String> out) {
        if (ascii.length() > 0) {
            out.add(ascii.toString());
            ascii.setLength(0);
        }
    }

    private static boolean isHan(int cp) {
        int type = Character.getType(cp);
        return (cp >= 0x4E00 && cp <= 0x9FFF)
                || (cp >= 0x3400 && cp <= 0x4DBF)
                || (cp >= 0x20000 && cp <= 0x2A6DF)
                || type == Character.OTHER_LETTER;
    }
}
