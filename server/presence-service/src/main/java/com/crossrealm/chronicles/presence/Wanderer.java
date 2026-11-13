package com.crossrealm.chronicles.presence;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 一位"在场游侠"的不可变快照。坐标用归一化世界坐标（x,z ∈ [-1,1]），
 * hue 是色相（0..359），ts 是服务端收到心跳的毫秒时间戳（用于快照过期判断）。
 *
 * JSON 手写（只用到 Map 这一稳妥路径），不交给 Jackson 去绑 record 构造器——
 * 避免编译期 -parameters 缺失导致的反序列化踩坑；字段形状固定，手写最稳。
 */
public record Wanderer(String id, String name, int hue, double x, double z, long ts) {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    public String toJson() {
        try {
            LinkedHashMap<String, Object> m = new LinkedHashMap<>();
            m.put("id", id);
            m.put("name", name);
            m.put("hue", hue);
            m.put("x", x);
            m.put("z", z);
            m.put("ts", ts);
            return MAPPER.writeValueAsString(m);
        } catch (Exception e) {
            throw new IllegalStateException("serialize wanderer failed", e);
        }
    }

    public static Wanderer parse(String json) {
        try {
            Map<String, Object> m = MAPPER.readValue(json, new TypeReference<Map<String, Object>>() {});
            return new Wanderer(
                    asString(m.get("id"), "id"),
                    asString(m.get("name"), "name"),
                    (int) asDouble(m.get("hue")),
                    asDouble(m.get("x")),
                    asDouble(m.get("z")),
                    (long) asDouble(m.get("ts")));
        } catch (Exception e) {
            throw new IllegalArgumentException("bad wanderer json: " + e.getMessage(), e);
        }
    }

    private static String asString(Object v, String field) {
        if (v == null) throw new IllegalArgumentException("missing field: " + field);
        return String.valueOf(v);
    }

    private static double asDouble(Object v) {
        if (v == null) return 0d;
        if (v instanceof Number n) return n.doubleValue();
        try {
            return Double.parseDouble(String.valueOf(v));
        } catch (NumberFormatException e) {
            return 0d;
        }
    }
}
