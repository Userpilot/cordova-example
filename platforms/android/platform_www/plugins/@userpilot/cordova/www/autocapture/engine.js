cordova.define("@userpilot/cordova.AutoCaptureEngine", function(require, exports, module) {
var configModule = require("@userpilot/cordova.AutoCaptureConfig");
var coordinatorModule = require("@userpilot/cordova.AutoCaptureCoordinator");
var screenTrackerModule = require("@userpilot/cordova.AutoCaptureScreenNameTracker");
var bridgeModule = require("@userpilot/cordova.AutoCaptureBridge");
var inspectorModule = require("@userpilot/cordova.AutoCaptureElementInspector");
var observerModule = require("@userpilot/cordova.AutoCaptureInteractionObserver");
var governanceModule = require("@userpilot/cordova.AutoCaptureGovernance");
var routeTrackerModule = require("@userpilot/cordova.AutoCaptureRouteTracker");
var suppressorModule = require("@userpilot/cordova.AutoCaptureEventSuppressor");
var guarded = require("@userpilot/cordova.AutoCaptureGuardedRun");
var logger = require("@userpilot/cordova.AutoCaptureLogger");

var resolveAutoCaptureConfig = configModule.resolveAutoCaptureConfig;
var DEFAULT_AUTO_CAPTURE_CONFIG = configModule.DEFAULT_AUTO_CAPTURE_CONFIG;
var AutoCaptureCoordinator = coordinatorModule.AutoCaptureCoordinator;
var ScreenNameTracker = screenTrackerModule.ScreenNameTracker;
var NativeBridge = bridgeModule.NativeBridge;
var DomElementInspector = inspectorModule.DomElementInspector;
var DomInteractionObserver = observerModule.DomInteractionObserver;
var ElementGovernance = governanceModule.ElementGovernance;
var RouteTracker = routeTrackerModule.RouteTracker;
var EventSuppressor = suppressorModule.EventSuppressor;
var guardedRun = guarded.guardedRun;

/**
 * Public facade for the DOM auto-capture feature. Owns the engine lifecycle,
 * wires the observers to the coordinator/bridge, and exposes the per-element
 * privacy APIs. Constructed once per plugin instance.
 */
function AutoCaptureEngine() {
  this.governance = new ElementGovernance();
  this.screenNameTracker = new ScreenNameTracker();
  this.suppressor = new EventSuppressor();
  this.coordinator = new AutoCaptureCoordinator(
    new NativeBridge(),
    this.screenNameTracker
  );

  this.config = DEFAULT_AUTO_CAPTURE_CONFIG;
  this.configured = false;
  this.observer = undefined;
  this.routeTracker = undefined;
  this.running = false;
}

// Boots the engine from `setup` options when auto-capture is configured.
AutoCaptureEngine.prototype.handleInitialize = function (options) {
  var self = this;
  guardedRun(function () {
    options = options || {};
    logger.setEnabled(options.logging);
    // Configure once from setup; start() then toggles the listeners on.
    self.configure(options);
    self.start();
  });
};

/**
 * Applies (or replaces) the auto-capture configuration without touching the
 * running listeners.
 */
AutoCaptureEngine.prototype.configure = function (config) {
  var self = this;
  guardedRun(function () {
    self.config = resolveAutoCaptureConfig(config);
    self.configured = true;
  });
};

/**
 * Starts auto-capture. Pass a `config` to (re)configure first; otherwise the
 * last configuration is used. Safe to call repeatedly: it restarts cleanly so
 * config changes always take effect.
 */
AutoCaptureEngine.prototype.start = function (config) {
  var self = this;
  guardedRun(function () {
    if (config !== undefined || !self.configured) {
      self.configure(config);
    }

    var wantScreens = self.config.enableScreenAutoCapture;
    var wantInteractions = self.config.enableInteractionAutoCapture;
    if (!wantScreens && !wantInteractions) {
      self.stop();
      return;
    }
    if (typeof document === "undefined") {
      logger.warn("no DOM available; auto-capture not started");
      return;
    }

    // Restart cleanly so repeated calls / config changes always take effect.
    self.stop();

    if (wantScreens) {
      self.routeTracker = new RouteTracker(
        function (title) {
          self.coordinator.trackScreen(title);
        },
        function () {
          // Publish debounced interactions while the outgoing screen is still
          // the current one, so they carry the screen they happened on.
          self.flushPendingTextChanges();
        }
      );
      self.routeTracker.start();
    }

    if (wantInteractions) {
      var inspector = new DomElementInspector(self.config, self.governance);
      self.observer = new DomInteractionObserver(
        self.config,
        self.governance,
        inspector,
        self.coordinator,
        self.suppressor
      );
      self.observer.start();
    }

    self.running = true;
    logger.info("auto-capture started", {
      screens: wantScreens,
      interactions: wantInteractions
    });
  });
};

/**
 * Stops auto-capture and detaches all listeners. The configuration is retained
 * so `resume` can restart with the same setup. Stopping does not enable manual
 * `screen()` calls — suppression follows `enableScreenAutoCapture` in config.
 */
AutoCaptureEngine.prototype.stop = function () {
  var self = this;
  var observer = this.observer;
  var routeTracker = this.routeTracker;

  // Clear runtime handles before teardown so a cleanup failure cannot leave
  // listeners attached while `running` still reports true.
  this.observer = undefined;
  this.routeTracker = undefined;
  this.running = false;

  // Tear down each component independently so one failure cannot prevent the
  // remaining listeners/state from being cleaned up.
  guardedRun(function () {
    if (observer) {
      observer.stop();
    }
  });
  guardedRun(function () {
    if (routeTracker) {
      routeTracker.stop();
    }
  });
  guardedRun(function () {
    self.suppressor.reset();
  });
};

// Resumes auto-capture using the retained configuration.
AutoCaptureEngine.prototype.resume = function () {
  var self = this;
  guardedRun(function () {
    self.start();
  });
};

AutoCaptureEngine.prototype.isRunning = function () {
  return this.running;
};

/**
 * Returns true when a manual `screen()` call should be ignored because screen
 * auto-capture is configured. Manual and automatic screen tracking remain
 * mutually exclusive while auto-capture is paused.
 */
AutoCaptureEngine.prototype.maybeSuppressManualScreen = function () {
  if (this.config.enableScreenAutoCapture) {
    logger.warn(
      "Manual screen tracking is disabled when enableScreenAutoCapture is enabled"
    );
    return true;
  }
  return false;
};

/**
 * Publishes any debounced text changes now. Called before a screen transition
 * (automatic or manual) so those events carry the screen they happened on. No-op
 * when interaction auto-capture is not running.
 */
AutoCaptureEngine.prototype.flushPendingTextChanges = function () {
  if (this.observer) {
    this.observer.flushPendingTextInputs();
  }
};

// Manually report a screen (escape hatch when route detection is insufficient).
AutoCaptureEngine.prototype.trackScreen = function (title) {
  this.coordinator.trackScreen(title);
};

// region per-element governance API

AutoCaptureEngine.prototype.redactText = function (target, redact) {
  this.governance.markRedact(target, redact);
};

AutoCaptureEngine.prototype.ignoreInteractions = function (target, ignore) {
  this.governance.markIgnore(target, ignore);
};

// endregion

module.exports = {
  AutoCaptureEngine: AutoCaptureEngine
};

});
