var exec = require("cordova/exec");
var guarded = require("@userpilot/cordova.AutoCaptureGuardedRun");
var logger = require("@userpilot/cordova.AutoCaptureLogger");

var guardedRun = guarded.guardedRun;

var PLUGIN_NAME = "UserpilotCordovaPlugin";

function noop() {}

/**
 * Thin wrapper around the native bridge actions. All calls are guarded so a
 * failure or missing native implementation never propagates into the host app
 * or the capture pipeline.
 */
function NativeBridge() {}

NativeBridge.prototype.trackAutoCaptureScreen = function (title) {
  guardedRun(function () {
    logger.info("screen", title);
    exec(
      noop,
      function (error) {
        logger.error("trackAutoCaptureScreen failed", error);
      },
      PLUGIN_NAME,
      "trackAutoCaptureScreen",
      [title]
    );
  });
};

NativeBridge.prototype.trackAutoCaptureEvent = function (eventType, properties) {
  guardedRun(function () {
    logger.info("event", eventType, JSON.stringify(properties));
    exec(
      noop,
      function (error) {
        logger.error("trackAutoCaptureEvent failed", error);
      },
      PLUGIN_NAME,
      "trackAutoCaptureEvent",
      [eventType, properties]
    );
  });
};

module.exports = {
  NativeBridge: NativeBridge
};
