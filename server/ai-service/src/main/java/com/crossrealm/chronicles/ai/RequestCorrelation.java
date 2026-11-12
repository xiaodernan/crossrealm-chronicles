package com.crossrealm.chronicles.ai;

import java.util.regex.Pattern;

/**
 * W-Z6：{@code X-Request-Id} 关联续一程（网关 W-P8 的下游那一截）。
 *
 * <p>网关对每个请求都盖了 {@code X-Request-Id}（白名单原样透传 / 否则铸 UUID / 出行无条件钉住）——
 * 这个值到了 ai-service 之后必须继续有用：
 * <ul>
 *   <li>玩家/客户端压根没传 id 时，**唯一**的名字就是网关铸的那个；丢了它，慢查询线程里的日志就对不上人；</li>
 *   <li>body 里自带的 {@code requestId} 是**幂等键**（同一位玩家同一句话重试的去重依据）——
 *       不能被它顶掉；它没写才轮到 header。两种都没有 = {@code null}（不编造）。</li>
 * </ul>
 *
 * <p>白名单与网关逐字一致：1..64 个可见 ASCII，排除空白 / 逗号 / 分号 / 控制字符。
 * 游客和畸形脚本带进来的烂头一律当没带，不当幂等键也不当日志 id。
 */
public final class RequestCorrelation {

    private static final Pattern SAFE = Pattern.compile("^[^\\s,;\\u0000-\\u001F\\u007F-\\uFFFF]{1,64}$");

    private RequestCorrelation() {}

    /** 与网关 W-P8 同一条白名单：1..64 个可见 ASCII，不含空白 / 逗号 / 分号。 */
    public static String sanitizeInbound(String raw) {
        if (raw == null) {
            return null;
        }
        String v = raw.trim();
        return SAFE.matcher(v).matches() ? v : null;
    }

    /** body 自带的幂等键优先（夺权风险不许有）；否则用 X-Request-Id；都没有 = null（不编造）。 */
    public static String resolve(String bodyRequestId, String headerRequestId) {
        if (bodyRequestId != null && !bodyRequestId.isBlank()) {
            return bodyRequestId.trim();
        }
        return sanitizeInbound(headerRequestId);
    }
}
