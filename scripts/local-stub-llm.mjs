#!/usr/bin/env node
/**
 * local-stub-llm — a minimal deterministic fake of the wkapi.pro /v1 OpenAI-compatible
 * chat completions endpoint (W-Z86). Exists so that load-harness runs (and the odd
 * offline demo) exercise the **real ai-service + oracle pipeline end-to-end** without
 * spending real tokens.
 *
 * It implements the exact slice the LlmClient touches:
 *   POST /v1/chat/completions
 * with `stream:true` + `stream_options.include_usage:true` (W-Z11口径) — merges
 * content deltas + passes through a final usage chunk with cached_tokens (as
 * upstream does for wkapi.pro streaming responses), terminated by `data: [DONE]`.
 *
 * Not a mock of the client's MCP/semantic behavior — it is deliberately dumb:
 * fixed short answer, 20 ms artificial workload, always the same tokens.
 *
 * Usage:  node scripts/local-stub-llm.mjs [--port 28884]
 */
import http from 'node:http';

const portArg = process.argv.find((a) => a.startsWith('--port='));
const PORT = portArg ? Number(portArg.split('=')[1]) : 28884;
if (process.argv.includes('--help')) {
  console.log('usage: node scripts/local-stub-llm.mjs [--port 28884]');
  process.exit(0);
}

const CANNED_ANSWER = '典籍里没有写为什么，只写了「火还在」。[creative/novel/07-第七章-余烬.md]\n\nSources:\n[creative/novel/07-第七章-余烬.md]';
const LATENCY_MS = 20;
const PROMPT_TOKENS = 4700;
const CACHED_TOKENS = 393;

const sse = (obj) => `data: ${JSON.stringify(obj)}\n\n`;
const chunk = (id, choices, extra) => ({
  id: `chatcmpl-stress-${id}`,
  object: 'chat.completion.chunk',
  created: Math.floor(Date.now() / 1000),
  model: 'gpt-6-sol',
  ...(extra ?? {}),
  ...(choices ? { choices } : {}),
});

const server = http.createServer((req, res) => {
  const t0 = Date.now();
  if (req.method !== 'POST') {
    res.writeHead(405).end('{}');
    return;
  }
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.endsWith('chat/completions')) {
    res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'stub-path-not-found', path: url.pathname }));
    return;
  }
  let body = '';
  req.on('data', (d) => { body += d; });
  req.on('end', () => {
    const finish = () => {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      const id = Date.now().toString(36);
      const delta = (content, role) => ({ index: 0, delta: role ? { role, content } : { content }, finish_reason: null });
      res.write(sse(chunk(id, [delta('典', 'assistant')])));
      // keep chunks cheap but nontrivial (CJK counts as multiple bytes for realism)
      const pieces = CANNED_ANSWER.match(/.{1,8}/gu) ?? [CANNED_ANSWER];
      for (const piece of pieces) res.write(sse(chunk(id, [delta(piece)])));
      res.write(sse(chunk(id, [{ index: 0, delta: {}, finish_reason: 'stop' }])));
      res.write(sse(chunk(id, null, { usage: { prompt_tokens: PROMPT_TOKENS, completion_tokens: 40, total_tokens: PROMPT_TOKENS + 40, prompt_tokens_details: { cached_tokens: CACHED_TOKENS } } })));
      res.write('data: [DONE]\n\n');
      res.end();
    };
    setTimeout(finish, Math.max(0, LATENCY_MS - (Date.now() - t0)));
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`local-stub-llm listening on 127.0.0.1:${PORT} — gpt-6-sol fake (20 ms, streamed)`);
});
