package com.crossrealm.chronicles.game.notify;

/**
 * 报讯事件（W-Z50）—— game-service 侧往 notification-service 发一条世界事件。
 *
 * <p>刻意只有三格（kind/title/body）：客户端不该把内部状态/玩家 PII 往别的服务塞，
 * 一条报讯只该携带「发生了什么」的最小表达。
 */
public record NotifyEvent(String kind, String title, String body) {
}
