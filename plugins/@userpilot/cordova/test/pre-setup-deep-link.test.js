require("./helpers/cordova-modules");

const test = require("node:test");
const assert = require("node:assert/strict");

const exec = require("./helpers/cordova-exec-stub");

const USERPILOT_PATH = require.resolve("../www/userpilot.js");

const URL = "userpilot-test://sdk/experience_preview/123?type=flow";

/**
 * A `userpilot` with no setup behind it.
 *
 * `__loaded` and the held links live at module scope, so a test that completes
 * setup would leave every later test permanently initialized and the pre-setup
 * path unreachable. Re-requiring gives each test its own state.
 */
function freshUserpilot() {
  delete require.cache[USERPILOT_PATH];
  exec.reset();
  return require("../www/userpilot.js");
}

function noop() {}

/**
 * Records what a host's URL handler was told, which is what it routes on.
 */
function recorder() {
  const answers = [];
  const failures = [];
  return {
    answers,
    failures,
    onSuccess: (handled) => answers.push(handled),
    onFail: (error) => failures.push(error),
  };
}

// Runs `setup` and completes the native round trip the way the WebView would,
// by invoking the callback the exec stub recorded.
function completeSetup(userpilot) {
  userpilot.setup("token", {}, noop, noop);
  setupCall().onSuccess();
}

function failSetup(userpilot) {
  userpilot.setup("token", {}, noop, noop);
  setupCall().onFail("setup rejected");
}

function setupCall() {
  return exec.calls.filter((call) => call.action === "setup").pop();
}

function urlCalls() {
  return exec.calls.filter((call) => call.action === "didHandleUrl");
}

test("a URL handed over before setup waits instead of failing", () => {
  const userpilot = freshUserpilot();
  const host = recorder();

  userpilot.didHandleUrl(URL, host.onSuccess, host.onFail);

  assert.equal(urlCalls().length, 0);
  assert.deepEqual(host.answers, []);
  assert.deepEqual(host.failures, []);

  completeSetup(userpilot);

  assert.equal(urlCalls().length, 1);
  assert.equal(urlCalls()[0].service, "UserpilotCordovaPlugin");
  assert.deepEqual(urlCalls()[0].args, [URL]);
  // The host's own callbacks are what native answers, not a stand-in.
  assert.equal(urlCalls()[0].onSuccess, host.onSuccess);
  assert.equal(urlCalls()[0].onFail, host.onFail);
});

test("held URLs are forwarded in arrival order", () => {
  const userpilot = freshUserpilot();

  userpilot.didHandleUrl(URL, noop, noop);
  userpilot.didHandleUrl("myapp://profile", noop, noop);

  completeSetup(userpilot);

  assert.deepEqual(
    urlCalls().map((call) => call.args[0]),
    [URL, "myapp://profile"]
  );
});

test("a URL handed over after setup goes straight to native", () => {
  const userpilot = freshUserpilot();
  completeSetup(userpilot);

  userpilot.didHandleUrl(URL, noop, noop);

  assert.equal(urlCalls().length, 1);
  assert.deepEqual(urlCalls()[0].args, [URL]);
});

test("a failed setup answers held URLs as unhandled", () => {
  const userpilot = freshUserpilot();
  const host = recorder();
  userpilot.didHandleUrl(URL, host.onSuccess, host.onFail);

  failSetup(userpilot);

  // Answered, not failed: the host routes the link itself on `false`.
  assert.deepEqual(host.answers, [false]);
  assert.deepEqual(host.failures, []);
  assert.equal(urlCalls().length, 0);
});

test("a URL handed over after a failed setup is answered at once", () => {
  const userpilot = freshUserpilot();
  failSetup(userpilot);

  const host = recorder();
  userpilot.didHandleUrl(URL, host.onSuccess, host.onFail);

  assert.deepEqual(host.answers, [false]);
  assert.equal(urlCalls().length, 0);
});

test("a setup retry after a failure forwards URLs again", () => {
  const userpilot = freshUserpilot();
  failSetup(userpilot);

  const host = recorder();
  userpilot.didHandleUrl(URL, host.onSuccess, host.onFail);
  completeSetup(userpilot);

  // The retry's own held link is forwarded; the one refused before it is not
  // resurrected.
  userpilot.didHandleUrl(URL, host.onSuccess, host.onFail);
  assert.equal(urlCalls().length, 1);
  assert.deepEqual(urlCalls()[0].args, [URL]);
});

test("a setup that fails after a successful one keeps forwarding URLs", () => {
  const userpilot = freshUserpilot();
  completeSetup(userpilot);
  failSetup(userpilot);

  const host = recorder();
  userpilot.didHandleUrl(URL, host.onSuccess, host.onFail);

  assert.equal(urlCalls().length, 1);
  assert.deepEqual(host.answers, []);
});

test("the queue is bounded without discarding accepted URLs", () => {
  const userpilot = freshUserpilot();
  const accepted = recorder();
  for (let i = 0; i < 10; i++) {
    userpilot.didHandleUrl(`myapp://${i}`, accepted.onSuccess, accepted.onFail);
  }

  const refused = recorder();
  userpilot.didHandleUrl(URL, refused.onSuccess, refused.onFail);

  // The newest link is refused rather than evicting the launch link.
  assert.deepEqual(refused.answers, [false]);

  completeSetup(userpilot);

  assert.equal(urlCalls().length, 10);
  assert.deepEqual(accepted.answers, []);
});

test("a link that cannot reach native leaves the rest of the batch answered", () => {
  const userpilot = freshUserpilot();
  const first = recorder();
  const second = recorder();
  userpilot.didHandleUrl(URL, first.onSuccess, first.onFail);
  userpilot.didHandleUrl("myapp://profile", second.onSuccess, second.onFail);

  const errors = [];
  const reportError = console.error;
  console.error = (message) => errors.push(message);
  const send = exec.calls.push;
  let sent = 0;
  // Fails the first bridge call of the flush, the way a bridge that refuses
  // the payload would.
  exec.calls.push = function (call) {
    if (call.action === "didHandleUrl" && sent++ === 0) {
      throw new Error("bridge unavailable");
    }
    return send.apply(this, arguments);
  };

  try {
    completeSetup(userpilot);
  } finally {
    exec.calls.push = send;
    console.error = reportError;
  }

  // The failed link is answered so the host routes it, and the one behind it
  // still crosses the bridge.
  assert.deepEqual(first.answers, [false]);
  assert.equal(urlCalls().length, 1);
  assert.deepEqual(urlCalls()[0].args, ["myapp://profile"]);
  assert.equal(errors.length, 1);
});

test("a held URL is answered as unhandled when setup never completes", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const userpilot = freshUserpilot();
  const host = recorder();

  userpilot.didHandleUrl(URL, host.onSuccess, host.onFail);
  t.mock.timers.tick(10000);

  assert.deepEqual(host.answers, [false]);
  assert.equal(urlCalls().length, 0);

  // The released link freed its slot and is not replayed by a later setup.
  completeSetup(userpilot);
  assert.equal(urlCalls().length, 0);
});

test("a forwarded URL is not answered twice by its timeout", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const userpilot = freshUserpilot();
  const host = recorder();

  userpilot.didHandleUrl(URL, host.onSuccess, host.onFail);
  completeSetup(userpilot);
  t.mock.timers.tick(10000);

  // Native owns the answer now; a still-armed timer would have the host route
  // a link the SDK is already handling.
  assert.deepEqual(host.answers, []);
  assert.equal(urlCalls().length, 1);
});
