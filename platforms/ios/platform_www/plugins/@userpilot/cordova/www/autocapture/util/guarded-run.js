cordova.define("@userpilot/cordova.AutoCaptureGuardedRun", function(require, exports, module) {
var logger = require("@userpilot/cordova.AutoCaptureLogger");

/**
 * Runs `fn` and swallows any error so auto-capture can never crash the host
 * app. Returns the result of `fn`, or `undefined` when it throws.
 */
function guardedRun(fn) {
  try {
    return fn();
  } catch (error) {
    logger.error("guarded error", error);
    return undefined;
  }
}

module.exports = {
  guardedRun: guardedRun
};

});
