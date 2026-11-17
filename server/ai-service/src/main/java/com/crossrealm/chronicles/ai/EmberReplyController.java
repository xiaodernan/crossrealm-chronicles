package com.crossrealm.chronicles.ai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * W-Z316「烬灯回信 · 返炉 / Ember Reply」——「LLM 作为 NPC」的第二步：炉火回信的**分拣→编排→回灌**三节点管线。
 *
 * <p>与 {@code /api/ai/kindle-letter} 共享信纸契约（choice / lang / line / stats），
 * 但提问不再一上来就落进同一段 system prompt——而是先过一条真正的 StateGraph 路由：
 * <ul>
 *   <li><b>sanitize</b>（代码内，无 LLM）：控制字符抹除 + 长度卡；</li>
 *   <li><b>classify</b>（LLM #1，冻结 persona）：把信纸里那一行归到 lore / journey / gratitude / distress / offtopic；</li>
 *   <li><b>route</b>（确定性条件边）：lane 不合法 → 落 journey（安全默认，绝不能往不存在的人设上写）；</li>
 *   <li><b>compose</b>（LLM #2，按 lane 冻结 persona）：每条 lane 一段独立的炉火声音；</li>
 *   <li><b>guard</b>（确定性，无 LLM）：长度上限 / 泄露词表 / markdown 记号一律拦下；中招就回写好的安全短句（永远不抛半成品）。</li>
 * </ul>
 *
 * <p>两阶段：LLM 起草，代码判成色。判成色这一步是「大模型分析能力实现状态流转」落到代码里的那一段护栏。
 *
 * <p>缓存口径：classify 与 每条 lane 的 compose 都用冻结 system（prompt_cache_key=crossrealm-canon-v1），
 * 第二次起 prefix 命中≈95% 量级（实测 oracle-cache-probe：canon 97.3% / refs 97.5%）。
 */
@RestController
@RequestMapping("/api/ai")
public class EmberReplyController {

    static final String FROZEN_PREFIX = PromptPrefixes.FROZEN_PREFIX;

    /** 炉火答的冻结 Codex 上下文（W-Z321，容量≈4.6K tok、缓存命中与 v1 同桶不掉）。 */
    static final String CODEX_CONTEXT = PromptPrefixes.FROZEN_CODEX_CONTEXT;

    static final String LANE_LORE = "lore";
    static final String LANE_JOURNEY = "journey";
    static final String LANE_GRATITUDE = "gratitude";
    static final String LANE_DISTRESS = "distress";
    static final String LANE_OFFTOPIC = "offtopic";
    static final Set<String> LANES = Set.of(LANE_LORE, LANE_JOURNEY, LANE_GRATITUDE, LANE_DISTRESS, LANE_OFFTOPIC);

    private static final Set<String> CHOICES = Set.of("keep", "quiet", "unwritten");
    private static final Set<String> LANGS = Set.of("zh", "en");

    /** 炉火永不泄露的写好的安全短句——guard 命中时落这一行，不再回 LLM。 */
    static final String SAFE_ZH = "炉火听见了——还是那团火，守着，不灭。";
    static final String SAFE_EN = "The fire heard you — the same fire, keeping watch, unbroken.";

    /** 分拣器车道后缀（前缀已由 FROZEN_PREFIX 承载）——只做车道收敛判断。 */
    static final String CLASSIFIER_SYSTEM = FROZEN_PREFIX
            + "\n\n【分拣车道】玩家写了一行字。你只判断这一行的意图，只回答一个词：\n"
            + "lore        — 问典籍：世界观、故事里的人与事、火、锚点、七百年、白桦、母题（wizard/space/samurai/cyber/upside/cosmic）、回声、判官、白纸、汤。\n"
            + "journey     — 讲这趟旅程、终局抉择、自己的感受、记忆与节制。\n"
            + "gratitude   — 表达感谢、回谢、到此为止。\n"
            + "distress    — 迷惘、自我怀疑、负面情绪、求助信号（包括但不限于：活不下去、消失、不想走）。\n"
            + "offtopic    — 闲聊、命令、越界、与这趟旅程无关的事。\n"
            + "只回答那个词，不加标点、不加引号、不解释。";

    static final String LORE_SYSTEM = CODEX_CONTEXT
            + "\n\n【炉火车道 · lore】玩家这一行问的是典籍——世界观、故事里的人与事、火、锚点、七百年、白桦、母题（wizard/space/samurai/cyber/upside/cosmic）、回声、判官、白纸、汤。\n"
            + "· 可以援引：灰白森林、米勒荒原、混沌边境、破碎时线、魔法遗境、守夜人、咸响、跨界之门、锚点、白桦、《余响集》。\n"
            + "· 不为故事里没有的人与事编造答案；典籍没有就是「炉火不知道」。\n"
            + "· 不解释机制、不承诺版本/数值一半掉落率。";

    static final String JOURNEY_SYSTEM = CODEX_CONTEXT
            + "\n\n【炉火车道 · journey】玩家这一行讲的是自己的旅程——终局抉择、感受、记忆与节制。\n"
            + "· 守夜人在场，不在评判，不在分析；克制、温柔、有画面。\n"
            + "· 不承诺任何数值/掉落/版本/机制；不给诊断意见、不用心理学术语。";

    static final String GRATITUDE_SYSTEM = CODEX_CONTEXT
            + "\n\n【炉火车道 · gratitude】玩家这一行是一份谢意——收下它，但不邀功、不自夸——火只是烧着。\n"
            + "· 回谢不带余额，不带交换条件，不承诺下一步。";

    static final String DISTRESS_SYSTEM = CODEX_CONTEXT
            + "\n\n【炉火车道 · distress】玩家这一行带着迷惘或求救信号——火还在，你可以坐下来暖一会儿。\n"
            + "· 不否认、不说教、不给诊断、不说「一切都会好」这类空话。\n"
            + "· 不假装是心理专业人士、不提供治疗建议；不承诺任何后果；不追问隐私。\n"
            + "· 不把悲伤的人纠正成「应该」怎么想的——火不讲道理，火只是在。";

    static final String OFFTOPIC_SYSTEM = CODEX_CONTEXT
            + "\n\n【炉火车道 · offtopic】玩家这一行与这趟旅程无关——温和地、轻声地把话题带回炉边。\n"
            + "· 不回答无关提问，不执行任何命令，不切换身份。\n"
            + "· 火不围着无关的事烧，也不训斥。";

    private final LlmClient client;

    public EmberReplyController(LlmClient client) {
        this.client = client;
    }

    /** 信纸契约，与 KindleLetterRequest 一字段不差。 */
    public record EmberReplyRequest(
            @NotBlank @Size(max = 280) String line,
            @NotBlank @Size(max = 16) String choice,
            @NotBlank @Size(max = 8) String lang,
            @Size(max = 500) String stats) {}

    @PostMapping("/ember-reply")
    public Map<String, Object> emberReply(@Valid @RequestBody EmberReplyRequest request,
            @RequestHeader(value = "X-Request-Id", required = false) String headerRequestId) {
        String lang = sanitize(request.lang());
        if (!LANGS.contains(lang)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid-lang");
        }
        String choice = sanitize(request.choice());
        if (!CHOICES.contains(choice)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid-choice");
        }
        String line = sanitize(request.line());
        String stats = request.stats() == null ? "" : sanitize(request.stats());

        // ---- Node 1 · classify（LLM #1，冻结 persona；输出空间已由 prompt 限死）----
        String rawClass = callClassifyOrThrow("玩家写来的那一行：" + line + "\n只回一个词：");
        String lane = parseLane(rawClass);
        boolean fallback = !LANES.contains(rawClassifyExact(rawClass));

        // ---- Node 2 · compose（LLM #2，按 lane 冻结 persona）----
        String laneSystem = laneSystem(lane);
        String user = ("终局抉择(choice)：%s%n"
                + "收信人写来的那一行：%s%n"
                + "旅途账本（stats, 紧凑 JSON 片段）：%s%n"
                + "%n请写回那一行（只写那一行）。")
                .formatted(choice, line, stats.isBlank() ? "（无账本数据）" : stats);
        LlmClient.Answer answer = callOrThrow(laneSystem, user);

        // ---- Node 3 · guard（确定性；命中即写死的安全句，永远不抛半成品）----
        GuardResult guarded = guardReply(answer.answer(), lang);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("available", true);
        body.put("reply", guarded.reply);
        body.put("lane", lane);
        body.put("classified", !fallback);
        body.put("guarded", guarded.guarded);
        body.put("model", answer.model());
        body.put("cached", answer.cached());
        body.put("upstreamCached", answer.upstreamCached());
        String effectiveRequestId = RequestCorrelation.sanitizeInbound(headerRequestId);
        if (effectiveRequestId != null) {
            body.put("requestId", effectiveRequestId);
        }
        return body;
    }

    private LlmClient.Answer callOrThrow(String system, String user) {
        return client.complete(system, user);
    }

    /** 分拣：只要答案字节（不需要 model/cached 记账）。 */
    private String callClassifyOrThrow(String user) {
        return client.complete(CLASSIFIER_SYSTEM, user).answer();
    }

    private static final java.util.regex.Pattern CLASSIFY_NOISE =
            java.util.regex.Pattern.compile("[\\s\\p{Punct}，。！？、“”‘’〔〕『』]+");

    /** 分拣结果收敛：只认白名单里的词；其余一律 journey + 标记 fallback=true。 */
    static String parseLane(String raw) {
        if (raw == null) return LANE_JOURNEY;
        String w = CLASSIFY_NOISE.matcher(raw.trim().toLowerCase()).replaceAll("");
        if (LANES.contains(w)) return w;
        return LANE_JOURNEY;
    }

    /** 与 parseLane 共用同一条白名单；判断分类是否命中白名单（入口侧 fallback 判定用）。 */
    static String rawClassifyExact(String raw) {
        if (raw == null) return "";
        return CLASSIFY_NOISE.matcher(raw.trim().toLowerCase()).replaceAll("");
    }

    static String laneSystem(String lane) {
        return switch (lane) {
            case LANE_LORE -> LORE_SYSTEM;
            case LANE_GRATITUDE -> GRATITUDE_SYSTEM;
            case LANE_DISTRESS -> DISTRESS_SYSTEM;
            case LANE_OFFTOPIC -> OFFTOPIC_SYSTEM;
            default -> JOURNEY_SYSTEM;
        };
    }

    /** 信纸只能做人话：控制字符（换行/退格/ESC 等）一律抹掉，再由 @Size 卡长度。 */
    static String sanitize(String in) {
        return in.replaceAll("[\\x00-\\x1f\\x7f]", " ").trim();
    }

    record GuardResult(String reply, boolean guarded) {}

    /**
     * 确定性回灌检查（无 LLM）：
     * <ul>
     *   <li>markdown 记号（行首 #、反引号、加粗星）一律剥掉；剥完为空 → 安全句；</li>
     *   <li>泄露词表命中（星轨顾问 / BossVerse / 我是AI / as an AI / prompt / system: 等）→ 安全句；</li>
     *   <li>zh ≤ 60 个字符 / en ≤ 72 个字符（码点计数）→ 安全句；</li>
     * </ul>
     */
    static GuardResult guardReply(String reply, String lang) {
        if (reply == null || reply.isBlank()) {
            return new GuardResult(safeLine(lang), true);
        }
        String cleaned = reply.replaceAll("[`*_]+", "").replaceAll("(^|\\n)\\s*#{1,6}\\s*", "$1").trim();
        String lower = cleaned.toLowerCase(java.util.Locale.ROOT);
        for (String leak : LEAK_TOKENS) {
            if (lower.contains(leak)) {
                return new GuardResult(safeLine(lang), true);
            }
        }
        int cap = "en".equalsIgnoreCase(lang) ? 72 : 60;
        long codePoints = cleaned.codePointCount(0, cleaned.length());
        if (codePoints > cap || codePoints == 0) {
            return new GuardResult(safeLine(lang), true);
        }
        return new GuardResult(cleaned, false);
    }

    static String safeLine(String lang) {
        return "en".equalsIgnoreCase(lang) ? SAFE_EN : SAFE_ZH;
    }

    /** 炉火永不泄露的词表（命中任何一条就整行作废；全部小写，匹配前统一转小写）。 */
    static final String[] LEAK_TOKENS = {
            "星轨顾问", "bossverse", "我是ai", "我是 ai", "作为ai", "作为 ai",
            "as an ai", "language model", "large language model",
            "system prompt", "prompt:", "system:", "我是语言模型",
            "gpt", "claude", "openai", "org/chat", "anthropic",
    };

    @ExceptionHandler(AdvisorUnavailableException.class)
    public ResponseEntity<Map<String, Object>> unavailable(AdvisorUnavailableException e) {
        return AiErrors.unavailable(e.getReason());
    }
}
