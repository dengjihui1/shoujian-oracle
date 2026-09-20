import assert from "node:assert/strict";
import test from "node:test";
import { OracleApiClient } from "../src/api-client.js";

test("default browser fetch keeps its required global receiver", async () => {
  const originalFetch = globalThis.fetch;
  const receiver = globalThis;
  globalThis.fetch = function fetchWithRequiredReceiver(url, options) {
    assert.equal(this, receiver);
    assert.equal(url, "/api/status");
    assert.equal(options.method, "GET");
    return Promise.resolve(new Response(JSON.stringify({ cloud: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
  };

  try {
    const result = await new OracleApiClient().status();
    assert.equal(result.cloud, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("browser receives a stable Chinese message for upstream failures", async () => {
  const client = new OracleApiClient({
    fetchFn: async () => Response.json({
      error: "upstream_error",
      message: "Gemini rejected the request: provider detail"
    }, { status: 502 })
  });

  await assert.rejects(
    () => client.chat({ message: "潜龙勿用是什么意思？" }),
    (error) => error.code === "upstream_error" && error.message === "Gemini 服务暂时不可用，请稍后重试"
  );
});
