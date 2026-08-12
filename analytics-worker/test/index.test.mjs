import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest } from "../src/index.js";

const ORIGIN = "https://assmagic2026.github.io";
const SESSION_ID = "123e4567-e89b-42d3-a456-426614174000";

const createEnv = () => {
  const writes = [];
  return {
    writes,
    env: {
      ENGAGEMENT: {
        writeDataPoint(point) {
          writes.push(point);
        },
      },
    },
  };
};

test("accepts one valid privacy-minimal snapshot", async () => {
  const { env, writes } = createEnv();
  const response = await handleRequest(new Request("https://worker.example/v1/engagement", {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify({ v: 1, sessionId: SESSION_ID, seconds: 125 }),
  }), env);

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assert.deepEqual(writes, [{
    indexes: ["assmagic2026.github.io"],
    blobs: [SESSION_ID],
    doubles: [125],
  }]);
});

test("rejects requests from other origins without recording", async () => {
  const { env, writes } = createEnv();
  const response = await handleRequest(new Request("https://worker.example/v1/engagement", {
    method: "POST",
    headers: { Origin: "https://example.com" },
    body: JSON.stringify({ v: 1, sessionId: SESSION_ID, seconds: 60 }),
  }), env);

  assert.equal(response.status, 403);
  assert.equal(writes.length, 0);
});

test("rejects malformed or out-of-range measurements", async () => {
  const { env, writes } = createEnv();
  const invalidBodies = [
    "not-json",
    JSON.stringify({ v: 1, sessionId: "not-a-uuid", seconds: 60 }),
    JSON.stringify({ v: 1, sessionId: SESSION_ID, seconds: 2 }),
    JSON.stringify({ v: 1, sessionId: SESSION_ID, seconds: 50000 }),
  ];

  for (const body of invalidBodies) {
    const response = await handleRequest(new Request("https://worker.example/v1/engagement", {
      method: "POST",
      headers: { Origin: ORIGIN },
      body,
    }), env);
    assert.ok(response.status === 400 || response.status === 413);
  }
  assert.equal(writes.length, 0);
});

test("rejects bodies larger than one kilobyte", async () => {
  const { env, writes } = createEnv();
  const response = await handleRequest(new Request("https://worker.example/v1/engagement", {
    method: "POST",
    headers: { Origin: ORIGIN },
    body: "x".repeat(1025),
  }), env);

  assert.equal(response.status, 413);
  assert.equal(writes.length, 0);
});

test("health check never writes analytics", async () => {
  const { env, writes } = createEnv();
  const response = await handleRequest(new Request("https://worker.example/health"), env);

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "ok");
  assert.equal(writes.length, 0);
});
