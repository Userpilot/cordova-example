/**
 * Property-key constants for the auto-capture payload.
 *
 * These mirror the native Userpilot Android/iOS SDK keys so the events produced
 * by the Cordova DOM engine line up with native auto-capture on the backend.
 * Do not rename without coordinating with the native SDKs.
 */
var AutoCaptureConstants = {
  // Target element identity
  PROPERTY_ACCESSIBILITY_LABEL: "accessibility_label",
  PROPERTY_TARGET_CLASS: "target_class",
  PROPERTY_VIEW_TAG: "view_tag",
  PROPERTY_TARGET_RESOURCE_ID: "target_resource_id",
  PROPERTY_TARGET_TEXT: "target_text",
  PROPERTY_TARGET_VIEW_CLASS: "target_view_class",
  PROPERTY_IS_CHECKED: "is_checked",
  PROPERTY_TAB_INDEX: "tab_index",

  // Event payload structure
  PROPERTY_HIERARCHY: "hierarchy",
  PROPERTY_RAW_INTERACTION_TYPE: "raw_interaction_type",

  // Text-field source properties
  PROPERTY_HAS_TEXT: "has_text",
  PROPERTY_TEXT_LENGTH: "text_length",
  PROPERTY_PLACEHOLDER: "placeholder",

  // Presentation (modals, sheets, dialogs)
  PROPERTY_DIALOG_TITLE: "dialog_title",
  PROPERTY_PRESENTATION_SURFACE: "presentation_surface",

  // Selection / value source properties
  PROPERTY_SELECTED_INDEX: "selected_index",
  PROPERTY_SELECTED_VALUE: "selected_value",
  PROPERTY_MIN: "min",
  PROPERTY_MAX: "max",
  PROPERTY_SELECTED_DATE: "selected_date",
  PROPERTY_SELECTED_TIME: "selected_time",

  // Hierarchy path segment prefixes
  HIERARCHY_ID_PREFIX: "attr__id=",
  HIERARCHY_DESC_PREFIX: "attr__desc=",
  HIERARCHY_INDEX_PREFIX: "attr__index=",

  UNKNOWN_SCREEN_NAME: "Unknown",

  // Redaction
  TEXT_REDACTED_PLACEHOLDER: "****"
};

/**
 * Declarative opt-out / metadata attributes (the DOM analogue of the native
 * per-view ignore/redact markers).
 */
var AutoCaptureAttributes = {
  // Ignore all interaction auto-capture within this element's subtree.
  IGNORE: "data-userpilot-ignore",
  // Redact captured text/labels within this element's subtree.
  REDACT: "data-userpilot-redact"
};

module.exports = {
  AutoCaptureConstants: AutoCaptureConstants,
  AutoCaptureAttributes: AutoCaptureAttributes
};
