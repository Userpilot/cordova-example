cordova.define("@userpilot/cordova.AutoCaptureLogger", function(require, exports, module) {
/**
 * Minimal logger for the auto-capture engine.
 *
 * Disabled by default; enabled when the host passes `logging: true` to `setup`.
 * Never throws.
 */
var PREFIX = "[Userpilot:autocapture]";

var enabled = false;

var logger = {
  setEnabled: function (value) {
    enabled = value === true;
  },

  info: function () {
    if (enabled && typeof console !== "undefined") {
      var args = Array.prototype.slice.call(arguments);
      console.log.apply(console, [PREFIX].concat(args));
    }
  },

  warn: function () {
    if (enabled && typeof console !== "undefined") {
      var args = Array.prototype.slice.call(arguments);
      console.warn.apply(console, [PREFIX].concat(args));
    }
  },

  error: function () {
    if (enabled && typeof console !== "undefined") {
      var args = Array.prototype.slice.call(arguments);
      console.error.apply(console, [PREFIX].concat(args));
    }
  }
};

module.exports = logger;

});
