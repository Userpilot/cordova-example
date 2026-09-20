cordova.define("@userpilot/cordova.AutoCaptureConfig", function(require, exports, module) {
/**
 * Auto-capture configuration resolution.
 *
 * Merges a partial config (read from the `setup` options object) with the
 * defaults below. Defaults match the native SDK / reference implementation so
 * behaviour is consistent across platforms.
 */

/**
 * Internal tuning constants. These are intentionally NOT exposed through the
 * public `setup` options surface. They are kept here as fixed defaults so they
 * can be exposed for configuration later if needed.
 */
var INTERNAL_AUTO_CAPTURE_CONFIG = {
  maxTextLength: 100,
  textInputDebounceMs: 1000,
  dedupeWindowMs: 500
};

var DEFAULT_AUTO_CAPTURE_CONFIG = {
  enableScreenAutoCapture: false,
  enableInteractionAutoCapture: false,
  enableInteractionTextCapture: true,
  enableInteractionAccessibilityLabelCapture: true,
  enableInteractionValueCapture: false,
  // Public: overridable via setup.
  maxHierarchyDepth: 30,
  maxTextLength: INTERNAL_AUTO_CAPTURE_CONFIG.maxTextLength,
  textInputDebounceMs: INTERNAL_AUTO_CAPTURE_CONFIG.textInputDebounceMs,
  dedupeWindowMs: INTERNAL_AUTO_CAPTURE_CONFIG.dedupeWindowMs
};

function bool(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function positiveInt(value, fallback) {
  return typeof value === "number" && isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

/**
 * Produces a fully-resolved config from a partial `setup` options object.
 *
 * Public flags (including `maxHierarchyDepth`) are read from the caller; the
 * remaining internal tuning constants ({@link INTERNAL_AUTO_CAPTURE_CONFIG})
 * are always applied as-is and cannot be overridden through `setup`.
 */
function resolveAutoCaptureConfig(config) {
  var c = config || {};
  var d = DEFAULT_AUTO_CAPTURE_CONFIG;
  return {
    enableScreenAutoCapture: bool(
      c.enableScreenAutoCapture,
      d.enableScreenAutoCapture
    ),
    enableInteractionAutoCapture: bool(
      c.enableInteractionAutoCapture,
      d.enableInteractionAutoCapture
    ),
    enableInteractionTextCapture: bool(
      c.enableInteractionTextCapture,
      d.enableInteractionTextCapture
    ),
    enableInteractionAccessibilityLabelCapture: bool(
      c.enableInteractionAccessibilityLabelCapture,
      d.enableInteractionAccessibilityLabelCapture
    ),
    enableInteractionValueCapture: bool(
      c.enableInteractionValueCapture,
      d.enableInteractionValueCapture
    ),
    maxHierarchyDepth: positiveInt(c.maxHierarchyDepth, d.maxHierarchyDepth),
    // Fixed internal tuning constants (not configurable via setup).
    maxTextLength: INTERNAL_AUTO_CAPTURE_CONFIG.maxTextLength,
    textInputDebounceMs: INTERNAL_AUTO_CAPTURE_CONFIG.textInputDebounceMs,
    dedupeWindowMs: INTERNAL_AUTO_CAPTURE_CONFIG.dedupeWindowMs
  };
}

module.exports = {
  DEFAULT_AUTO_CAPTURE_CONFIG: DEFAULT_AUTO_CAPTURE_CONFIG,
  resolveAutoCaptureConfig: resolveAutoCaptureConfig
};

});
