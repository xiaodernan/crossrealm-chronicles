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
 * W-Z288「烬灯回信」—— 终章抉择之后，炉火为玩家亲笔写下的一封短信。
 *
 * <p>为什么它和顾问 / 回声灯长得都不一样：
 * <ul>
 *   <li><b>输入是账本，不是提问。</b>{@code choice} 是玩家亲手按下的终局抉择（留灯 / 安静走完 / 老档未显式选），
 *       {@code stats} 是旅途账本的紧凑 JSON 片段（回声数 / 通关数 / 探索数 / 击杀数等）；模型只准收束旅途，
 *       不准编造任何数值、掉落、版本号、地名。</li>
 *   <li><b>输出是内容，不是对话。</b>回信分三行（题名 / 正文 / 下一次指向），全部由客户端解析后以
 *       {@code textContent} 落盘；模型回的 JSON 文本从来不进游戏 DOM 的 innerHTML 路径。</li>
 *   <li><b>失败要静默。</b>AiErrors 503 + AdvisorUnavailableException——客户端收到不可达即悄悄回退，
 *       片尾不假装"它说过话"。玩家永远不需要理解这个端点。</li>
 * </ul>
 * </p>
 */
@RestController
@RequestMapping("/api/ai")
public class ArbiterController {

    /** 烬灯记录者的人格：只收束旅途，不出戏，不编造，三行输出，语言随玩家。 */
    static final String ARBITER_SYSTEM =
            "你是《跨界纪事》里炉火的记录者。玩家刚刚走完终章，并且在门前做好了自己的终局抉择。"
            + "请基于他的旅途数据，为他写一封短信。\n"
            + "\n"
            + "严格只输出一个 JSON 对象，不要任何额外字符、不要前言、不要解释，键必须是英文：\n"
            + "{\"title\":\"不超过 12 个字的题名\",\"epilogue\":\"不超过 70 个字的归途短句\",\"omen\":\"不超过 26 个字的下一次指向\"}\n"
            + "\n"
            + "规则：\n"
            + "· choice=keep（留灯，把火留给后来人）：题名用门开着的语气，话里要有人还会进来。\n"
            + "· choice=quiet（安静走完，把旅程收好）：题名用门收起来的语气，话里要有走完的人被郑重看见。\n"
            + "· choice=unwritten（老档 / 未显式抉择）：题名用雾还在等的语气，话里不替任何人选。\n"
            + "· 不编造任何具体数值、掉落、版本号或地名；旅途数据只作情绪与密度的依据。\n"
            + "· epilogue 可以出现母题、回声、判官、铁矿、白桦、七百年、炉火、守夜人、锚点这类本作印记。\n"
            + "· 用收信人的母语回答：zh 用中文，en 用英文；三行都必须同语。\n"
            + "· 三行都是内容，没有对白、没有引号标出说话人、没有列表。";

    private static final Set<String> CHOICES = Set.of("keep", "quiet", "unwritten");
    private static final Set<String> LANGS = Set.of("zh", "en");

    private final LlmClient client;

    public ArbiterController(LlmClient client) {
        this.client = client;
    }

    /** 输入全部限长：它们会被拼进提示词，不是一条可以无限长的管道。 */
    public record ArbiterRequest(
            @NotBlank @Size(max = 16) String choice,
            @NotBlank @Size(max = 8) String lang,
            @Size(max = 500) String stats,
            @Size(max = 64) String player) {}

    @PostMapping("/arbiter")
    public Map<String, Object> arbiter(@Valid @RequestBody ArbiterRequest request,
            @RequestHeader(value = "X-Request-Id", required = false) String headerRequestId) {
        String choice = sanitize(request.choice());
        if (!CHOICES.contains(choice)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid-choice");
        }
        String lang = sanitize(request.lang());
        if (!LANGS.contains(lang)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid-lang");
        }
        String stats = request.stats() == null ? "" : sanitize(request.stats());
        String player = request.player() == null ? "" : sanitize(request.player());

        String user = ("终局抉择(choice)：%s%n"
                + "旅途账本(stats, 紧凑 JSON 片段)：%s%n"
                + "收信人(player)：%s%n"
                + "语言(language)：%s%n"
                + "%n请写归途短信（只输出 JSON）。")
                .formatted(choice,
                        stats.isBlank() ? "（无账本数据）" : stats,
                        player.isBlank() ? "（一名无名旅人）" : player,
                        lang);
        LlmClient.Answer answer = client.complete(ARBITER_SYSTEM, user, LlmClient.CacheKeys.ARBITER);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("available", true);
        body.put("raw", answer.answer());
        body.put("model", answer.model());
        body.put("cached", answer.cached());
        body.put("upstreamCached", answer.upstreamCached());
        String effectiveRequestId = RequestCorrelation.sanitizeInbound(headerRequestId);
        if (effectiveRequestId != null) {
            body.put("requestId", effectiveRequestId);
        }
        return body;
    }

    /** 账本与名字只能做人话，不做协议：控制字符（换行 / 退格 / ESC 等）一律抹掉，再由 @Size 卡长度。 */
    private static String sanitize(String in) {
        return in.replaceAll("[\\x00-\\x1f\\x7f]", " ").trim();
    }

    @ExceptionHandler(AdvisorUnavailableException.class)
    public ResponseEntity<Map<String, Object>> unavailable(AdvisorUnavailableException e) {
        return AiErrors.unavailable(e.getReason());
    }
}
