import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../../engagement-analytics.js", import.meta.url), "utf8");

const createBrowser = (hostname = "assmagic2026.github.io") => {
  let now = 0;
  const documentListeners = new Map();
  const windowListeners = new Map();
  const beacons = [];
  const document = {
    currentScript: { dataset: { endpoint: "https://worker.example/v1/engagement" } },
    visibilityState: "visible",
    addEventListener(type, handler) {
      documentListeners.set(type, handler);
    },
  };
  const performance = { now: () => now };
  const window = {
    location: { hostname },
    performance,
    addEventListener(type, handler) {
      windowListeners.set(type, handler);
    },
  };
  const navigator = {
    sendBeacon(endpoint, body) {
      beacons.push({ endpoint, body: JSON.parse(body) });
      return true;
    },
  };

  const context = vm.createContext({
    Array,
    JSON,
    Math,
    Uint8Array,
    crypto: { randomUUID: () => "123e4567-e89b-42d3-a456-426614174000" },
    document,
    fetch: () => Promise.resolve(new Response(null, { status: 204 })),
    navigator,
    performance,
    window,
  });

  return {
    beacons,
    document,
    documentListeners,
    setNow(value) {
      now = value;
    },
    windowListeners,
    run() {
      vm.runInContext(source, context);
    },
  };
};

test("client records visible time only and does no polling", () => {
  const browser = createBrowser();
  browser.run();

  assert.deepEqual([...browser.documentListeners.keys()], ["visibilitychange"]);
  assert.deepEqual([...browser.windowListeners.keys()], ["pagehide", "pageshow"]);
  assert.equal(browser.beacons.length, 0);

  browser.setNow(4000);
  browser.document.visibilityState = "hidden";
  browser.documentListeners.get("visibilitychange")();
  assert.equal(browser.beacons.length, 1);
  assert.equal(browser.beacons[0].body.seconds, 4);

  browser.setNow(104000);
  browser.document.visibilityState = "visible";
  browser.documentListeners.get("visibilitychange")();
  browser.setNow(105000);
  browser.document.visibilityState = "hidden";
  browser.documentListeners.get("visibilitychange")();
  assert.equal(browser.beacons.length, 2);
  assert.equal(browser.beacons[1].body.seconds, 5);

  browser.windowListeners.get("pagehide")();
  assert.equal(browser.beacons.length, 2);
});

test("client is inert outside the official host", () => {
  const browser = createBrowser("127.0.0.1");
  browser.run();

  assert.equal(browser.documentListeners.size, 0);
  assert.equal(browser.windowListeners.size, 0);
  assert.equal(browser.beacons.length, 0);
});
