package com.crossrealm.chronicles.game.trial;

import com.crossrealm.chronicles.game.GameServiceProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 试炼榜的 REST 契约门禁（standalone MockMvc：不起容器，只验路由/JSON 形状/状态码）。
 *
 * <p>客户端（`OnlineServices.submitTrialRun`）依赖的字段名一旦改名，这一层必须红 ——
 * 否则线上表现是"试炼跑完了，榜上什么都没有，而且没有任何报错"。
 *
 * <p>校验器是手工挂的：`standaloneSetup` 默认不带 Bean Validation，
 * 不挂的话 `@Min/@Max` 全是摆设，非法请求会一路走到 service。
 */
class TrialControllerTest {

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        GameServiceProperties props = new GameServiceProperties();
        props.getTrial().setSeedDemoData(true);
        props.getTrial().setMaxLimit(10);
        props.getTrial().setMaxEntries(500);
        TrialLeaderboardService service = new TrialLeaderboardService(props);
        service.seedDemoData();

        LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();

        mockMvc = MockMvcBuilders
                .standaloneSetup(new TrialController(service, props))
                .setValidator(validator)
                .build();
    }

    @Test
    @DisplayName("出榜端点：形状、条数上限、缺省赛季是空串")
    void leaderboardEndpointShape() throws Exception {
        mockMvc.perform(get("/api/trials/leaderboard"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count", is(5)))
                .andExpect(jsonPath("$.items", hasSize(5)))
                .andExpect(jsonPath("$.season", is("")))
                .andExpect(jsonPath("$.maxLimit", is(10)))
                .andExpect(jsonPath("$.items[0].seasonId").exists())
                .andExpect(jsonPath("$.items[0].score").exists())
                .andExpect(jsonPath("$.items[0].layersCleared").exists())
                .andExpect(jsonPath("$.items[0].secondsLeft").exists())
                .andExpect(jsonPath("$.items[0].submittedAt").exists());
    }

    @Test
    @DisplayName("按赛季出榜：只回那一季的")
    void leaderboardFiltersBySeason() throws Exception {
        mockMvc.perform(get("/api/trials/leaderboard").param("season", "ember"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.season", is("ember")))
                .andExpect(jsonPath("$.items[0].seasonId", is("ember")));
        mockMvc.perform(get("/api/trials/leaderboard").param("season", "nope"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count", is(0)));
    }

    @Test
    @DisplayName("提交：201 + accepted + 新榜（第一条就是刚交的）")
    void submitAcceptsAndReturnsFreshBoard() throws Exception {
        String body = """
                {"runner":"试炼者","seasonId":"ember","score":700,"layersCleared":5,"secondsLeft":199}
                """;
        mockMvc.perform(post("/api/trials/runs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.accepted", is(true)))
                .andExpect(jsonPath("$.total", is(6)))
                .andExpect(jsonPath("$.top[0].runner", is("试炼者")))
                .andExpect(jsonPath("$.top[0].score", is(700)));
    }

    @Test
    @DisplayName("提交：分数为负 / 层数越界 / 空赛季 都返回 400（校验器真的挂上了）")
    void submitRejectsInvalidPayloads() throws Exception {
        String[] bad = {
                "{\"runner\":\"a\",\"seasonId\":\"ember\",\"score\":-1,\"layersCleared\":1,\"secondsLeft\":0}",
                "{\"runner\":\"a\",\"seasonId\":\"ember\",\"score\":10,\"layersCleared\":9,\"secondsLeft\":0}",
                "{\"runner\":\"a\",\"seasonId\":\"\",\"score\":10,\"layersCleared\":1,\"secondsLeft\":0}",
                "{\"runner\":\"\",\"seasonId\":\"ember\",\"score\":10,\"layersCleared\":1,\"secondsLeft\":0}",
                "{\"runner\":\"a\",\"seasonId\":\"ember\",\"layersCleared\":1,\"secondsLeft\":0}",
        };
        for (String body : bad) {
            mockMvc.perform(post("/api/trials/runs")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body))
                    .andExpect(status().isBadRequest());
        }
    }

    @Test
    @DisplayName("提交时两端空白被裁掉（榜单上不该出现带空格的同名玩家）")
    void submitTrimsWhitespace() throws Exception {
        String body = """
                {"runner":"  试炼者  ","seasonId":"  tide-trim  ","score":1,"layersCleared":0,"secondsLeft":0}
                """;
        mockMvc.perform(post("/api/trials/runs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.top[0].runner", is("试炼者")))
                .andExpect(jsonPath("$.top[0].seasonId", is("tide-trim")));
    }

    @Test
    @DisplayName("出榜的 limit 越界返回 400（与 Boss 榜同一条口径：约束在参数上，不靠 service 兜）")
    void leaderboardRejectsOutOfRangeLimit() throws Exception {
        mockMvc.perform(get("/api/trials/leaderboard").param("limit", "999"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/trials/leaderboard").param("limit", "0"))
                .andExpect(status().isBadRequest());
        // 边界内的值照常出榜
        mockMvc.perform(get("/api/trials/leaderboard").param("limit", "3"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(3)));
    }
}
