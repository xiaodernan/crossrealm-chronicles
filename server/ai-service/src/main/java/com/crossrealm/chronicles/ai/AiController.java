package com.crossrealm.chronicles.ai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 玩家侧唯一入口。这里不认识密钥、不认识上游地址，只认识一个问题。 */
@RestController
@RequestMapping("/api/ai")
public class AiController {

    private final LlmClient client;

    public AiController(LlmClient client) {
        this.client = client;
    }

    /**
     * 请求体。上下文是**可选**的游戏状态（区域 / 赛季 / 图鉴档位…），
     * 条目数与长度都封顶：它是拼进提示词的数据，不是一条可以无限长的管道。
     */
    public record ChatRequest(
            @NotBlank @Size(max = 400) String question,
            @Size(max = 8) Map<String, Object> context) {}

    @PostMapping("/chat")
    public ResponseEntity<Map<String, Object>> chat(@Valid @RequestBody ChatRequest request) {
        LlmClient.Answer answer = client.ask(request.question(), request.context());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("answer", answer.answer());
        body.put("model", answer.model());
        body.put("cached", answer.cached());
        body.put("latencyMs", answer.latencyMs());
        return ResponseEntity.ok(body);
    }

    /** 只读健康快照：明确不回显 apiKey、上游地址与任何请求内容。 */
    @GetMapping("/health")
    public Map<String, Object> health() {
        return client.health();
    }

    @ExceptionHandler(AdvisorUnavailableException.class)
    public ResponseEntity<Map<String, Object>> unavailable(AdvisorUnavailableException e) {
        return AiErrors.unavailable(e.getReason());
    }
}
