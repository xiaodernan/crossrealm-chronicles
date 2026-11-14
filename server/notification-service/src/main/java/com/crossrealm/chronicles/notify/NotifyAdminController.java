package com.crossrealm.chronicles.notify;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 台账清理 —— 仅在 {@code notification-service.admin-enabled=true} 时存在。
 *
 * <p>默认不注册：生产环境里"谁都能清空报讯台账"不是一个功能，是一颗地雷。
 * 测试/联调显式打开 property 才有这个端点。
 */
@RestController
@ConditionalOnProperty(name = "notification-service.admin-enabled", havingValue = "true")
public class NotifyAdminController {

    private final NotificationLedger ledger;

    public NotifyAdminController(NotificationLedger ledger) {
        this.ledger = ledger;
    }

    @DeleteMapping("/api/notify")
    public ResponseEntity<Map<String, Object>> clear() {
        ledger.clear();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cleared", true);
        return ResponseEntity.ok(out);
    }
}
