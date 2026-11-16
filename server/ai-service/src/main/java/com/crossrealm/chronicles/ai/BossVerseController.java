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
 * W-Z289「余火回响」—— Boss 倒下的那一刻，炉火的记录者为活着的人说一句。
 *
 * <p>设计意图（与 {@link ArbiterController} 同一族）：
 * <ul>
 *   <li><b>一次击杀 = 一句话。</b>谁倒下、在哪一章、第几次击杀——三个真数据，模型只负责
 *       把这一瞬收束成一句给活着的人听的话。不是台词、不出数值、不解释机制。</li>
 *   <li><b>不可信文本，文本协议。</b>回答为单行纯文本（语言由 {@code lang} 白名单收敛）；
 *       客户端按 textContent 落屏（HUD toast），raw 段永不进 DOM 的 innerHTML 路径。</li>
 *   <li><b>失败要静默。</b>503 走 {@code AdvisorUnavailableException}——客户端收到不可达即
 *       悄悄不显示；玩家永远不知道这一步存在过。</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/ai")
public class BossVerseController {

    /** 余火回响的人格：只替炉火记下这一刀，一句话，不出戏，不加引号，不超过 40 字。 */
    static final String BOSS_VERSE_SYSTEM =
            "你是《跨界纪事》里炉火的记录者。刚才，一位坐在门前的守夜人（Boss）倒下了。\n"
            + "\n"
            + "作为一旁看火的人，为还活着的人写一句话。\n"
            + "\n"
            + "规则：\n"
            + "· 只写一句，不超过 40 个字（中文）/ 72 个字符（英文）。\n"
            + "· 不出戏、不解释、不罗列机制名、不给数值、不评价、不挑衅、不安慰；像炉火自己在自言自语，\n"
            + "  只是把这一瞬收束给下一场还没打完的人听。\n"
            + "· 可以出现：母题（wizard / space / samurai / cyber / upside / cosmic）、回声、锚点、\n"
            + "  白桦、七百年、炉火、守夜人、判官、铁与灰——但只准出现本作自己的印记。\n"
            + "· 用收信人的母语回答：zh 用中文，en 用英文。\n"
            + "· 不加引号、不出现 emoji、不出现诗人的名字、不写成骂人的话或心理辅导——只写这一条回响。";

    private static final Set<String> LANGS = Set.of("zh", "en");

    private final LlmClient client;

    public BossVerseController(LlmClient client) {
        this.client = client;
    }

    /** 输入全部限长：它们会被拼进提示词，不是一条可以无限长的管道。 */
    public record BossVerseRequest(
            @NotBlank @Size(max = 64) String bossId,
            @NotBlank @Size(max = 80) String name,
            @NotBlank @Size(max = 8) String lang,
            @Size(max = 30) String chapter,
            @Size(max = 30) String kills,
            @Size(max = 30) String level,
            @Size(max = 64) String zone) {}

    @PostMapping("/boss-verse")
    public Map<String, Object> bossVerse(@Valid @RequestBody BossVerseRequest request,
            @RequestHeader(value = "X-Request-Id", required = false) String headerRequestId) {
        String lang = sanitize(request.lang());
        if (!LANGS.contains(lang)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid-lang");
        }
        String bossId = sanitize(request.bossId());
        String name = sanitize(request.name());
        String chapter = request.chapter() == null ? "?" : sanitize(request.chapter());
        String kills = request.kills() == null ? "?" : sanitize(request.kills());
        String level = request.level() == null ? "?" : sanitize(request.level());
        String zone = request.zone() == null ? "" : sanitize(request.zone());

        String user = ("倒下的是：%s（%s）%n"
                + "出处：第 %s 章 · 击杀第 %s 次 · 玩家第 %s 级 · 地带：%s%n"
                + "%n请只回一行回响。")
                .formatted(name, bossId, chapter, kills, level, zone.isBlank() ? "（未登记）" : zone);
        LlmClient.Answer answer = client.complete(BOSS_VERSE_SYSTEM, user);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("available", true);
        body.put("verse", answer.answer());
        body.put("model", answer.model());
        body.put("cached", answer.cached());
        body.put("upstreamCached", answer.upstreamCached());
        String effectiveRequestId = RequestCorrelation.sanitizeInbound(headerRequestId);
        if (effectiveRequestId != null) {
            body.put("requestId", effectiveRequestId);
        }
        return body;
    }

    /** 账本只能做人话：控制字符（换行 / 退格 / ESC 等）一律抹掉，再由 @Size 卡长度。 */
    private static String sanitize(String in) {
        return in.replaceAll("[\\x00-\\x1f\\x7f]", " ").trim();
    }

    @ExceptionHandler(AdvisorUnavailableException.class)
    public ResponseEntity<Map<String, Object>> unavailable(AdvisorUnavailableException e) {
        return AiErrors.unavailable(e.getReason());
    }
}
