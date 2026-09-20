require("./helpers/cordova-modules");

const test = require("node:test");
const assert = require("node:assert/strict");

const { ElementGovernance } = require("@userpilot/cordova.AutoCaptureGovernance");
const { AutoCaptureAttributes } = require("@userpilot/cordova.AutoCaptureConstants");
const { FakeElement, buildChain, installDocument } = require("./helpers/fake-dom");

test("markIgnore defaults to true so the one-argument call still opts out", () => {
  const governance = new ElementGovernance();
  const [panel, button] = buildChain({ tag: "div" }, { tag: "button" });

  governance.markIgnore(panel);

  assert.equal(governance.isIgnored(button), true);
});

test("markRedact defaults to true so the one-argument call still redacts", () => {
  const governance = new ElementGovernance();
  const [form, input] = buildChain({ tag: "form" }, { tag: "input" });

  governance.markRedact(form);

  assert.equal(governance.shouldRedact(input), true);
});

test("an element with no marker anywhere on its chain is captured", () => {
  const governance = new ElementGovernance();
  const [, button] = buildChain({ tag: "div" }, { tag: "button" });

  assert.equal(governance.isIgnored(button), false);
  assert.equal(governance.shouldRedact(button), false);
});

test("the nearest ignore marker wins over an enclosing one", () => {
  const governance = new ElementGovernance();
  // panel(ignore: true) > button1
  //                     > inner(ignore: false) > button2
  const panel = new FakeElement("div");
  const button1 = panel.appendChild(new FakeElement("button"));
  const inner = panel.appendChild(new FakeElement("div"));
  const button2 = inner.appendChild(new FakeElement("button"));

  governance.markIgnore(panel, true);
  governance.markIgnore(inner, false);

  assert.equal(governance.isIgnored(button1), true, "button1 stays ignored");
  assert.equal(governance.isIgnored(button2), false, "button2 is captured again");
});

test("the nearest redact marker wins over an enclosing one", () => {
  const governance = new ElementGovernance();
  const form = new FakeElement("form");
  const secret = form.appendChild(new FakeElement("input"));
  const publicRow = form.appendChild(new FakeElement("div"));
  const publicField = publicRow.appendChild(new FakeElement("input"));

  governance.markRedact(form, true);
  governance.markRedact(publicRow, false);

  assert.equal(governance.shouldRedact(secret), true);
  assert.equal(governance.shouldRedact(publicField), false);
});

test("a marker on the element itself wins over its own ancestors", () => {
  const governance = new ElementGovernance();
  const [panel, button] = buildChain({ tag: "div" }, { tag: "button" });

  governance.markIgnore(panel, true);
  governance.markIgnore(button, false);

  assert.equal(governance.isIgnored(button), false);
});

test("re-marking an element flips its resolved value", () => {
  const governance = new ElementGovernance();
  const button = new FakeElement("button");

  governance.markIgnore(button, true);
  assert.equal(governance.isIgnored(button), true);

  governance.markIgnore(button, false);
  assert.equal(governance.isIgnored(button), false);

  governance.markIgnore(button, true);
  assert.equal(governance.isIgnored(button), true);
});

test("three levels resolve to the innermost marker", () => {
  const governance = new ElementGovernance();
  const [outer, middle, inner, button] = buildChain(
    { tag: "div" },
    { tag: "div" },
    { tag: "div" },
    { tag: "button" }
  );

  governance.markIgnore(outer, true);
  governance.markIgnore(middle, false);
  governance.markIgnore(inner, true);

  assert.equal(governance.isIgnored(button), true);
});

test("a bare data-userpilot-ignore attribute opts the subtree out", () => {
  const governance = new ElementGovernance();
  const [panel, button] = buildChain(
    { tag: "div", attributes: { [AutoCaptureAttributes.IGNORE]: "" } },
    { tag: "button" }
  );

  assert.equal(governance.isIgnored(button), true);
  assert.ok(panel);
});

test('data-userpilot-ignore="false" re-enables capture inside an ignored subtree', () => {
  const governance = new ElementGovernance();
  const [, , button] = buildChain(
    { tag: "div", attributes: { [AutoCaptureAttributes.IGNORE]: "" } },
    { tag: "div", attributes: { [AutoCaptureAttributes.IGNORE]: "false" } },
    { tag: "button" }
  );

  assert.equal(governance.isIgnored(button), false);
});

test('data-userpilot-redact="false" un-redacts inside a redacted subtree', () => {
  const governance = new ElementGovernance();
  const [, , field] = buildChain(
    { tag: "form", attributes: { [AutoCaptureAttributes.REDACT]: "" } },
    { tag: "div", attributes: { [AutoCaptureAttributes.REDACT]: "false" } },
    { tag: "input" }
  );

  assert.equal(governance.shouldRedact(field), false);
});

test('only "false" reads as an attribute opt-out', () => {
  const governance = new ElementGovernance();
  const cases = {
    false: false,
    FALSE: false,
    "  false  ": false,
    true: true,
    "": true,
    0: true,
    off: true,
    no: true
  };

  for (const [value, expected] of Object.entries(cases)) {
    const [, button] = buildChain(
      { tag: "div", attributes: { [AutoCaptureAttributes.IGNORE]: value } },
      { tag: "button" }
    );
    assert.equal(
      governance.isIgnored(button),
      expected,
      `attribute value ${JSON.stringify(value)}`
    );
  }
});

test("a programmatic marker beats the attribute on the same element", () => {
  const governance = new ElementGovernance();
  const [panel, button] = buildChain(
    { tag: "div", attributes: { [AutoCaptureAttributes.IGNORE]: "" } },
    { tag: "button" }
  );

  governance.markIgnore(panel, false);

  assert.equal(governance.isIgnored(button), false);
});

test("a nested attribute beats a programmatic marker further up the chain", () => {
  const governance = new ElementGovernance();
  const [panel, row, button] = buildChain(
    { tag: "div" },
    { tag: "div", attributes: { [AutoCaptureAttributes.IGNORE]: "false" } },
    { tag: "button" }
  );

  governance.markIgnore(panel, true);

  assert.equal(governance.isIgnored(button), false);
  assert.ok(row);
});

test("ignore and redact resolve independently", () => {
  const governance = new ElementGovernance();
  const [panel, button] = buildChain({ tag: "div" }, { tag: "button" });

  governance.markIgnore(panel, true);
  governance.markRedact(panel, false);

  assert.equal(governance.isIgnored(button), true);
  assert.equal(governance.shouldRedact(button), false);
});

test("value capture keeps returning undefined when nothing overrides it", () => {
  const governance = new ElementGovernance();
  const [outer, inner, button] = buildChain(
    { tag: "div" },
    { tag: "div" },
    { tag: "button" }
  );

  assert.equal(governance.valueCaptureOverride(button), undefined);

  governance.disableValueCapture(outer);
  assert.equal(governance.valueCaptureOverride(button), false);

  governance.enableValueCapture(inner);
  assert.equal(governance.valueCaptureOverride(button), true);
});

test("a selector target marks every matching element", () => {
  const governance = new ElementGovernance();
  const [firstPanel, firstButton] = buildChain({ tag: "div" }, { tag: "button" });
  const [secondPanel, secondButton] = buildChain({ tag: "div" }, { tag: "button" });
  const restore = installDocument({ ".panel": [firstPanel, secondPanel] });

  try {
    governance.markIgnore(".panel", true);
    assert.equal(governance.isIgnored(firstButton), true);
    assert.equal(governance.isIgnored(secondButton), true);

    governance.markIgnore(".panel", false);
    assert.equal(governance.isIgnored(firstButton), false);
    assert.equal(governance.isIgnored(secondButton), false);
  } finally {
    restore();
  }
});

test("a selector that matches nothing is a no-op", () => {
  const governance = new ElementGovernance();
  const button = new FakeElement("button");
  const restore = installDocument({});

  try {
    governance.markIgnore(".missing", true);
    assert.equal(governance.isIgnored(button), false);
  } finally {
    restore();
  }
});

test("null and undefined targets are ignored without throwing", () => {
  const governance = new ElementGovernance();

  assert.doesNotThrow(() => {
    governance.markIgnore(null, true);
    governance.markRedact(undefined, true);
  });
});
