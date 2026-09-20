require("./helpers/cordova-modules");

const test = require("node:test");
const assert = require("node:assert/strict");

const exec = require("./helpers/cordova-exec-stub");

const USERPILOT_PATH = require.resolve("../www/userpilot.js");

// The pre-setup notice goes through console.warn (the engine's logger is silent
// until setup enables it). Captured so the suite's output stays readable and so
// the message can be asserted.
const warnings = [];
console.warn = function (message) {
  warnings.push(message);
};

/**
 * A `userpilot` with no setup behind it.
 *
 * `__loaded` and the cached screen live at module scope, so a test that
 * completes setup would leave every later test permanently initialized and the
 * pre-setup path unreachable. Re-requiring gives each test its own state.
 */
function freshUserpilot() {
  delete require.cache[USERPILOT_PATH];
  exec.reset();
  warnings.length = 0;
  return require("../www/userpilot.js");
}

function noop() {}

// Runs `setup` and completes the native round trip the way the WebView would,
// by invoking the callback the exec stub recorded. `options` carries the
// auto-capture flags that decide who owns screen tracking.
function completeSetup(userpilot, options) {
  userpilot.setup("token", options || {}, noop, noop);
  lastCall().onSuccess();
}

function failSetup(userpilot) {
  userpilot.setup("token", {}, noop, noop);
  lastCall().onFail("setup rejected");
}

function lastCall() {
  return exec.calls[exec.calls.length - 1];
}

function screenCalls() {
  return exec.calls.filter((call) => call.action === "screen");
}

test("a screen tracked before setup is reported once setup succeeds", () => {
  const userpilot = freshUserpilot();

  userpilot.screen("Profile", noop, noop);
  assert.equal(exec.calls.length, 0);

  completeSetup(userpilot, {});

  assert.equal(screenCalls().length, 1);
  assert.equal(screenCalls()[0].service, "UserpilotCordovaPlugin");
  assert.deepEqual(screenCalls()[0].args, ["Profile"]);
});

test("a screen tracked before setup calls back as accepted", () => {
  const userpilot = freshUserpilot();
  let succeeded = 0;
  let failed = 0;

  userpilot.screen(
    "Profile",
    () => {
      succeeded += 1;
    },
    () => {
      failed += 1;
    }
  );

  assert.equal(succeeded, 1);
  assert.equal(failed, 0);
});

test("the cached screen is announced by name", () => {
  const userpilot = freshUserpilot();

  userpilot.screen("Profile", noop, noop);

  assert.deepEqual(warnings, [
    'Userpilot is not initialized yet: screen "Profile" is cached and will be reported once setup completes'
  ]);
});

test("only the latest screen tracked before setup is reported", () => {
  const userpilot = freshUserpilot();

  userpilot.screen("Home", noop, noop);
  userpilot.screen("Settings", noop, noop);
  userpilot.screen("Profile", noop, noop);

  completeSetup(userpilot, {});

  assert.equal(screenCalls().length, 1);
  assert.deepEqual(screenCalls()[0].args, ["Profile"]);
});

test("a screen tracked before setup is dropped when screen auto-capture is on", () => {
  const userpilot = freshUserpilot();

  userpilot.screen("Profile", noop, noop);
  completeSetup(userpilot, { enableScreenAutoCapture: true });

  assert.equal(screenCalls().length, 0);
});

test("a screen tracked before a failed setup is discarded", () => {
  const userpilot = freshUserpilot();

  userpilot.screen("Profile", noop, noop);
  failSetup(userpilot);
  assert.equal(screenCalls().length, 0);

  completeSetup(userpilot, {});

  assert.equal(screenCalls().length, 0);
});

test("a failed setup still reaches the host's onFail", () => {
  const userpilot = freshUserpilot();
  const reasons = [];

  userpilot.setup("token", {}, noop, (reason) => {
    reasons.push(reason);
  });
  lastCall().onFail("setup rejected");

  assert.deepEqual(reasons, ["setup rejected"]);
});

test("the cached screen is reported once even when setup succeeds twice", () => {
  const userpilot = freshUserpilot();

  userpilot.screen("Profile", noop, noop);
  userpilot.setup("token", {}, noop, noop);
  const setupCall = lastCall();
  setupCall.onSuccess();
  setupCall.onSuccess();

  assert.equal(screenCalls().length, 1);
  assert.deepEqual(screenCalls()[0].args, ["Profile"]);
});

test("an invalid screen name calls onFail and caches nothing", () => {
  const userpilot = freshUserpilot();
  const failures = [];
  const record = (error) => failures.push(error);

  userpilot.screen("", noop, record);
  userpilot.screen(undefined, noop, record);
  userpilot.screen(42, noop, record);

  assert.equal(failures.length, 3);
  assert.equal(exec.calls.length, 0);
  assert.deepEqual(warnings, []);

  completeSetup(userpilot, {});

  assert.equal(screenCalls().length, 0);
});

test("a held screen is still reported when auto-capture fails to boot", () => {
  const { AutoCaptureEngine } = require("@userpilot/cordova.AutoCaptureEngine");
  const bootEngine = AutoCaptureEngine.prototype.handleInitialize;
  AutoCaptureEngine.prototype.handleInitialize = function () {
    throw new Error("engine unavailable");
  };
  const errors = [];
  const reportError = console.error;
  console.error = (message) => errors.push(message);

  try {
    const userpilot = freshUserpilot();
    userpilot.screen("Profile", noop, noop);

    // Native setup succeeded, so the held screen has somewhere to go: a broken
    // engine must not swallow it, or the host's setup callback.
    let completed = 0;
    userpilot.setup("token", {}, () => (completed += 1), noop);
    lastCall().onSuccess();

    assert.equal(screenCalls().length, 1);
    assert.deepEqual(screenCalls()[0].args, ["Profile"]);
    assert.equal(completed, 1);
    assert.equal(errors.length, 1);
  } finally {
    AutoCaptureEngine.prototype.handleInitialize = bootEngine;
    console.error = reportError;
  }
});

test("a screen tracked after setup goes straight over the bridge", () => {
  const userpilot = freshUserpilot();
  completeSetup(userpilot, {});
  const onSuccess = () => {};
  const onFail = () => {};

  userpilot.screen("Profile", onSuccess, onFail);

  assert.equal(screenCalls().length, 1);
  assert.equal(screenCalls()[0].action, "screen");
  assert.deepEqual(screenCalls()[0].args, ["Profile"]);
  assert.equal(screenCalls()[0].onSuccess, onSuccess);
  assert.equal(screenCalls()[0].onFail, onFail);
  assert.deepEqual(warnings, []);
});
