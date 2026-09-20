cordova.define("@userpilot/cordova.AutoCaptureInteractionType", function(require, exports, module) {
/**
 * Auto-capture interaction types and their coarse categories.
 *
 * `InteractionType` values are sent in the payload as `raw_interaction_type`.
 * `InteractionCategory` is the coarse `eventType` forwarded to native.
 */

var InteractionType = {
  // Tap/click on any control (button, link, card, etc.).
  TAP: "tap",
  // Switch value changed.
  SWITCH_CHANGED: "switch_changed",
  // Checkbox value changed.
  CHECKBOX_SELECTED: "checkbox_selected",
  // Toggle button value changed.
  TOGGLE_BUTTON_SELECTED: "toggle_button_selected",
  // Radio button selected.
  RADIO_BUTTON_SELECTED: "radio_button_selected",
  // Slider/range value changed.
  SLIDER_CHANGED: "slider_changed",
  // Chip selection changed.
  CHIP_SELECTED: "chip_selected",
  // Date picker value changed.
  DATE_PICKER_CHANGED: "date_picker_changed",
  // Time picker value changed.
  TIME_PICKER_CHANGED: "time_picker_changed",
  // Text field edited (debounced).
  TEXT_FIELD_CHANGED: "text_field_changed",
  // List/collection item selected.
  LIST_ITEM_SELECTED: "list_item_selected",
  // Select/dropdown selection changed.
  SPINNER_SELECTED: "spinner_selected",
  // Tab selection changed.
  TAB_SELECTED: "tab_selected",
  // Menu item selected.
  MENU_ITEM_SELECTED: "menu_item_selected",
  // Form submitted.
  FORM_SUBMITTED: "form_submitted",
  // Modal/sheet/dialog became visible.
  VIEW_PRESENTED: "view_presented"
};

var InteractionCategory = {
  TAP: "tap",
  TEXT_CHANGE: "text_change",
  SELECTION_CHANGE: "selection_change",
  VALUE_CHANGE: "value_change",
  VIEW_PRESENTED: "view_presented"
};

/** Maps a concrete InteractionType to its coarse InteractionCategory. */
function toInteractionCategory(type) {
  switch (type) {
    case InteractionType.TAP:
    case InteractionType.FORM_SUBMITTED:
      return InteractionCategory.TAP;

    case InteractionType.TEXT_FIELD_CHANGED:
      return InteractionCategory.TEXT_CHANGE;

    case InteractionType.CHIP_SELECTED:
    case InteractionType.LIST_ITEM_SELECTED:
    case InteractionType.SPINNER_SELECTED:
    case InteractionType.RADIO_BUTTON_SELECTED:
    case InteractionType.MENU_ITEM_SELECTED:
    case InteractionType.TAB_SELECTED:
      return InteractionCategory.SELECTION_CHANGE;

    case InteractionType.SWITCH_CHANGED:
    case InteractionType.CHECKBOX_SELECTED:
    case InteractionType.TOGGLE_BUTTON_SELECTED:
    case InteractionType.SLIDER_CHANGED:
    case InteractionType.DATE_PICKER_CHANGED:
    case InteractionType.TIME_PICKER_CHANGED:
      return InteractionCategory.VALUE_CHANGE;

    case InteractionType.VIEW_PRESENTED:
      return InteractionCategory.VIEW_PRESENTED;

    default:
      return InteractionCategory.TAP;
  }
}

module.exports = {
  InteractionType: InteractionType,
  InteractionCategory: InteractionCategory,
  toInteractionCategory: toInteractionCategory
};

});
