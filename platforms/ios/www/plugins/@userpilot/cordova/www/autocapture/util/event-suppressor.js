cordova.define("@userpilot/cordova.AutoCaptureEventSuppressor", function(require, exports, module) {
/**
 * Suppresses duplicate logical events within a short time window.
 *
 * Since there is no stable native view identity in the DOM, dedup is based on
 * an event identity key (e.g. `type|targetClass|id|tag|hierarchy`). Returns
 * `true` when the caller should drop the event because an identical key fired
 * recently. Opportunistically prunes stale keys to bound memory.
 */
function EventSuppressor(defaultWindowMs) {
  this.lastSeen = {};
  this.size = 0;
  this.defaultWindowMs =
    typeof defaultWindowMs === "number" ? defaultWindowMs : 300;
}

EventSuppressor.prototype.shouldSuppress = function (key, windowMs) {
  var now = Date.now();
  var window = typeof windowMs === "number" ? windowMs : this.defaultWindowMs;
  var previous = this.lastSeen[key];

  if (previous !== undefined && now - previous < window) {
    // Refresh so a rapid burst keeps being suppressed.
    this.lastSeen[key] = now;
    return true;
  }

  if (previous === undefined) {
    this.size++;
  }
  this.lastSeen[key] = now;
  this.prune(now, window);
  return false;
};

EventSuppressor.prototype.reset = function () {
  this.lastSeen = {};
  this.size = 0;
};

EventSuppressor.prototype.prune = function (now, windowMs) {
  if (this.size < 64) {
    return;
  }
  var cutoff = now - Math.max(windowMs, 1000);
  for (var key in this.lastSeen) {
    if (
      Object.prototype.hasOwnProperty.call(this.lastSeen, key) &&
      this.lastSeen[key] < cutoff
    ) {
      delete this.lastSeen[key];
      this.size--;
    }
  }
};

module.exports = {
  EventSuppressor: EventSuppressor
};

});
