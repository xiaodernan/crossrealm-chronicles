package com.crossrealm.chronicles.game;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** 版本信息 API：/api/version（含配置中心下发的 version-note 备注） */
@RestController
public class VersionController {

    private final GameServiceProperties properties;
    private final String applicationName;

    public VersionController(GameServiceProperties properties,
                             @Value("${spring.application.name:game-service}") String applicationName) {
        this.properties = properties;
        this.applicationName = applicationName;
    }

    @GetMapping("/api/version")
    public Map<String, Object> version() {
        return Map.of(
                "service", applicationName,
                "version", "0.1.0-SNAPSHOT",
                "javaVersion", System.getProperty("java.version"),
                "note", properties.getVersionNote());
    }
}
