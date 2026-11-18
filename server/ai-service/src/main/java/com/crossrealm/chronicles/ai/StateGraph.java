package com.crossrealm.chronicles.ai;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;

/**
 * StateGraph —— 服务端 Java 版状态机（零依赖，与 {@code src/core/StateGraph.js} 同源语义）。
 *
 * <p>之所以在 ai-service 里也放一份：
 * <ol>
 *   <li>前端 JS 与后端 Java 共享同一张编译图心智模型（State / Node / Edge / Conditional Edge），
 *       两端测试可以一一对应；
 *   <li>「LLM 作为 NPC」的分拣→编排→回灌现在是一张<b>编译后的图</b>在 invoke，而不是散落
 *       各处的 if-else 漏斗；
 *   <li>invoke 全量 trace，管理端与测试可以看见「走过了哪些节点」；</li>
 *   <li>不引入第三方依赖（LangChain4j 的重量对这个模块完全不划算），语义与 LangGraph 对齐：
 *       检索→重排→生成→引用门禁 +「证据不够回检索」的条件边，都是这张图的形状。</li>
 * </ol>
 *
 * <h2>约束</h2>
 * <ul>
 *   <li>同步执行（无线程/锁/异态并发）——保证测试与线上行为一致；</li>
 *   <li>无任何第三方依赖（左到右直读、不拉任何东西）；</li>
 *   <li>节点函数必须「轻副作用」——LLM 调用和 IO 允许（这是业务图），但状态只能通过
 *       返回 patch 写入（Object.assign 语义），不允许直改外部上下文后再读回来；</li>
 *   <li>条件边只能改变<b>下一个节点</b>，不能跳过节点本身。</li>
 * </ul>
 */
public class StateGraph {

    /** 节点函数：接收当前 state（只读语义），返回 patch（merge 进 state）。 */
    @FunctionalInterface
    public interface NodeFn {
        Map<String, Object> apply(Map<String, Object> state);
    }

    /** 单次步进产物 — 节点名 + 合并后的 state 快照。 */
    public record TraceEntry(String node, Map<String, Object> state) {}

    /** invoke 的完整结果：终态 + 全量轨迹。 */
    public record CompiledInvoke(Map<String, Object> state, List<TraceEntry> trace) {}

    private final Map<String, NodeFn> nodes = new LinkedHashMap<>();
    private final Map<String, Function<Map<String, Object>, String>> edges = new LinkedHashMap<>();
    private final Map<String, Map<String, Object>> meta = new LinkedHashMap<>();
    private String entry;

    /** 注册节点；{@code fn} 不能为 null。 */
    public StateGraph addNode(String name, NodeFn fn) {
        if (fn == null) {
            throw new IllegalArgumentException("StateGraph.addNode: node \"" + name + "\" fn 不能为 null");
        }
        nodes.put(name, fn);
        return this;
    }

    /** 静态边：from → to 无条件。两端都必须已注册。 */
    public StateGraph addEdge(String from, String to) {
        ensureNode(from);
        ensureNode(to);
        edges.put(from, state -> to);
        return this;
    }

    /** 条件边：routeFn(state) → 下一个节点名。 */
    public StateGraph addConditionalEdges(String from, Function<Map<String, Object>, String> routeFn) {
        ensureNode(from);
        if (routeFn == null) {
            throw new IllegalArgumentException("StateGraph.addConditionalEdges: from=\"" + from + "\" routeFn 不能为 null");
        }
        edges.put(from, routeFn);
        return this;
    }

    /** 附加 meta（标签/位置/视觉专用）；读侧可见，不影响走图。 */
    public StateGraph setMeta(String name, Map<String, Object> values) {
        ensureNode(name);
        meta.computeIfAbsent(name, k -> new LinkedHashMap<>()).putAll(values == null ? Map.of() : values);
        return this;
    }

    public StateGraph setEntryPoint(String name) {
        ensureNode(name);
        this.entry = name;
        return this;
    }

    public String entryPoint() {
        return entry;
    }

    /** 只读视图（测试与教学用）。 */
    public Map<String, Map<String, Object>> meta() {
        return Collections.unmodifiableMap(meta);
    }

    public Set<String> nodeNames() {
        return Collections.unmodifiableSet(nodes.keySet());
    }

    /** 宽松编译：入口存在 + 边起点已注册 + 条件边探测（返回值必须是已注册节点或抛错，抛错留给 invoke）。 */
    public Compiled compile() {
        if (entry == null) {
            throw new IllegalStateException("StateGraph: 缺少 setEntryPoint — 编译失败");
        }
        for (Map.Entry<String, Function<Map<String, Object>, String>> e : edges.entrySet()) {
            String cur = e.getKey();
            if (!nodes.containsKey(cur)) {
                throw new IllegalStateException("StateGraph.compile: 边起点未注册节点 \"" + cur + "\"");
            }
            try {
                String out = e.getValue().apply(Map.of());
                if (out != null && !nodes.containsKey(out)) {
                    throw new IllegalStateException(
                            "StateGraph.compile: 边 \"" + cur + "\" -> \"" + out + "\" 目标未注册节点");
                }
            } catch (IllegalStateException ex) {
                throw ex;
            } catch (Exception ignored) {
                // 条件边合法：routeFn 依赖 state —— 留给 invoke 再检
            }
        }
        return new Compiled(this);
    }

    private void ensureNode(String name) {
        if (!nodes.containsKey(name)) {
            throw new IllegalStateException("StateGraph: 节点 \"" + name + "\" 尚未 addNode — 拒绝先用。"
                    + "请先注册节点再连边。");
        }
    }

    /** 编译产物。不可再改结构（图在 compile 时刻定形）。 */
    public static final class Compiled {

        private final StateGraph graph;

        private Compiled(StateGraph graph) {
            this.graph = graph;
        }

        /** 执行图：拷贝初始 state → 步进（上限 1024）→ 每步 merge patch → 记录 trace。 */
        public CompiledInvoke invoke(Map<String, Object> initialState) {
            Map<String, Object> state = new LinkedHashMap<>();
            if (initialState != null) {
                state.putAll(initialState);
            }
            List<TraceEntry> trace = new ArrayList<>();
            String cursor = graph.entry;
            for (int step = 0; step < 1024 && cursor != null; step++) {
                NodeFn fn = graph.nodes.get(cursor);
                if (fn == null) {
                    throw new IllegalStateException("StateGraph.invoke: 未注册节点 \"" + cursor + "\"");
                }
                Map<String, Object> patch = fn.apply(state);
                if (patch != null) {
                    state.putAll(patch);
                }
                trace.add(new TraceEntry(cursor, Collections.unmodifiableMap(new LinkedHashMap<>(state))));
                Function<Map<String, Object>, String> edgeFn = graph.edges.get(cursor);
                if (edgeFn == null) {
                    break;
                }
                String next = edgeFn.apply(state);
                if (next == null || next.equals(cursor)) {
                    break;
                }
                cursor = next;
            }
            return new CompiledInvoke(Collections.unmodifiableMap(state), List.copyOf(trace));
        }
    }
}
