cordova.define("@userpilot/cordova.AutoCaptureElementInspector", function(require, exports, module) {
var constants = require("@userpilot/cordova.AutoCaptureConstants");
var types = require("@userpilot/cordova.AutoCaptureInteractionType");
var redactorModule = require("@userpilot/cordova.AutoCaptureRedactor");

var AutoCaptureConstants = constants.AutoCaptureConstants;
var InteractionType = types.InteractionType;
var Redactor = redactorModule.Redactor;

var VIEW_TAG_ATTRIBUTES = ["data-testid", "data-test", "data-cy", "name"];

var ELEMENT_NODE = 1;
var TEXT_NODE = 3;

/**
 * Curated set of element properties captured on interaction events, mapping the
 * DOM attribute to the output key. Sensitive/PII attributes (`value`,
 * `placeholder`), structural noise (`style`), and `aria-*`/`data-*` are
 * intentionally excluded; `checked` is reported separately as `is_checked`.
 */
var CAPTURED_PROPERTIES = [
  ["class", "class_name"],
  ["type", "type"],
  ["name", "name"],
  ["disabled", "disabled"],
  ["href", "href"],
  ["target", "target"],
  ["tabindex", AutoCaptureConstants.PROPERTY_TAB_INDEX],
  ["role", "role"]
];

/** Creates an interaction event with sensible defaults. */
function createInteractionEvent(partial) {
  var event = {
    interactionType: InteractionType.TAP,
    targetClass: "",
    targetViewClass: "",
    targetText: null,
    accessibilityLabel: null,
    resourceId: null,
    viewTag: null,
    hierarchy: null,
    sourceProperties: {}
  };
  if (partial) {
    for (var key in partial) {
      if (Object.prototype.hasOwnProperty.call(partial, key)) {
        event[key] = partial[key];
      }
    }
  }
  return event;
}

/**
 * Extracts element-identity properties and builds the semicolon-separated
 * ancestry hierarchy used by auto-capture events.
 */
function DomElementInspector(config, governance) {
  this.config = config;
  this.governance = governance;
}

/**
 * Builds an interaction event pre-populated with the target element's identity
 * and a hierarchy path from the target up to (but not including) the screen
 * name, which the coordinator appends.
 */
DomElementInspector.prototype.buildInteractionEvent = function (target) {
  var event = createInteractionEvent();
  var segments = [];

  var current = target;
  var depth = 0;
  var maxDepth = this.config.maxHierarchyDepth;

  while (current && depth < maxDepth && !this.isHierarchyRoot(current)) {
    if (depth === 0) {
      var tagName = this.getTagName(current);
      event.targetClass = tagName;
      event.targetViewClass = tagName;
      event.targetText = this.getNodeText(current);
      event.accessibilityLabel = this.getAccessibilityLabel(current);
      event.resourceId = this.getResourceId(current);
      event.viewTag = this.getViewTag(current);
      var attrs = this.collectComponentAttributes(current);
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) {
          event.sourceProperties[k] = attrs[k];
        }
      }
    }
    segments.push(this.buildHierarchySegment(current));
    current = current.parentElement;
    depth++;
  }

  event.hierarchy = segments.join(";");
  return event;
};

DomElementInspector.prototype.getTagName = function (element) {
  return element.tagName ? element.tagName.toLowerCase() : "";
};

/**
 * Collects a curated set of useful element properties. Boolean attributes
 * (e.g. `disabled`) are reported as `'true'`. A negative or non-integer
 * `tabindex` (e.g. the `-1` used purely to make an element focusable) carries no
 * analytics meaning and is dropped.
 */
DomElementInspector.prototype.collectComponentAttributes = function (element) {
  var result = {};
  if (!element.attributes || !element.getAttribute) {
    return result;
  }
  for (var i = 0; i < CAPTURED_PROPERTIES.length; i++) {
    var attr = CAPTURED_PROPERTIES[i][0];
    var key = CAPTURED_PROPERTIES[i][1];
    if (!element.hasAttribute(attr)) {
      continue;
    }
    var raw = element.getAttribute(attr) || "";
    var value = attr === "tabindex" ? this.nonNegativeInteger(raw) : raw;
    if (value === null) {
      continue;
    }
    var normalized =
      value === ""
        ? "true"
        : Redactor.normalizeText(value, this.config.maxTextLength);
    if (!normalized) {
      continue;
    }
    result[key] = normalized;
  }
  return result;
};

// Returns [value] when it is a non-negative integer, otherwise null.
DomElementInspector.prototype.nonNegativeInteger = function (value) {
  if (!value.replace(/^\s+|\s+$/g, "")) {
    return null;
  }
  var parsed = Number(value);
  if (!isFinite(parsed) || Math.floor(parsed) !== parsed || parsed < 0) {
    return null;
  }
  return String(parsed);
};

/**
 * Visible text for the element, redacted/masked per governance & config. When
 * text capture is disabled the property is omitted entirely rather than masked.
 */
DomElementInspector.prototype.getNodeText = function (element) {
  if (!this.config.enableInteractionTextCapture) {
    return null;
  }

  // For text fields the typed value is never read; the field's label stands in
  // for its text, mirroring the native SDKs (Android captures the layout label,
  // never the EditText contents).
  var raw = Redactor.isTextInput(element)
    ? this.getFieldLabel(element)
    : element.textContent;

  var text = Redactor.normalizeText(raw, this.config.maxTextLength);
  if (!text) {
    return null;
  }
  if (this.governance.shouldRedact(element)) {
    return Redactor.redacted();
  }
  return text;
};

/**
 * Resolves the developer-authored label of a text field, most specific first:
 * 1. `aria-labelledby` targets.
 * 2. An associated `<label for>` or wrapping `<label>`.
 * 3. A `label` attribute/property (custom elements that declare one).
 *
 * The placeholder is deliberately not a fallback — it is a hint, reported
 * separately as the `placeholder` property.
 */
DomElementInspector.prototype.getFieldLabel = function (element) {
  var label = this.readLabelledBy(element);
  if (label) {
    return label;
  }
  label = this.readAssociatedLabel(element);
  if (label) {
    return label;
  }
  return this.readStringProp(element, "label");
};

/**
 * Accessibility label, when accessibility-label capture is enabled. Redaction
 * does not apply: `userpilotRedactText` / `data-userpilot-redact` mask
 * `target_text` only, and accessibility labels are developer-authored, so they
 * are governed solely by `enableInteractionAccessibilityLabelCapture`.
 */
DomElementInspector.prototype.getAccessibilityLabel = function (element) {
  if (!this.config.enableInteractionAccessibilityLabelCapture) {
    return null;
  }
  return Redactor.normalizeText(
    this.readAriaText(element),
    this.config.maxTextLength
  );
};

DomElementInspector.prototype.readAriaText = function (element) {
  if (!element.getAttribute) {
    return null;
  }
  var fromHost =
    element.getAttribute("aria-label") || element.getAttribute("title");
  if (fromHost && fromHost.replace(/^\s+|\s+$/g, "")) {
    return fromHost;
  }
  return null;
};

DomElementInspector.prototype.getResourceId = function (element) {
  if (!element.getAttribute) {
    return null;
  }
  var id = element.getAttribute("id");
  if (!id || !id.replace(/^\s+|\s+$/g, "")) {
    return null;
  }
  return id.replace(/^\s+|\s+$/g, "");
};

DomElementInspector.prototype.getViewTag = function (element) {
  if (!element.getAttribute) {
    return null;
  }
  for (var i = 0; i < VIEW_TAG_ATTRIBUTES.length; i++) {
    var value = element.getAttribute(VIEW_TAG_ATTRIBUTES[i]);
    if (value && value.replace(/^\s+|\s+$/g, "")) {
      return value.replace(/^\s+|\s+$/g, "");
    }
  }
  return null;
};

// region private

/**
 * Reads a component property, preferring the DOM property (how frameworks set
 * custom-element props) over the attribute (how plain HTML declares them).
 */
DomElementInspector.prototype.readStringProp = function (element, name) {
  var value = element[name];
  if (typeof value === "string" && value.replace(/^\s+|\s+$/g, "")) {
    return value;
  }
  var attr = element.getAttribute ? element.getAttribute(name) : null;
  return attr && attr.replace(/^\s+|\s+$/g, "") ? attr : null;
};

// Text of the elements referenced by `aria-labelledby`.
DomElementInspector.prototype.readLabelledBy = function (element) {
  if (!element.getAttribute || typeof document === "undefined") {
    return null;
  }
  var ids = element.getAttribute("aria-labelledby");
  if (!ids) {
    return null;
  }
  var parts = ids.split(/\s+/);
  var text = "";
  for (var i = 0; i < parts.length; i++) {
    if (!parts[i]) {
      continue;
    }
    var node = document.getElementById(parts[i]);
    if (node) {
      text += (text ? " " : "") + this.textExcluding(node, element);
    }
  }
  text = text.replace(/^\s+|\s+$/g, "");
  return text || null;
};

// Text of the `<label>` associated with the field, or the one wrapping it.
DomElementInspector.prototype.readAssociatedLabel = function (element) {
  var candidates = [];
  var labels = element.labels;
  if (labels) {
    for (var i = 0; i < labels.length; i++) {
      candidates.push(labels[i]);
    }
  }

  var id = this.getResourceId(element);
  if (id && typeof document !== "undefined") {
    try {
      var byFor = document.querySelector('label[for="' + this.escape(id) + '"]');
      if (byFor) {
        candidates.push(byFor);
      }
    } catch (e) {
      // Ids that aren't valid selector content are skipped.
    }
  }

  if (element.closest) {
    try {
      var wrapping = element.closest("label");
      if (wrapping) {
        candidates.push(wrapping);
      }
    } catch (e) {
      // Ignore environments without a usable `closest`.
    }
  }

  for (var j = 0; j < candidates.length; j++) {
    var text = this.textExcluding(candidates[j], element).replace(
      /^\s+|\s+$/g,
      ""
    );
    if (text) {
      return text;
    }
  }
  return null;
};

/**
 * `textContent` of [root] with [exclude]'s subtree removed, so a label that
 * wraps or contains the field can never contribute the typed value (which
 * `textContent` would expose for `contenteditable` fields).
 */
DomElementInspector.prototype.textExcluding = function (root, exclude) {
  if (root === exclude) {
    return "";
  }
  if (!root.contains || !root.contains(exclude)) {
    return root.textContent || "";
  }
  var text = "";
  var children = root.childNodes;
  for (var i = 0; i < children.length; i++) {
    var node = children[i];
    if (node === exclude) {
      continue;
    }
    if (node.nodeType === TEXT_NODE) {
      text += node.textContent || "";
    } else if (node.nodeType === ELEMENT_NODE) {
      text += this.textExcluding(node, exclude);
    }
  }
  return text;
};

DomElementInspector.prototype.getIndexInParent = function (element) {
  var parent = element.parentElement;
  if (!parent) {
    return 0;
  }
  return Array.prototype.indexOf.call(parent.children, element);
};

DomElementInspector.prototype.isHierarchyRoot = function (element) {
  var tag = this.getTagName(element);
  return tag === "body" || tag === "html";
};

/**
 * Builds a single hierarchy segment, matching the other Userpilot SDKs:
 * `Tag:attr__id="…",attr__index="N",attr__desc="…"` — comma-separated, in that
 * order, with `id`/`desc` omitted when blank or redacted. Element classes are
 * not part of the hierarchy; they are reported on the event as `class_name`.
 */
DomElementInspector.prototype.buildHierarchySegment = function (element) {
  var tag = this.getTagName(element);
  var attributes = [];

  var id = this.getResourceId(element);
  if (id && !this.isRedactedValue(id)) {
    attributes.push(
      AutoCaptureConstants.HIERARCHY_ID_PREFIX + '"' + this.escape(id) + '"'
    );
  }

  attributes.push(
    AutoCaptureConstants.HIERARCHY_INDEX_PREFIX +
      '"' +
      this.getIndexInParent(element) +
      '"'
  );

  var desc = this.getDescription(element);
  if (desc) {
    attributes.push(
      AutoCaptureConstants.HIERARCHY_DESC_PREFIX + '"' + this.escape(desc) + '"'
    );
  }

  return tag + ":" + attributes.join(",");
};

/**
 * Accessibility label used for `attr__desc` (the native `contentDescription`
 * analogue). Gated by the same flag as `accessibility_label`, since it is the
 * same developer-authored value.
 */
DomElementInspector.prototype.getDescription = function (element) {
  if (!this.config.enableInteractionAccessibilityLabelCapture) {
    return null;
  }
  var raw = this.readAriaText(element);
  if (!raw) {
    return null;
  }
  var trimmed = raw.replace(/^\s+|\s+$/g, "");
  if (!trimmed || this.isRedactedValue(trimmed)) {
    return null;
  }
  return trimmed;
};

DomElementInspector.prototype.isRedactedValue = function (value) {
  return value === AutoCaptureConstants.TEXT_REDACTED_PLACEHOLDER;
};

DomElementInspector.prototype.escape = function (value) {
  return value.replace(/"/g, '\\"');
};

// endregion

module.exports = {
  DomElementInspector: DomElementInspector,
  createInteractionEvent: createInteractionEvent
};

});
