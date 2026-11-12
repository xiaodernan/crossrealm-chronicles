package com.crossrealm.chronicles.ai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * W-X22「回声灯」收编版（原本散落在 game-service 的未接线半成品）。
 *
 * <p>为什么要搬进 ai-service：① 网关的 {@code /api/ai/**} 已经指向这里，
 * 留在 game-service 的端点**永远收不到请求**；② 密钥只该有一个进程持有；
 * ③ 回声灯同样需要超时、重试、熔断与缓存 —— 这些在 {@link LlmClient#complete}
 * 里只有一份，再写一套等于两份迟早对不上的口径。
 *
 * <p>人格提示与星轨顾问**刻意不同**：顾问是守在篝火边的旅人，回声灯是梦话般的先知。
 */
@RestController
@RequestMapping("/api/ai")
public class EchoHintController {

    /** ≤45 字、不出戏、不解释的先知口吻。 */
    static final String ECHO_SYSTEM =
            "你是《跨界纪元》里的回声先知。每次只回一句不超过 45 字的中文短句，"
                    + "像在说梦话一样点出这一枚回声的来历或去处；不解释、不用 Emoji、不出戏、不复述玩家给的原句。";

    private final LlmClient client;

    public EchoHintController(LlmClient client) {
        this.client = client;
    }

    /** 输入全部限长：它们会被拼进提示词，不是一条可以无限长的管道。 */
    public record EchoRequest(
            @NotBlank @Size(max = 64) String franchise,
            @NotBlank @Size(max = 120) String title,
            @Size(max = 400) String desc) {}

    @PostMapping("/echo-hint")
    public Map<String, Object> echoHint(@Valid @RequestBody EchoRequest request) {
        String user = "母题：%s%n回声名：%s%n回声描述：%s%n%n请给一个游戏内的暗示（只回一句，不超过 45 字）："
                .formatted(request.franchise(), request.title(),
                        request.desc() == null || request.desc().isBlank() ? "（无描述）" : request.desc());
        LlmClient.Answer answer = client.complete(ECHO_SYSTEM, user);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("available", true);
        body.put("hint", answer.answer());
        body.put("cached", answer.cached());
        return body;
    }

    @ExceptionHandler(AdvisorUnavailableException.class)
    public ResponseEntity<Map<String, Object>> unavailable(AdvisorUnavailableException e) {
        return AiErrors.unavailable(e.getReason());
    }
}
