package com.crossrealm.chronicles.ai;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Java StateGraph 单元测试（与 tests/state-graph.test.js 行为对齐）：
 * addNode 先用、compile 静态良构、invoke 步进/合并/trace。
 */
class StateGraphTest {

    @Test
    void 缺少入口_compile失败() {
        StateGraph g = new StateGraph();
        g.addNode("a", s -> Map.of());
        assertThrows(IllegalStateException.class, g::compile);
    }

    @Test
    void 节点未注册就连边_抛错() {
        StateGraph g = new StateGraph();
        g.addNode("a", s -> Map.of());
        assertThrows(IllegalStateException.class, () -> g.addEdge("a", "ghost"));
        assertThrows(IllegalStateException.class, () -> g.addConditionalEdges("ghost", s -> "a"));
        assertThrows(IllegalArgumentException.class, () -> g.addNode("b", null));
        assertThrows(IllegalArgumentException.class, () -> g.addConditionalEdges("a", null));
    }

    @Test
    void 静态边_顺序执行并合并patch() {
        StateGraph g = new StateGraph();
        g.addNode("a", s -> Map.of("x", 1));
        g.addNode("b", s -> Map.of("x", ((Number) s.get("x")).intValue() + 1, "y", "done"));
        g.addEdge("a", "b");
        g.setEntryPoint("a");

        StateGraph.CompiledInvoke r = g.compile().invoke(Map.of());

        assertEquals(2, r.state().get("x"));
        assertEquals("done", r.state().get("y"));
        assertEquals(List.of("a", "b"), r.trace().stream().map(StateGraph.TraceEntry::node).toList());
    }

    @Test
    void 条件边_按state分发() {
        StateGraph g = new StateGraph();
        g.addNode("pick", s -> Map.of("lane", String.valueOf(s.get("seed"))));
        g.addNode("lore", s -> Map.of("text", "LORE"));
        g.addNode("journey", s -> Map.of("text", "JOURNEY"));
        g.addConditionalEdges("pick", s -> "lore".equals(s.get("lane")) ? "lore" : "journey");
        g.setEntryPoint("pick");
        g.setMeta("pick", Map.of("kind", "triage"));

        StateGraph.Compiled c = g.compile();
        assertEquals("LORE", c.invoke(Map.of("seed", "lore")).state().get("text"));
        assertEquals("JOURNEY", c.invoke(Map.of("seed", "whatever")).state().get("text"));
        assertEquals(Map.of("kind", "triage"), g.meta().get("pick"));
    }

    @Test
    void invoke时未注册的下一个节点_抛错并点名() {
        StateGraph g = new StateGraph();
        g.addNode("a", s -> Map.of());
        g.addConditionalEdges("a", s -> "ghost");
        g.setEntryPoint("a");
        // routeFn 在空 state 下返回 ghost：compile 探测会直接 fail fast
        assertThrows(IllegalStateException.class, g::compile);
    }

    @Test
    void 条件边抛错依赖state_compile放行_invoke照样可以走() {
        StateGraph g = new StateGraph();
        g.addNode("a", s -> Map.of("ok", true));
        g.addNode("b", s -> Map.of("end", true));
        // routeFn 依赖 state，探测时会空指针——宽松编译应放行
        g.addConditionalEdges("a", s -> (String) s.get("next"));
        g.setEntryPoint("a");

        // 注意：routeFn 返回 null → invoke 到 a 后停止（无路可走）
        assertEquals(List.of("a"), g.compile().invoke(Map.of()).trace().stream()
                .map(StateGraph.TraceEntry::node).toList());
        // 无 next 时 next==null，停在 a；有时走 b
        assertEquals(List.of("a", "b"), g.compile().invoke(Map.of("next", "b")).trace().stream()
                .map(StateGraph.TraceEntry::node).toList());
    }

    @Test
    void 自循环边_安全停止() {
        StateGraph g = new StateGraph();
        g.addNode("a", s -> Map.of("n", ((Number) s.getOrDefault("n", 0)).intValue() + 1));
        g.addEdge("a", "a"); // 自环：invoke 一次后即停（next == cursor）
        g.setEntryPoint("a");

        StateGraph.CompiledInvoke r = g.compile().invoke(Map.of());
        assertEquals(1, r.trace().size());
    }

    @Test
    void trace里的state是快照不共享引用() {
        StateGraph g = new StateGraph();
        g.addNode("a", s -> Map.of("n", 1));
        g.addNode("b", s -> Map.of("n", 2));
        g.addEdge("a", "b");
        g.setEntryPoint("a");

        List<StateGraph.TraceEntry> trace = g.compile().invoke(Map.of()).trace();
        assertEquals(1, trace.get(0).state().get("n"));
        assertEquals(2, trace.get(1).state().get("n"));
    }

    @Test
    void 入口点名称与节点集可查询() {
        StateGraph g = new StateGraph();
        g.addNode("x", s -> Map.of());
        g.setEntryPoint("x");
        assertEquals("x", g.entryPoint());
        assertTrue(g.nodeNames().contains("x"));
    }
}
