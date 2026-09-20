require("./helpers/cordova-modules");

const test = require("node:test");
const assert = require("node:assert/strict");

const { AutoCaptureEngine } = require("@userpilot/cordova.AutoCaptureEngine");
const userpilot = require("../www/userpilot.js");
const { FakeElement, buildChain } = require("./helpers/fake-dom");

/**
 * Replaces an engine method with a recorder for the duration of `body`, so the
 * public API can be checked for what it forwards without standing up a DOM.
 */
function recordEngineCalls(method, body) {
  const original = AutoCaptureEngine.prototype[method];
  const calls = [];
  AutoCaptureEngine.prototype[method] = function (...args) {
    calls.push(args);
  };
  try {
    body(calls);
  } finally {
    AutoCaptureEngine.prototype[method] = original;
  }
}

test("userpilotIgnoreInteractions forwards the boolean to the engine", () => {
  recordEngineCalls("ignoreInteractions", (calls) => {
    userpilot.userpilotIgnoreInteractions("#admin", true);
    userpilot.userpilotIgnoreInteractions("#admin .safe", false);

    assert.deepEqual(calls, [
      ["#admin", true],
      ["#admin .safe", false]
    ]);
  });
});

test("userpilotRedactText forwards the boolean to the engine", () => {
  recordEngineCalls("redactText", (calls) => {
    userpilot.userpilotRedactText("#profile-form", true);
    userpilot.userpilotRedactText("#profile-form .public", false);

    assert.deepEqual(calls, [
      ["#profile-form", true],
      ["#profile-form .public", false]
    ]);
  });
});

test("the one-argument call form still reaches the engine", () => {
  recordEngineCalls("ignoreInteractions", (calls) => {
    userpilot.userpilotIgnoreInteractions("#admin");
    assert.deepEqual(calls, [["#admin", undefined]]);
  });
});

test("the engine applies nearest-wins ignore markers end to end", () => {
  const engine = new AutoCaptureEngine();
  const panel = new FakeElement("div");
  const outerButton = panel.appendChild(new FakeElement("button"));
  const safeRow = panel.appendChild(new FakeElement("div"));
  const safeButton = safeRow.appendChild(new FakeElement("button"));

  engine.ignoreInteractions(panel, true);
  engine.ignoreInteractions(safeRow, false);

  assert.equal(engine.governance.isIgnored(outerButton), true);
  assert.equal(engine.governance.isIgnored(safeButton), false);
});

test("the engine applies nearest-wins redact markers end to end", () => {
  const engine = new AutoCaptureEngine();
  const [form, row, field] = buildChain(
    { tag: "form" },
    { tag: "div" },
    { tag: "input" }
  );

  engine.redactText(form, true);
  assert.equal(engine.governance.shouldRedact(field), true);

  engine.redactText(row, false);
  assert.equal(engine.governance.shouldRedact(field), false);
});

test("an omitted boolean still means opt-in at the engine level", () => {
  const engine = new AutoCaptureEngine();
  const [panel, button] = buildChain({ tag: "div" }, { tag: "button" });

  engine.ignoreInteractions(panel);
  engine.redactText(panel);

  assert.equal(engine.governance.isIgnored(button), true);
  assert.equal(engine.governance.shouldRedact(button), true);
});
