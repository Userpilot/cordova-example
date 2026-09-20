cordova.define("@userpilot/cordova.AutoCaptureInteractionObserver", function(require, exports, module) {
var constants = require("@userpilot/cordova.AutoCaptureConstants");
var types = require("@userpilot/cordova.AutoCaptureInteractionType");
var classifierModule = require("@userpilot/cordova.AutoCaptureElementClassifier");
var inspectorModule = require("@userpilot/cordova.AutoCaptureElementInspector");
var eventTargetModule = require("@userpilot/cordova.AutoCaptureEventTarget");
var redactorModule = require("@userpilot/cordova.AutoCaptureRedactor");
var guarded = require("@userpilot/cordova.AutoCaptureGuardedRun");

var AutoCaptureConstants = constants.AutoCaptureConstants;
var InteractionType = types.InteractionType;
var ElementClassifier = classifierModule.ElementClassifier;
var createInteractionEvent = inspectorModule.createInteractionEvent;
var resolveEventTarget = eventTargetModule.resolveEventTarget;
var Redactor = redactorModule.Redactor;
var guardedRun = guarded.guardedRun;

var DIALOG_ROLE_SELECTOR = '[role="dialog"],[role="alertdialog"]';

/**
 * Attaches a small set of delegated capture-phase listeners on `document` to
 * auto-capture interactions, plus a MutationObserver for `view_presented`. This
 * scales to any DOM size: the listener count is constant regardless of how many
 * elements the page has.
 */
function DomInteractionObserver(
  config,
  governance,
  inspector,
  coordinator,
  suppressor
) {
  this.config = config;
  this.governance = governance;
  this.inspector = inspector;
  this.coordinator = coordinator;
  this.suppressor = suppressor;

  this.started = false;
  this.mutationObserver = undefined;
  // Debounced text input: `{ target, timer, event }` entries holding an event
  // snapshot built while the field still belonged to its original screen.
  this.pendingTextInputs = [];

  var self = this;
  this.onClick = function (event) {
    guardedRun(function () {
      var target = resolveEventTarget(event);
      if (!target) {
        return;
      }
      self.process(ElementClassifier.classifyClick(target));
    });
  };
  this.onChange = function (event) {
    guardedRun(function () {
      var target = resolveEventTarget(event);
      if (!target) {
        return;
      }
      self.process(ElementClassifier.classifyChange(target));
    });
  };
  this.onInput = function (event) {
    guardedRun(function () {
      var target = resolveEventTarget(event);
      if (!target) {
        return;
      }
      var classification = ElementClassifier.classifyTextInput(target);
      if (!classification) {
        return;
      }
      // Snapshot the latest event while the field still belongs to its current
      // screen, so navigation before the trailing debounce fires cannot change
      // the hierarchy or the privacy rules applied to it.
      self.debounceTextInput(classification);
    });
  };
  this.onSubmit = function (event) {
    guardedRun(function () {
      var target = resolveEventTarget(event);
      if (!target) {
        return;
      }
      self.process(ElementClassifier.classifySubmit(target));
    });
  };
}

DomInteractionObserver.prototype.start = function () {
  if (this.started || typeof document === "undefined") {
    return;
  }
  this.started = true;

  document.addEventListener("click", this.onClick, true);
  document.addEventListener("change", this.onChange, true);
  document.addEventListener("input", this.onInput, true);
  document.addEventListener("submit", this.onSubmit, true);

  this.observeDialogMutations();
};

DomInteractionObserver.prototype.stop = function () {
  if (!this.started || typeof document === "undefined") {
    return;
  }
  this.started = false;

  document.removeEventListener("click", this.onClick, true);
  document.removeEventListener("change", this.onChange, true);
  document.removeEventListener("input", this.onInput, true);
  document.removeEventListener("submit", this.onSubmit, true);

  this.discardPendingTextInputs();

  if (this.mutationObserver) {
    this.mutationObserver.disconnect();
    this.mutationObserver = undefined;
  }
};

/**
 * Immediately emits all debounced text changes using the event snapshots
 * captured while their original screen and DOM ancestry were still active.
 * Called before a screen transition publishes the next screen.
 */
DomInteractionObserver.prototype.flushPendingTextInputs = function () {
  var self = this;
  guardedRun(function () {
    var pending = self.pendingTextInputs;
    self.pendingTextInputs = [];
    for (var i = 0; i < pending.length; i++) {
      clearTimeout(pending[i].timer);
      self.emitPreparedEvent(pending[i].event);
    }
  });
};

// region processing

DomInteractionObserver.prototype.debounceTextInput = function (classification) {
  var self = this;
  var target = classification.target;

  // Drop any pending snapshot for this element (trailing edit wins).
  for (var i = 0; i < this.pendingTextInputs.length; i++) {
    if (this.pendingTextInputs[i].target === target) {
      clearTimeout(this.pendingTextInputs[i].timer);
      this.pendingTextInputs.splice(i, 1);
      break;
    }
  }

  var event = this.prepareEvent(classification);
  if (!event) {
    return;
  }

  var entry = { target: target, timer: null, event: event };
  entry.timer = setTimeout(function () {
    var index = self.pendingTextInputs.indexOf(entry);
    if (index > -1) {
      self.pendingTextInputs.splice(index, 1);
    }
    guardedRun(function () {
      self.emitPreparedEvent(entry.event);
    });
  }, this.config.textInputDebounceMs);
  this.pendingTextInputs.push(entry);
};

DomInteractionObserver.prototype.discardPendingTextInputs = function () {
  for (var i = 0; i < this.pendingTextInputs.length; i++) {
    clearTimeout(this.pendingTextInputs[i].timer);
  }
  this.pendingTextInputs = [];
};

DomInteractionObserver.prototype.process = function (classification) {
  var event = this.prepareEvent(classification);
  if (event) {
    this.emitPreparedEvent(event);
  }
};

/**
 * Builds a complete event snapshot with config/privacy rules already applied,
 * so it can be published later without re-reading the DOM.
 */
DomInteractionObserver.prototype.prepareEvent = function (classification) {
  if (!classification) {
    return null;
  }
  var target = classification.target;
  var type = classification.type;

  if (this.governance.isIgnored(target)) {
    return null;
  }

  var event = this.inspector.buildInteractionEvent(target);
  event.interactionType = type;
  this.enrichSourceProperties(event, target, type);
  return event;
};

DomInteractionObserver.prototype.emitPreparedEvent = function (event) {
  if (this.isDuplicate(event)) {
    return;
  }
  this.coordinator.handleInteractionEvent(event);
};

DomInteractionObserver.prototype.emitViewPresented = function (
  surfaceElement,
  surface
) {
  if (this.governance.isIgnored(surfaceElement)) {
    return;
  }
  var title = this.resolveDialogTitle(surfaceElement);
  var key = "view_presented|" + surface + "|" + (title || "");
  if (this.suppressor.shouldSuppress(key, this.config.dedupeWindowMs)) {
    return;
  }

  // `dialog_title` carries the same string as `target_text`, so it goes through
  // the same policy — otherwise disabling text capture (or redacting the dialog)
  // would strip `target_text` and ship the title verbatim right beside it.
  var capturedTitle = this.captureTargetText(title, surfaceElement);

  var event = createInteractionEvent({
    interactionType: InteractionType.VIEW_PRESENTED,
    targetClass: surface,
    targetViewClass: surface,
    targetText: capturedTitle,
    hierarchy:
      surface + ":" + AutoCaptureConstants.HIERARCHY_INDEX_PREFIX + '"0"'
  });
  event.sourceProperties[AutoCaptureConstants.PROPERTY_PRESENTATION_SURFACE] =
    surface;
  if (capturedTitle) {
    event.sourceProperties[AutoCaptureConstants.PROPERTY_DIALOG_TITLE] =
      capturedTitle;
  }
  this.coordinator.handleInteractionEvent(event);
};

/**
 * Applies the `target_text` rules to a directly-supplied string: omitted when
 * text capture is disabled, masked when the element is marked for redaction.
 */
DomInteractionObserver.prototype.captureTargetText = function (text, element) {
  if (!this.config.enableInteractionTextCapture || !text) {
    return null;
  }
  return this.governance.shouldRedact(element) ? Redactor.redacted() : text;
};

// Adds interaction-specific value/source properties, gated by value capture.
DomInteractionObserver.prototype.enrichSourceProperties = function (
  event,
  target,
  type
) {
  var props = event.sourceProperties;

  if (type === InteractionType.TEXT_FIELD_CHANGED) {
    var value = this.readValue(target);
    var length = typeof value === "string" ? value.length : 0;
    props[AutoCaptureConstants.PROPERTY_HAS_TEXT] = length > 0;
    props[AutoCaptureConstants.PROPERTY_TEXT_LENGTH] = length;
    // The placeholder is on-screen text, so it follows the text-capture policy:
    // omitted when text capture is off, masked when the field resolves to
    // redaction. Only `has_text`/`text_length` describe the typed value.
    var placeholder = this.captureTargetText(
      target.getAttribute ? target.getAttribute("placeholder") : null,
      target
    );
    if (placeholder) {
      props[AutoCaptureConstants.PROPERTY_PLACEHOLDER] = placeholder;
    }
    return;
  }

  var valueCapture = this.isValueCaptureEnabled(target);

  switch (type) {
    case InteractionType.CHECKBOX_SELECTED:
    case InteractionType.SWITCH_CHANGED:
    case InteractionType.TOGGLE_BUTTON_SELECTED:
      if (valueCapture) {
        props[AutoCaptureConstants.PROPERTY_IS_CHECKED] =
          this.readChecked(target);
      }
      break;

    case InteractionType.SLIDER_CHANGED: {
      if (valueCapture) {
        props[AutoCaptureConstants.PROPERTY_SELECTED_VALUE] =
          this.readValue(target);
      }
      var min = this.readNumberProp(target, "min");
      var max = this.readNumberProp(target, "max");
      if (min !== undefined) {
        props[AutoCaptureConstants.PROPERTY_MIN] = min;
      }
      if (max !== undefined) {
        props[AutoCaptureConstants.PROPERTY_MAX] = max;
      }
      break;
    }

    case InteractionType.TAB_SELECTED: {
      var tabIndex = this.readTabSelectionIndex(target);
      if (tabIndex !== undefined) {
        props[AutoCaptureConstants.PROPERTY_TAB_INDEX] = tabIndex;
      }
      break;
    }

    case InteractionType.SPINNER_SELECTED:
    case InteractionType.LIST_ITEM_SELECTED: {
      var index = this.readSelectedIndex(target);
      if (index !== undefined) {
        props[AutoCaptureConstants.PROPERTY_SELECTED_INDEX] = index;
      }
      if (valueCapture) {
        props[AutoCaptureConstants.PROPERTY_SELECTED_VALUE] =
          this.readValue(target);
      }
      break;
    }

    case InteractionType.DATE_PICKER_CHANGED:
      if (valueCapture) {
        props[AutoCaptureConstants.PROPERTY_SELECTED_DATE] =
          this.readValue(target);
      }
      break;

    case InteractionType.TIME_PICKER_CHANGED:
      if (valueCapture) {
        props[AutoCaptureConstants.PROPERTY_SELECTED_TIME] =
          this.readValue(target);
      }
      break;

    case InteractionType.RADIO_BUTTON_SELECTED:
      if (valueCapture) {
        props[AutoCaptureConstants.PROPERTY_SELECTED_VALUE] =
          this.readValue(target);
      }
      break;

    default:
      break;
  }
};

// endregion

// region helpers

DomInteractionObserver.prototype.isValueCaptureEnabled = function (target) {
  var override = this.governance.valueCaptureOverride(target);
  if (typeof override === "boolean") {
    return override;
  }
  return this.config.enableInteractionValueCapture;
};

DomInteractionObserver.prototype.isDuplicate = function (event) {
  var key = [
    event.interactionType,
    event.targetClass,
    event.resourceId || "",
    event.viewTag || "",
    event.hierarchy || ""
  ].join("|");
  return this.suppressor.shouldSuppress(key, this.config.dedupeWindowMs);
};

DomInteractionObserver.prototype.readValue = function (target) {
  var value = target.value;
  if (typeof value === "string" && value !== "") {
    return value;
  }
  if (value != null && typeof value !== "string") {
    return String(value);
  }
  if (target.isContentEditable) {
    return target.textContent || "";
  }
  // Fall back to a data-value attribute or the visible label for elements that
  // carry no form value (e.g. list-item buttons / custom option rows), so
  // selected_value reflects the chosen item (e.g. "Liam Murphy").
  var dataValue = target.getAttribute ? target.getAttribute("data-value") : null;
  if (dataValue && dataValue.replace(/^\s+|\s+$/g, "")) {
    return dataValue.replace(/^\s+|\s+$/g, "");
  }
  var text = (target.textContent || "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
  if (text) {
    return text.slice(0, this.config.maxTextLength);
  }
  return "";
};

DomInteractionObserver.prototype.readChecked = function (target) {
  return target.checked === true;
};

DomInteractionObserver.prototype.readNumberProp = function (target, prop) {
  var value = target[prop];
  if (typeof value === "number" && isFinite(value)) {
    return value;
  }
  var attr = target.getAttribute ? target.getAttribute(prop) : null;
  if (attr != null && attr.replace(/^\s+|\s+$/g, "") !== "") {
    var parsed = Number(attr);
    if (isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

DomInteractionObserver.prototype.readSelectedIndex = function (target) {
  var index = target.selectedIndex;
  return typeof index === "number" && index >= 0 ? index : undefined;
};

/**
 * Position of the selected tab among the tabs of its tablist. Returns undefined
 * when the real position cannot be determined, so no placeholder is ever sent.
 */
DomInteractionObserver.prototype.readTabSelectionIndex = function (target) {
  if (!target.getAttribute || target.getAttribute("role") !== "tab") {
    return undefined;
  }
  var container = null;
  if (target.closest) {
    try {
      container = target.closest('[role="tablist"]');
    } catch (e) {
      container = null;
    }
  }
  if (!container) {
    container = target.parentElement;
  }
  if (!container || !container.querySelectorAll) {
    return undefined;
  }
  var tabs = container.querySelectorAll('[role="tab"]');
  var index = Array.prototype.indexOf.call(tabs, target);
  return index >= 0 ? index : undefined;
};

DomInteractionObserver.prototype.resolveDialogTitle = function (element) {
  var titleEl = element.querySelector
    ? element.querySelector('[slot="title"], h1, h2')
    : null;
  var title =
    (titleEl && titleEl.textContent) ||
    (element.getAttribute ? element.getAttribute("aria-label") : null) ||
    null;
  if (!title) {
    return null;
  }
  var normalized = title.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
  return normalized ? normalized.slice(0, this.config.maxTextLength) : null;
};

DomInteractionObserver.prototype.observeDialogMutations = function () {
  if (typeof MutationObserver === "undefined" || !document.body) {
    return;
  }
  var self = this;
  this.mutationObserver = new MutationObserver(function (mutations) {
    guardedRun(function () {
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var node = added[j];
          if (!node || node.nodeType !== 1) {
            continue;
          }
          var dialog = null;
          if (node.matches && node.matches(DIALOG_ROLE_SELECTOR)) {
            dialog = node;
          } else if (node.querySelector) {
            dialog = node.querySelector(DIALOG_ROLE_SELECTOR);
          }
          if (dialog) {
            self.emitViewPresented(dialog, dialog.tagName.toLowerCase());
          }
        }
      }
    });
  });
  this.mutationObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
};

// endregion

module.exports = {
  DomInteractionObserver: DomInteractionObserver
};

});
