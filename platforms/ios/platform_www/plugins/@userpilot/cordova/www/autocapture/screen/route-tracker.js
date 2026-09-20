cordova.define("@userpilot/cordova.AutoCaptureRouteTracker", function(require, exports, module) {
var guarded = require("@userpilot/cordova.AutoCaptureGuardedRun");

var guardedRun = guarded.guardedRun;

// Internal event dispatched when the History API mutates the location.
var LOCATION_CHANGE_EVENT = "userpilot:locationchange";

/**
 * Detects screen/route changes in a single-page app and reports a screen name.
 *
 * The name is taken from the URL only — the hash route when there is one, else
 * `location.pathname + location.search` (including a bare `/`). Nothing else is
 * substituted. Framework-agnostic: patches the History API and listens to
 * `popstate` / `hashchange`.
 *
 * [onBeforeLocationChange] runs synchronously on every location change, before
 * the new route is resolved and published, so work belonging to the outgoing
 * screen can be flushed while that screen is still current.
 */
function RouteTracker(onScreen, onBeforeLocationChange) {
  this.onScreen = onScreen;
  this.onBeforeLocationChange = onBeforeLocationChange;
  this.started = false;
  this.lastScreen = undefined;
  this.resolveTimer = undefined;
  this.patchedHistory = undefined;
  this.originalMethods = {};

  var self = this;
  this.onLocationChange = function () {
    if (self.onBeforeLocationChange) {
      guardedRun(function () {
        self.onBeforeLocationChange();
      });
    }
    self.scheduleResolve();
  };
}

RouteTracker.prototype.start = function () {
  if (
    this.started ||
    typeof window === "undefined" ||
    typeof document === "undefined"
  ) {
    return;
  }
  this.started = true;

  this.patchHistory();
  window.addEventListener(LOCATION_CHANGE_EVENT, this.onLocationChange);
  window.addEventListener("popstate", this.onLocationChange);
  window.addEventListener("hashchange", this.onLocationChange);

  // Capture the initial screen once the first page has rendered.
  this.scheduleResolve();
};

RouteTracker.prototype.stop = function () {
  if (!this.started || typeof window === "undefined") {
    return;
  }
  this.started = false;

  if (this.resolveTimer !== undefined) {
    clearTimeout(this.resolveTimer);
    this.resolveTimer = undefined;
  }

  window.removeEventListener(LOCATION_CHANGE_EVENT, this.onLocationChange);
  window.removeEventListener("popstate", this.onLocationChange);
  window.removeEventListener("hashchange", this.onLocationChange);

  this.restoreHistory();
  this.lastScreen = undefined;
};

// Debounces resolution so route + render timing settles before reading the DOM.
RouteTracker.prototype.scheduleResolve = function () {
  var self = this;
  if (this.resolveTimer !== undefined) {
    clearTimeout(this.resolveTimer);
  }
  this.resolveTimer = setTimeout(function () {
    self.resolveTimer = undefined;
    guardedRun(function () {
      self.resolveAndEmit();
    });
  }, 50);
};

RouteTracker.prototype.resolveAndEmit = function () {
  var title = this.resolveTitle();
  if (!title) {
    return;
  }
  if (title === this.lastScreen) {
    return;
  }
  this.lastScreen = title;
  this.onScreen(title);
};

/**
 * Resolves the current screen name.
 *
 * Hash-first: file-based Cordova apps keep a constant, noisy `pathname` (e.g.
 * `/android_asset/www/index.html`) and typically route via the hash, so a
 * meaningful hash route (`#/settings`) takes priority. Otherwise the name is
 * `pathname + search`, reported as-is — a bare `/` is a valid screen name and is
 * never substituted for anything else.
 */
RouteTracker.prototype.resolveTitle = function () {
  if (typeof location === "undefined") {
    return "";
  }

  var hashRoute = this.resolveHashRoute();
  if (hashRoute) {
    return hashRoute;
  }

  return ("" + location.pathname + location.search).replace(/^\s+|\s+$/g, "");
};

// Returns the hash route without its leading '#' (e.g. `#/settings` -> `/settings`),
// or an empty string when there is no meaningful hash route.
RouteTracker.prototype.resolveHashRoute = function () {
  var hash = location.hash || "";
  var route = hash.replace(/^#/, "").replace(/^\s+|\s+$/g, "");
  return route ? route : "";
};

RouteTracker.prototype.patchHistory = function () {
  if (typeof history === "undefined") {
    return;
  }
  this.patchedHistory = history;
  var methods = ["pushState", "replaceState"];
  for (var i = 0; i < methods.length; i++) {
    (function (method) {
      var original = history[method];
      this.originalMethods[method] = original;
      history[method] = function () {
        var result = original.apply(this, arguments);
        try {
          window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT));
        } catch (e) {
          // Older WebViews may not support the Event constructor; ignore.
        }
        return result;
      };
    }).call(this, methods[i]);
  }
};

RouteTracker.prototype.restoreHistory = function () {
  if (!this.patchedHistory) {
    return;
  }
  var methods = ["pushState", "replaceState"];
  for (var i = 0; i < methods.length; i++) {
    var method = methods[i];
    if (this.originalMethods[method]) {
      this.patchedHistory[method] = this.originalMethods[method];
    }
  }
  this.originalMethods = {};
  this.patchedHistory = undefined;
};

module.exports = {
  RouteTracker: RouteTracker
};

});
