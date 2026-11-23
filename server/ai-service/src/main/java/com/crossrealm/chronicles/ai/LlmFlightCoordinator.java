package com.crossrealm.chronicles.ai;

import java.util.Map;
import java.util.Optional;

/** 跨实例同键合流契约；禁用时不改变现有进程内 single-flight。 */
interface LlmFlightCoordinator {

    LlmFlightCoordinator DISABLED = new LlmFlightCoordinator() {
        @Override
        public Optional<Claim> claim(String digest, long leaseMs) {
            return Optional.empty();
        }

        @Override
        public Result await(String digest, long deadlineMs) {
            return null;
        }

        @Override
        public boolean complete(Claim claim, LlmClient.Answer answer) {
            return false;
        }

        @Override
        public boolean fail(Claim claim, String reason) {
            return false;
        }
    };

    /** 空表示已有领队；owner 只用于终态写入的栅栏校验。 */
    record Claim(String digest, String owner, long leaseMs) {}

    /** answer 与 failureReason 恰好一个有效；只接受完整终态。 */
    record Result(String answer, boolean upstreamCached, String failureReason) {}

    Optional<Claim> claim(String digest, long leaseMs);

    Result await(String digest, long deadlineMs) throws InterruptedException;

    boolean complete(Claim claim, LlmClient.Answer answer);

    boolean fail(Claim claim, String reason);

    /** 未真正请求上游的本地抢占失败不发布给其它实例；默认无需动作。 */
    default boolean release(Claim claim) {
        return false;
    }

    default Map<String, Object> health() {
        return Map.of("backend", "in-memory");
    }
}
