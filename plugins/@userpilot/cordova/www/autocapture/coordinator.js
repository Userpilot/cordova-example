var constants = require("@userpilot/cordova.AutoCaptureConstants");
var types = require("@userpilot/cordova.AutoCaptureInteractionType");
var guarded = require("@userpilot/cordova.AutoCaptureGuardedRun");

var AutoCaptureConstants = constants.AutoCaptureConstants;
var toInteractionCategory = types.toInteractionCategory;
var guardedRun = guarded.guardedRun;

/**
 * Orchestrates auto-capture publishing.
 *
 * Builds the event property map (target identity + hierarchy with screen name +
 * source props), maps the InteractionType to its category, and forwards
 * everything through a single publish path.
 */
function AutoCaptureCoordinator(bridge, screenNameTracker) {
  this.bridge = bridge;
  this.screenNameTracker = screenNameTracker;
}

// Records the current screen and publishes a screen auto-capture event.
AutoCaptureCoordinator.prototype.trackScreen = function (title) {
  var self = this;
  guardedRun(function () {
    var trimmed = (title || "").replace(/^\s+|\s+$/g, "");
    if (!trimmed) {
      return;
    }
    self.screenNameTracker.updateScreen({ screenName: trimmed });
    self.bridge.trackAutoCaptureScreen(trimmed);
  });
};

// Builds and publishes an interaction auto-capture event.
AutoCaptureCoordinator.prototype.handleInteractionEvent = function (event) {
  var self = this;
  guardedRun(function () {
    var properties = self.buildEventProperties(event);
    var eventType = toInteractionCategory(event.interactionType);
    self.bridge.trackAutoCaptureEvent(eventType, properties);
  });
};

AutoCaptureCoordinator.prototype.buildEventProperties = function (event) {
  var props = {};

  if (event.targetClass) {
    props[AutoCaptureConstants.PROPERTY_TARGET_CLASS] = event.targetClass;
  }
  var viewClass = event.targetViewClass || event.targetClass;
  if (viewClass) {
    props[AutoCaptureConstants.PROPERTY_TARGET_VIEW_CLASS] = viewClass;
  }
  if (event.accessibilityLabel) {
    props[AutoCaptureConstants.PROPERTY_ACCESSIBILITY_LABEL] =
      event.accessibilityLabel;
  }
  if (event.resourceId) {
    props[AutoCaptureConstants.PROPERTY_TARGET_RESOURCE_ID] = event.resourceId;
  }
  if (event.viewTag) {
    props[AutoCaptureConstants.PROPERTY_VIEW_TAG] = event.viewTag;
  }
  if (event.targetText) {
    props[AutoCaptureConstants.PROPERTY_TARGET_TEXT] = event.targetText;
  }

  props[AutoCaptureConstants.PROPERTY_HIERARCHY] = this.buildHierarchyPath(event);
  props[AutoCaptureConstants.PROPERTY_RAW_INTERACTION_TYPE] =
    event.interactionType;

  // Source/value properties are merged last (already gated upstream).
  var source = event.sourceProperties || {};
  for (var key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      props[key] = source[key];
    }
  }

  return props;
};

/**
 * Appends the current screen name to the pre-built hierarchy path.
 * Format: `LeafSegment;…;RootSegment;ScreenName`.
 */
AutoCaptureCoordinator.prototype.buildHierarchyPath = function (event) {
  var basePath = event.hierarchy || "";
  var screenName = this.screenNameTracker.getScreenName() || "";

  if (!basePath) {
    return screenName || AutoCaptureConstants.UNKNOWN_SCREEN_NAME;
  }
  if (!screenName) {
    return basePath;
  }
  return basePath + ";" + screenName;
};

module.exports = {
  AutoCaptureCoordinator: AutoCaptureCoordinator
};
