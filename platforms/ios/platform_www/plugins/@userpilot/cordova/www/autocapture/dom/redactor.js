cordova.define("@userpilot/cordova.AutoCaptureRedactor", function(require, exports, module) {
var constants = require("@userpilot/cordova.AutoCaptureConstants");

var AutoCaptureConstants = constants.AutoCaptureConstants;

var REDACTED_PLACEHOLDER = AutoCaptureConstants.TEXT_REDACTED_PLACEHOLDER;

var TEXT_INPUT_TYPES = {
  text: true,
  search: true,
  email: true,
  url: true,
  tel: true,
  password: true,
  number: true,
  date: true,
  time: true,
  "datetime-local": true,
  month: true,
  week: true
};

var TEXT_INPUT_TAGS = {
  input: true,
  textarea: true
};

function tagName(element) {
  return element.tagName ? element.tagName.toLowerCase() : "";
}

/**
 * True for an editable host. Prefers the live `isContentEditable` property
 * (which resolves inheritance) and falls back to the attribute so the check
 * still holds in environments that do not implement the property.
 */
function isEditableHost(element) {
  if (element.isContentEditable) {
    return true;
  }
  var attr = element.getAttribute
    ? element.getAttribute("contenteditable")
    : null;
  return attr !== null && attr !== undefined && attr !== "false";
}

/**
 * Privacy helpers for text capture. Text typed into inputs is always treated as
 * potential PII and never captured verbatim; only presence/length are reported.
 */
var Redactor = {
  // True when the element holds user-typed text (input/textarea/contenteditable).
  isTextInput: function (element) {
    var tag = tagName(element);
    if (TEXT_INPUT_TAGS[tag]) {
      if (tag === "input") {
        var type = (element.getAttribute("type") || "text").toLowerCase();
        return !!TEXT_INPUT_TYPES[type];
      }
      return true;
    }
    if (isEditableHost(element)) {
      return true;
    }
    return element.getAttribute("role") === "textbox";
  },

  // Collapses whitespace and truncates to maxLength. Returns null when empty.
  normalizeText: function (raw, maxLength) {
    if (!raw) {
      return null;
    }
    var collapsed = String(raw).replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
    if (!collapsed) {
      return null;
    }
    return collapsed.slice(0, maxLength);
  },

  redacted: function () {
    return REDACTED_PLACEHOLDER;
  }
};

module.exports = {
  Redactor: Redactor,
  REDACTED_PLACEHOLDER: REDACTED_PLACEHOLDER
};

});
