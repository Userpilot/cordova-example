var constants = require("@userpilot/cordova.AutoCaptureConstants");
var guarded = require("@userpilot/cordova.AutoCaptureGuardedRun");

var AutoCaptureAttributes = constants.AutoCaptureAttributes;
var guardedRun = guarded.guardedRun;

var hasWeakSet = typeof WeakSet !== "undefined";

/**
 * Tracks a set of elements. Uses a WeakSet when available (GC-friendly) and
 * falls back to an array otherwise.
 */
function ElementSet() {
  this.useWeak = hasWeakSet;
  this.store = hasWeakSet ? new WeakSet() : [];
}

ElementSet.prototype.add = function (element) {
  if (this.useWeak) {
    this.store.add(element);
  } else if (this.store.indexOf(element) === -1) {
    this.store.push(element);
  }
};

ElementSet.prototype.remove = function (element) {
  if (this.useWeak) {
    this.store.delete(element);
  } else {
    var index = this.store.indexOf(element);
    if (index > -1) {
      this.store.splice(index, 1);
    }
  }
};

ElementSet.prototype.has = function (element) {
  if (this.useWeak) {
    return this.store.has(element);
  }
  return this.store.indexOf(element) > -1;
};

/**
 * A tri-state per-element flag: `true`, `false`, or unset. Two element sets back
 * it so an explicit `false` stays distinguishable from "never marked" — that
 * distinction is what lets a nested call override an enclosing one.
 */
function ElementFlag() {
  this.enabled = new ElementSet();
  this.disabled = new ElementSet();
}

ElementFlag.prototype.set = function (element, value) {
  if (value) {
    this.disabled.remove(element);
    this.enabled.add(element);
  } else {
    this.enabled.remove(element);
    this.disabled.add(element);
  }
};

// `true`/`false` when explicitly marked on [element], `undefined` otherwise.
ElementFlag.prototype.valueFor = function (element) {
  if (this.enabled.has(element)) {
    return true;
  }
  if (this.disabled.has(element)) {
    return false;
  }
  return undefined;
};

/**
 * Resolves per-element privacy/capture governance for auto-capture.
 *
 * State comes from two sources, both resolved by walking the ancestor chain:
 * 1. Programmatic markers set via `userpilotRedactText()` /
 *    `userpilotIgnoreInteractions()`.
 * 2. Declarative `data-userpilot-redact` / `data-userpilot-ignore` attributes.
 *
 * Resolution is **nearest-wins**: the walk stops at the first ancestor (starting
 * with the element itself) that says anything, so a nested opt-out overrides an
 * enclosing opt-in and vice versa. Global config flags are applied by the
 * callers and always take priority — when `enableInteractionTextCapture` is off,
 * text is omitted regardless of what governance resolves here.
 */
function ElementGovernance() {
  this.ignore = new ElementFlag();
  this.redact = new ElementFlag();
  this.valueCapture = new ElementFlag();
}

// region programmatic markers

ElementGovernance.prototype.markRedact = function (target, redact) {
  this.setFlag(this.redact, target, redact);
};

ElementGovernance.prototype.markIgnore = function (target, ignore) {
  this.setFlag(this.ignore, target, ignore);
};

ElementGovernance.prototype.enableValueCapture = function (target) {
  this.setFlag(this.valueCapture, target, true);
};

ElementGovernance.prototype.disableValueCapture = function (target) {
  this.setFlag(this.valueCapture, target, false);
};

// endregion

// True when interactions in [element]'s subtree should be dropped.
ElementGovernance.prototype.isIgnored = function (element) {
  return (
    this.resolveFlag(element, this.ignore, AutoCaptureAttributes.IGNORE) === true
  );
};

// True when [element] resolves to text redaction.
ElementGovernance.prototype.shouldRedact = function (element) {
  return (
    this.resolveFlag(element, this.redact, AutoCaptureAttributes.REDACT) === true
  );
};

/**
 * Resolves a per-element value-capture override: `true`/`false` when an
 * ancestor explicitly enables/disables value capture, or `undefined` to fall
 * back to the global flag.
 */
ElementGovernance.prototype.valueCaptureOverride = function (element) {
  return this.resolveFlag(element, this.valueCapture, null);
};

// region helpers

/**
 * Applies [value] to every element [target] resolves to. `undefined` means
 * `true`, so the one-argument call form keeps its original opt-in meaning.
 */
ElementGovernance.prototype.setFlag = function (flag, target, value) {
  var enabled = value === undefined ? true : !!value;
  this.forEach(target, function (element) {
    flag.set(element, enabled);
  });
};

/**
 * Nearest-wins lookup: walks from [element] toward the document root and
 * returns the first explicit value it finds. On a single element a programmatic
 * marker beats the declarative attribute. Returns `undefined` when nothing on
 * the chain has an opinion.
 */
ElementGovernance.prototype.resolveFlag = function (element, flag, attribute) {
  var current = element;
  while (current) {
    var marked = flag.valueFor(current);
    if (typeof marked === "boolean") {
      return marked;
    }
    var declared = readBooleanAttribute(current, attribute);
    if (typeof declared === "boolean") {
      return declared;
    }
    current = current.parentElement;
  }
  return undefined;
};

ElementGovernance.prototype.forEach = function (target, fn) {
  var self = this;
  guardedRun(function () {
    self.resolveTargets(target).forEach(fn);
  });
};

ElementGovernance.prototype.resolveTargets = function (target) {
  if (typeof target === "string") {
    if (typeof document === "undefined") {
      return [];
    }
    return Array.prototype.slice.call(document.querySelectorAll(target));
  }
  return target ? [target] : [];
};

/**
 * Reads a declarative boolean attribute. The value is `"true"` or `"false"`;
 * a bare attribute (`data-userpilot-ignore`) means `true`. Returns `undefined`
 * when the attribute is absent so the caller keeps walking toward the root.
 */
function readBooleanAttribute(element, attribute) {
  if (!attribute || !element.hasAttribute || !element.hasAttribute(attribute)) {
    return undefined;
  }
  var raw = element.getAttribute ? element.getAttribute(attribute) : null;
  if (raw === null || raw === undefined) {
    return true;
  }
  return (
    String(raw)
      .replace(/^\s+|\s+$/g, "")
      .toLowerCase() !== "false"
  );
}

// endregion

module.exports = {
  ElementGovernance: ElementGovernance
};
