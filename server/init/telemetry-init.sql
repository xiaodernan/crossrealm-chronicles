-- W-Z130 —— 遥测落地盘 schema（postgres init hook: 首次启动自动执行）
-- 表设计要点：
--   telemetry_events(id, type, detail, received_at)  —— 原始滚动事件(只追加 + 索引 recent)
--   telemetry_daily_rollup(day, type, count)          —— 每日按 type 预聚合，供炉边盘 14 天窗
-- 两张表同一个事务 UPSERT（批 ≤100 写一次），避免逐条插入锁热点。

CREATE TABLE IF NOT EXISTS telemetry_events (
    id         BIGSERIAL PRIMARY KEY,
    type       TEXT        NOT NULL,
    detail     TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_events_received_at
    ON telemetry_events (received_at DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_events_type_received_at
    ON telemetry_events (type, received_at DESC);

CREATE TABLE IF NOT EXISTS telemetry_daily_rollup (
    day    DATE   NOT NULL,
    type   TEXT   NOT NULL,
    count  BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (day, type)
);

CREATE INDEX IF NOT EXISTS idx_telemetry_daily_rollup_day
    ON telemetry_daily_rollup (day DESC);
