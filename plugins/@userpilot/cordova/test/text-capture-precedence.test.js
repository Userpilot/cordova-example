require("./helpers/cordova-modules");

const test = require("node:test");
const assert = require("node:assert/strict");

const { ElementGovernance } = require("@userpilot/cordova.AutoCaptureGovernance");
const { DomElementInspector } = require("@userpilot/cordova.AutoCaptureElementInspector");
const { REDACTED_PLACEHOLDER } = require("@userpilot/cordova.AutoCaptureRedactor");
const { DEFAULT_AUTO_CAPTURE_CONFIG } = require("@userpilot/cordova.AutoCaptureConfig");
const { AutoCaptureAttributes } = require("@userpilot/cordova.AutoCaptureConstants");
const { buildChain } = require("./helpers/fake-dom");

function inspectorFor(governance, overrides = {}) {
  const config = { ...DEFAULT_AUTO_CAPTURE_CONFIG, ...overrides };
  return new DomElementInspector(config, governance);
}

test("un-redacted text is captured verbatim", () => {
  const governance = new ElementGovernance();
  const [, button] = buildChain(
    { tag: "div" },
    { tag: "button", text: "Pay now" }
  );

  assert.equal(inspectorFor(governance).getNodeText(button), "Pay now");
});

test("an enclosing redact marker masks the text", () => {
  const governance = new ElementGovernance();
  const [form, button] = buildChain(
    { tag: "form" },
    { tag: "button", text: "Pay now" }
  );

  governance.markRedact(form, true);

  assert.equal(
    inspectorFor(governance).getNodeText(button),
    REDACTED_PLACEHOLDER
  );
});

test("a nested redact(false) restores the real text", () => {
  const governance = new ElementGovernance();
  const [form, row, button] = buildChain(
    { tag: "form" },
    { tag: "div" },
    { tag: "button", text: "Pay now" }
  );

  governance.markRedact(form, true);
  governance.markRedact(row, false);

  assert.equal(inspectorFor(governance).getNodeText(button), "Pay now");
});

test("global enableInteractionTextCapture:false outranks a nested redact(false)", () => {
  const governance = new ElementGovernance();
  const [form, row, button] = buildChain(
    { tag: "form" },
    { tag: "div" },
    { tag: "button", text: "Pay now" }
  );

  governance.markRedact(form, true);
  governance.markRedact(row, false);

  const inspector = inspectorFor(governance, {
    enableInteractionTextCapture: false
  });

  assert.equal(
    inspector.getNodeText(button),
    null,
    "text stays omitted when the global flag is off"
  );
});

test('a nested data-userpilot-redact="false" restores the real text', () => {
  const governance = new ElementGovernance();
  const [, , button] = buildChain(
    { tag: "form", attributes: { [AutoCaptureAttributes.REDACT]: "" } },
    { tag: "div", attributes: { [AutoCaptureAttributes.REDACT]: "false" } },
    { tag: "button", text: "Pay now" }
  );

  assert.equal(inspectorFor(governance).getNodeText(button), "Pay now");
});
