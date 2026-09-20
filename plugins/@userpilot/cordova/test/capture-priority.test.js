require("./helpers/cordova-modules");

const test = require("node:test");
const assert = require("node:assert/strict");

const { ElementGovernance } = require("@userpilot/cordova.AutoCaptureGovernance");
const { DomElementInspector } = require("@userpilot/cordova.AutoCaptureElementInspector");
const { DomInteractionObserver } = require("@userpilot/cordova.AutoCaptureInteractionObserver");
const { EventSuppressor } = require("@userpilot/cordova.AutoCaptureEventSuppressor");
const { REDACTED_PLACEHOLDER } = require("@userpilot/cordova.AutoCaptureRedactor");
const { DEFAULT_AUTO_CAPTURE_CONFIG } = require("@userpilot/cordova.AutoCaptureConfig");
const { InteractionType } = require("@userpilot/cordova.AutoCaptureInteractionType");
const { AutoCaptureConstants } = require("@userpilot/cordova.AutoCaptureConstants");
const { FakeElement, buildChain } = require("./helpers/fake-dom");

/**
 * Builds a governance + observer pair wired to a recording coordinator, so a
 * test can drive the real capture path without a DOM or a native bridge.
 */
function harness(configOverrides = {}) {
  const config = { ...DEFAULT_AUTO_CAPTURE_CONFIG, ...configOverrides };
  const governance = new ElementGovernance();
  const events = [];
  const coordinator = {
    handleInteractionEvent(event) {
      events.push(event);
    }
  };
  const observer = new DomInteractionObserver(
    config,
    governance,
    new DomElementInspector(config, governance),
    coordinator,
    new EventSuppressor()
  );
  return { governance, observer, events };
}

// region ignore outranks redact

test("ignore=true drops the event entirely, so redaction never applies", () => {
  const { governance, observer } = harness();
  const [panel, button] = buildChain(
    { tag: "div" },
    { tag: "button", text: "Delete account" }
  );

  governance.markIgnore(panel, true);
  governance.markRedact(panel, false);

  assert.equal(
    observer.prepareEvent({ target: button, type: InteractionType.TAP }),
    null,
    "no event is built at all — there is nothing left to redact"
  );
});

test("ignore=true wins even when the element is explicitly un-redacted", () => {
  const { governance, observer } = harness();
  const button = new FakeElement("button", {}, "Delete account");

  governance.markIgnore(button, true);
  governance.markRedact(button, false);

  assert.equal(
    observer.prepareEvent({ target: button, type: InteractionType.TAP }),
    null
  );
});

test("a nested ignore=false re-enables the event and redaction then applies", () => {
  const { governance, observer } = harness();
  const panel = new FakeElement("div");
  const row = panel.appendChild(new FakeElement("div"));
  const button = row.appendChild(new FakeElement("button", {}, "Delete account"));

  governance.markIgnore(panel, true);
  governance.markIgnore(row, false);
  governance.markRedact(panel, true);

  const event = observer.prepareEvent({
    target: button,
    type: InteractionType.TAP
  });

  assert.notEqual(event, null, "the event fires again");
  assert.equal(
    event.targetText,
    REDACTED_PLACEHOLDER,
    "ignore and redact resolve independently"
  );
});

test("view_presented is dropped when the surface is ignored", () => {
  const { governance, observer, events } = harness();
  const dialog = new FakeElement("dialog", { "aria-label": "Confirm payment" });

  governance.markIgnore(dialog, true);
  observer.emitViewPresented(dialog, "dialog");

  assert.equal(events.length, 0);
});

// endregion

// region global config outranks per-element redaction

test("global text capture off omits target_text regardless of redact=false", () => {
  const { governance, observer } = harness({
    enableInteractionTextCapture: false
  });
  const button = new FakeElement("button", {}, "Delete account");

  governance.markRedact(button, false);

  const event = observer.prepareEvent({
    target: button,
    type: InteractionType.TAP
  });

  assert.equal(event.targetText, null);
});

test("global text capture off omits dialog_title, not just target_text", () => {
  const { observer, events } = harness({ enableInteractionTextCapture: false });
  const dialog = new FakeElement("dialog", { "aria-label": "Confirm payment" });

  observer.emitViewPresented(dialog, "dialog");

  assert.equal(events.length, 1);
  assert.equal(events[0].targetText, null);
  assert.equal(
    events[0].sourceProperties[AutoCaptureConstants.PROPERTY_DIALOG_TITLE],
    undefined,
    "the title must not leak through the dialog_title property"
  );
});

test("redacting a dialog masks dialog_title alongside target_text", () => {
  const { governance, observer, events } = harness();
  const dialog = new FakeElement("dialog", { "aria-label": "Confirm payment" });

  governance.markRedact(dialog, true);
  observer.emitViewPresented(dialog, "dialog");

  assert.equal(events.length, 1);
  assert.equal(events[0].targetText, REDACTED_PLACEHOLDER);
  assert.equal(
    events[0].sourceProperties[AutoCaptureConstants.PROPERTY_DIALOG_TITLE],
    REDACTED_PLACEHOLDER
  );
});

test("an unredacted dialog still reports its real title", () => {
  const { observer, events } = harness();
  const dialog = new FakeElement("dialog", { "aria-label": "Confirm payment" });

  observer.emitViewPresented(dialog, "dialog");

  assert.equal(events[0].targetText, "Confirm payment");
  assert.equal(
    events[0].sourceProperties[AutoCaptureConstants.PROPERTY_DIALOG_TITLE],
    "Confirm payment"
  );
});

// endregion

// region text-field placeholder

function placeholderPropsFor(harnessInstance, field) {
  const event = { sourceProperties: {} };
  harnessInstance.observer.enrichSourceProperties(
    event,
    field,
    InteractionType.TEXT_FIELD_CHANGED
  );
  return event.sourceProperties;
}

function emailField() {
  const field = new FakeElement("input", { placeholder: "you@acme.com" });
  field.value = "abc";
  return field;
}

test("the placeholder is reported verbatim when nothing redacts it", () => {
  const instance = harness();
  const props = placeholderPropsFor(instance, emailField());

  assert.equal(
    props[AutoCaptureConstants.PROPERTY_PLACEHOLDER],
    "you@acme.com"
  );
});

test("redacting a field masks its placeholder", () => {
  const instance = harness();
  const field = emailField();

  instance.governance.markRedact(field, true);
  const props = placeholderPropsFor(instance, field);

  assert.equal(
    props[AutoCaptureConstants.PROPERTY_PLACEHOLDER],
    REDACTED_PLACEHOLDER
  );
});

test("global text capture off omits the placeholder", () => {
  const instance = harness({ enableInteractionTextCapture: false });
  const props = placeholderPropsFor(instance, emailField());

  assert.equal(props[AutoCaptureConstants.PROPERTY_PLACEHOLDER], undefined);
});

test("has_text and text_length survive redaction — they carry no content", () => {
  const instance = harness({ enableInteractionTextCapture: false });
  const field = emailField();

  instance.governance.markRedact(field, true);
  const props = placeholderPropsFor(instance, field);

  assert.equal(props[AutoCaptureConstants.PROPERTY_HAS_TEXT], true);
  assert.equal(props[AutoCaptureConstants.PROPERTY_TEXT_LENGTH], 3);
});

// endregion
