var types = require("@userpilot/cordova.AutoCaptureInteractionType");

var InteractionType = types.InteractionType;

var CLICKABLE_SELECTOR = [
  "button",
  "a[href]",
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  "[onclick]"
].join(",");

// Tab-like controls classify as TAB_SELECTED (checked before generic click).
var TAB_SELECTOR = '[role="tab"]';
var LIST_ITEM_SELECTOR = ['[role="option"]', '[role="listitem"]'].join(",");
var MENU_ITEM_SELECTOR = '[role="menuitem"]';
// Overlay surfaces that turn their clickable children into menu items.
var MENU_CONTAINER_SELECTOR = '[role="menu"]';

function tag(element) {
  return element.tagName ? element.tagName.toLowerCase() : "";
}

function inputType(element) {
  return (element.getAttribute("type") || "text").toLowerCase();
}

/**
 * True for an editable host. Prefers the live `isContentEditable` property and
 * falls back to the attribute, matching `Redactor.isTextInput` so classification
 * and text redaction always agree on what counts as a text field.
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

function safeClosest(element, selector) {
  if (!element.closest) {
    return null;
  }
  try {
    return element.closest(selector);
  } catch (e) {
    return null;
  }
}

function matches(element, selector) {
  if (!element.matches) {
    return false;
  }
  try {
    return element.matches(selector);
  } catch (e) {
    return false;
  }
}

/**
 * True when clicking this control will submit an associated form. Those clicks
 * are omitted from tap capture so only the subsequent `form_submitted` event
 * is reported (avoids a duplicate tap + form_submitted pair).
 */
function isFormSubmittingControl(element) {
  // `element.form` covers nesting and the HTML `form="…"` association attribute.
  var form = element.form || safeClosest(element, "form");
  if (!form) {
    return false;
  }

  var t = tag(element);
  if (t === "button") {
    // HTML default for <button> is type="submit".
    return String(element.type || "submit").toLowerCase() === "submit";
  }
  if (t === "input") {
    var type = inputType(element);
    return type === "submit" || type === "image";
  }
  return false;
}

/**
 * Maps DOM elements/events to InteractionTypes and resolves the most meaningful
 * target element (e.g. a click inside a button resolves to the button).
 */
var ElementClassifier = {
  // Classifies a `click` target, climbing to the nearest interactive ancestor.
  classifyClick: function (rawTarget) {
    var tabTarget = safeClosest(rawTarget, TAB_SELECTOR);
    if (tabTarget) {
      return { target: tabTarget, type: InteractionType.TAB_SELECTED };
    }

    var clickable = safeClosest(rawTarget, CLICKABLE_SELECTOR);
    if (!clickable) {
      return null;
    }

    // Prefer form_submitted (from the submit listener) over a redundant tap.
    if (isFormSubmittingControl(clickable)) {
      return null;
    }

    // Anything clicked inside a menu surface is a menu item.
    if (
      matches(clickable, MENU_ITEM_SELECTOR) ||
      safeClosest(clickable, MENU_CONTAINER_SELECTOR)
    ) {
      return { target: clickable, type: InteractionType.MENU_ITEM_SELECTED };
    }
    if (matches(clickable, LIST_ITEM_SELECTOR)) {
      return { target: clickable, type: InteractionType.LIST_ITEM_SELECTED };
    }
    return { target: clickable, type: InteractionType.TAP };
  },

  // Classifies a `change` target (checkbox, radio, select, range, date, time).
  classifyChange: function (rawTarget) {
    var t = tag(rawTarget);

    if (t === "input") {
      var type = inputType(rawTarget);
      switch (type) {
        case "checkbox":
          return {
            target: rawTarget,
            type: InteractionType.CHECKBOX_SELECTED
          };
        case "radio":
          return {
            target: rawTarget,
            type: InteractionType.RADIO_BUTTON_SELECTED
          };
        case "range":
          return { target: rawTarget, type: InteractionType.SLIDER_CHANGED };
        case "date":
        case "month":
        case "week":
        case "datetime-local":
          return {
            target: rawTarget,
            type: InteractionType.DATE_PICKER_CHANGED
          };
        case "time":
          return {
            target: rawTarget,
            type: InteractionType.TIME_PICKER_CHANGED
          };
        default:
          return null;
      }
    }

    if (t === "select") {
      return { target: rawTarget, type: InteractionType.SPINNER_SELECTED };
    }
    if (matches(rawTarget, '[role="switch"]')) {
      return { target: rawTarget, type: InteractionType.SWITCH_CHANGED };
    }
    return null;
  },

  // Classifies an `input` target as a text-field change, if applicable.
  classifyTextInput: function (rawTarget) {
    var t = tag(rawTarget);
    if (t === "textarea") {
      return { target: rawTarget, type: InteractionType.TEXT_FIELD_CHANGED };
    }
    if (t === "input") {
      var type = inputType(rawTarget);
      var nonText = {
        checkbox: true,
        radio: true,
        range: true,
        date: true,
        time: true,
        "datetime-local": true,
        month: true,
        week: true,
        button: true,
        submit: true,
        reset: true,
        file: true,
        color: true
      };
      if (!nonText[type]) {
        return { target: rawTarget, type: InteractionType.TEXT_FIELD_CHANGED };
      }
      return null;
    }
    if (isEditableHost(rawTarget) || rawTarget.getAttribute("role") === "textbox") {
      return { target: rawTarget, type: InteractionType.TEXT_FIELD_CHANGED };
    }
    return null;
  },

  // Classifies a `submit` event target (a form) as a form submission.
  classifySubmit: function (rawTarget) {
    if (tag(rawTarget) === "form") {
      return { target: rawTarget, type: InteractionType.FORM_SUBMITTED };
    }
    var form = safeClosest(rawTarget, "form");
    if (form) {
      return { target: form, type: InteractionType.FORM_SUBMITTED };
    }
    return null;
  }
};

module.exports = {
  ElementClassifier: ElementClassifier
};
