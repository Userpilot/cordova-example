cordova.define("@userpilot/cordova.Userpilot", function(require, exports, module) {
const exec = require("cordova/exec");
const AutoCaptureEngine = require("@userpilot/cordova.AutoCaptureEngine").AutoCaptureEngine;

const pluginName = "UserpilotCordovaPlugin";

// Initialize the userpilot object
const userpilot = {};

// DOM auto-capture engine. Runs entirely in the WebView and forwards captured
// screens/interactions to native via the trackAutoCaptureScreen/Event actions.
const autoCaptureEngine = new AutoCaptureEngine();

// The manual screen name seen before `setup` succeeded, or undefined. Native
// rejects every action until setup completes, so the name is held here and
// resolved by `flushPendingManualScreen`.
//
// One slot, never a queue: a screen view describes what the user is looking at
// *now*, so a newer name makes the previous one stale. Replaying a queue would
// report screens the user has already navigated past as if they had just been
// opened.
let pendingManualScreen;

// Deep links handed to `didHandleUrl` before setup completed. Native refuses
// the action until then, so without this a launch URL comes back as a failure
// and the host routes it as an ordinary app link — the Userpilot experience it
// was for never runs, and nothing reports an error.
//
// A queue, unlike the screen slot above: every link is still worth answering,
// and the answer is what the host routes on.
let pendingUrls = [];

// How many links may wait at once, and how long each one waits, so a host that
// never completes setup is never blocked: past either bound the link is
// answered as unhandled and the host routes it itself.
const MAX_PENDING_URLS = 10;
const PENDING_URL_TIMEOUT_MS = 10000;

// Set when a setup failed without leaving the SDK usable, so a later link is
// answered at once instead of waiting out the full timeout.
let setupFailed = false;

// Counts setup attempts, so a superseded one cannot answer the links that are
// waiting on a newer setup.
let setupAttempt = 0;

// Callback handlers
let eventHandlers = {
  UserpilotNavigationEvent: [],
  UserpilotAnalyticsEvent: [],
  UserpilotExperienceEvent: [],
};

// Error handling helper
const errors = {
  invalid: function (paramName, value) {
    return new Error(`Invalid ${paramName}: ${value}`);
  },
};

/**
 * Reports the manual screen held from before setup, if any.
 *
 * Sends at most one event, and only while manual tracking still owns screens:
 * with screen auto-capture on, the route tracker publishes the current location
 * as soon as it attaches, so sending the held name too would report that screen
 * twice. Never throws — a deferred screen must not break the host's setup
 * callback.
 */
function flushPendingManualScreen() {
  // Cleared up front so a second setup cannot report the same screen again.
  var screenName = pendingManualScreen;
  pendingManualScreen = undefined;

  if (!screenName) {
    return;
  }

  var reportFailure = function (error) {
    console.error("Failed to report the cached screen:", error);
  };

  try {
    if (autoCaptureEngine.maybeSuppressManualScreen()) {
      return;
    }

    // Same ordering as a live `screen` call: publish debounced interactions
    // while native still points at the previous screen.
    autoCaptureEngine.flushPendingTextChanges();

    // The caller's callbacks were already spent when the name was cached.
    exec(null, reportFailure, pluginName, "screen", [screenName]);
  } catch (error) {
    reportFailure(error);
  }
}

/**
 * Holds a link until setup settles, or answers it as unhandled when it cannot
 * be held. Never throws — a held link must not break the host's URL handler.
 */
function holdPendingUrl(url, onSuccess, onFail) {
  // Refuse the newest link rather than evicting a waiting one: the earliest is
  // usually the launch link, and its caller is already waiting on it.
  if (setupFailed || pendingUrls.length >= MAX_PENDING_URLS) {
    return reportUnhandled(onSuccess);
  }

  var pending = { url: url, onSuccess: onSuccess, onFail: onFail };
  pending.timeout = setTimeout(function () {
    var index = pendingUrls.indexOf(pending);
    if (index !== -1) {
      pendingUrls.splice(index, 1);
    }
    reportUnhandled(pending.onSuccess);
  }, PENDING_URL_TIMEOUT_MS);
  pendingUrls.push(pending);
}

/**
 * Answers a link the SDK never got the chance to claim, so the host routes it
 * as an ordinary app link instead of losing it.
 */
function reportUnhandled(onSuccess) {
  try {
    onSuccess && onSuccess(false);
  } catch (error) {
    console.error("Failed to answer a held URL:", error);
  }
}

/**
 * Removes every waiting link, cancelling its timeout as it goes.
 *
 * Leaving the queue is what ends the wait, so the timer has to die here rather
 * than when the link is finally answered: a link handed to native is answered
 * only once native replies, and a timer still armed until then would report an
 * in-flight link as unhandled and have the host route it a second time.
 */
function drainPendingUrls() {
  var drained = pendingUrls;
  pendingUrls = [];

  for (var i = 0; i < drained.length; i++) {
    clearTimeout(drained[i].timeout);
  }

  return drained;
}

/**
 * Hands every held link to native, now that there is an SDK to answer it.
 *
 * Answering every drained link is this function's whole contract — their
 * timeouts are cancelled, so nothing else will answer them — and it runs
 * inside the host's setup callback. Each link is guarded so one that cannot
 * cross the bridge neither strands the rest of the batch nor takes down the
 * setup callback around it.
 */
function flushPendingUrls() {
  var drained = drainPendingUrls();

  for (var i = 0; i < drained.length; i++) {
    try {
      exec(
        drained[i].onSuccess,
        drained[i].onFail,
        pluginName,
        "didHandleUrl",
        [drained[i].url]
      );
    } catch (error) {
      console.error("Failed to hand a held URL to the SDK:", error);
      reportUnhandled(drained[i].onSuccess);
    }
  }
}

/** Answers every held link as unhandled, so the host routes them itself. */
function releasePendingUrls() {
  var drained = drainPendingUrls();

  for (var i = 0; i < drained.length; i++) {
    reportUnhandled(drained[i].onSuccess);
  }
}

// Userpilot API

userpilot.setup = function (token, options, onSuccess, onFail) {
  // Handle optional options parameter
  if (typeof options === "function") {
    onFail = onSuccess;
    onSuccess = options;
    options = {};
  }
  
  if (!token || typeof token != "string") {
    return onFail(errors.invalid("token", token));
  }

  // Ensure options is an object
  options = options || {};

  // A fresh attempt supersedes an earlier failure.
  var attempt = ++setupAttempt;
  setupFailed = false;

  var onSuccessWrapper = function () {
    userpilot["__loaded"] = true;
    // Released first: native decides a link on its own, so a held link does
    // not have to wait on the auto-capture config, and the launch link has
    // been waiting the longest already.
    flushPendingUrls();
    // Boot DOM auto-capture from the same setup options (auto-capture keys are
    // read alongside logging/useInAppBrowser/etc.). Guarded: the SDK is up, so
    // an auto-capture boot that fails must not take the host's setup callback
    // — or the screen held for it — down with it.
    try {
      autoCaptureEngine.handleInitialize(options);
    } catch (error) {
      console.error("Failed to start auto-capture:", error);
    }
    // Only the resolved config says whether manual screens still own screen
    // tracking, so the held screen can only be settled here — and before the
    // host regains control, so it is on its way before the app navigates on.
    flushPendingManualScreen();
    onSuccess.apply(onSuccess, arguments);
  };

  var onFailWrapper = function () {
    // Setup failed: there is nothing to report the held screen to, and sending
    // it on a later retry would report a screen the user has moved on from.
    pendingManualScreen = undefined;
    // A later setup is the one the held links are waiting on now, and an SDK
    // that is already up stays usable when a later setup fails.
    if (attempt === setupAttempt && !userpilot["__loaded"]) {
      setupFailed = true;
      releasePendingUrls();
    }
    onFail && onFail.apply(onFail, arguments);
  };

  exec(onSuccessWrapper, onFailWrapper, pluginName, "setup", [token, options]);
};

userpilot.identify = function (id, properties, company, onSuccess, onFail) {
  if (!id || typeof id !== "string") {
    return onFail(errors.invalid("id", id));
  }

  exec(onSuccess, onFail, pluginName, "identify", [id, properties, company]);
};

userpilot.anonymous = function (onSuccess, onFail) {
  exec(onSuccess, onFail, pluginName, "anonymous", []);
};

userpilot.logout = function (onSuccess, onFail) {
  exec(onSuccess, onFail, pluginName, "logout", []);
};

userpilot.screen = function (screenName, onSuccess, onFail) {
  if (!screenName || typeof screenName != "string") {
    return onFail(errors.invalid("screenName", screenName));
  }

  // Native rejects the call until setup completes, so hold the name instead of
  // losing the host's first screen: the event is accepted and cached, not
  // failed. Whether it is reported or dropped is settled once setup resolves
  // the auto-capture config. Logged through console because the engine's logger
  // stays silent until setup enables it — which is exactly too late here.
  if (!userpilot["__loaded"]) {
    pendingManualScreen = screenName;
    console.warn(
      `Userpilot is not initialized yet: screen "${screenName}" is cached and will be reported once setup completes`
    );
    return onSuccess && onSuccess();
  }

  // Manual screen tracking is ignored while screen auto-capture is active to
  // avoid duplicate screen events.
  if (autoCaptureEngine.maybeSuppressManualScreen()) {
    return onSuccess && onSuccess();
  }

  // Publish debounced interactions while native still points at the previous
  // screen, then move native to the new one.
  autoCaptureEngine.flushPendingTextChanges();

  exec(onSuccess, onFail, pluginName, "screen", [screenName]);
};

userpilot.track = function (eventName, eventProperties, onSuccess, onFail) {
  if (!eventName || typeof eventName != "string") {
    return onFail(errors.invalid("event", eventName));
  }

  exec(onSuccess, onFail, pluginName, "track", [eventName, eventProperties]);
};

userpilot.triggerExperience = function (experienceId, onSuccess, onFail) {
  if (!experienceId || typeof experienceId != "string") {
    return onFail(errors.invalid("event", experienceId));
  }

  exec(onSuccess, onFail, pluginName, "triggerExperience", [experienceId]);
};

userpilot.endExperience = function (onSuccess, onFail) {
  exec(onSuccess, onFail, pluginName, "endExperience", []);
};

userpilot.didHandleUrl = function (url, onSuccess, onFail) {
  if (!url || typeof url !== "string") {
    return onFail(errors.invalid("url", url));
  }

  // Native refuses the action until setup completes, so hold the link instead
  // of failing it: the answer is what the host routes on, and answering "not
  // ours" now sends the user elsewhere for a link that is ours. Up to 10 links
  // wait, each for at most 10 seconds, after which they are answered as
  // unhandled so the host's own routing still runs.
  if (!userpilot["__loaded"]) {
    return holdPendingUrl(url, onSuccess, onFail);
  }

  exec(onSuccess, onFail, pluginName, "didHandleUrl", [url]);
};

// Auto-capture controls

userpilot.stopAutoCapture = function (onSuccess, onFail) {
  try {
    autoCaptureEngine.stop();
    onSuccess && onSuccess();
  } catch (error) {
    onFail && onFail(error);
  }
};

userpilot.resumeAutoCapture = function (onSuccess, onFail) {
  try {
    autoCaptureEngine.resume();
    onSuccess && onSuccess();
  } catch (error) {
    onFail && onFail(error);
  }
};

// Redact the captured text of an element (and its subtree).
// `target` is a DOM element or a CSS selector string. `redact` defaults to
// true; pass false on a descendant to un-redact it inside a redacted subtree —
// the nearest marker to the interacted element wins.
userpilot.userpilotRedactText = function (target, redact) {
  autoCaptureEngine.redactText(target, redact);
};

// Ignore all auto-capture interactions originating in an element's subtree.
// `target` is a DOM element or a CSS selector string. `ignore` defaults to
// true; pass false on a descendant to keep capturing it inside an ignored
// subtree — the nearest marker to the interacted element wins.
userpilot.userpilotIgnoreInteractions = function (target, ignore) {
  autoCaptureEngine.ignoreInteractions(target, ignore);
};

// Callback registration and event handling

userpilot.registerCallbacks = function (onSuccess, onFail) {
  exec(
    function (event) {
      // Handle incoming events from native
      if (event && event.category && event.data) {
        const handlers = eventHandlers[event.category] || [];
        handlers.forEach((handler) => {
          try {
            handler(event.data);
          } catch (error) {
            console.error("Error in event handler:", error);
          }
        });
      }
      onSuccess && onSuccess(event);
    },
    onFail,
    pluginName,
    "registerCallbacks",
    []
  );
};

// Event listener management
userpilot.on = function (eventType, handler) {
  if (!eventHandlers[eventType]) {
    console.warn(
      `Unknown event type: ${eventType}. Available types: ${Object.keys(
        eventHandlers
      ).join(", ")}`
    );
    return;
  }

  if (typeof handler !== "function") {
    console.error("Event handler must be a function");
    return;
  }

  eventHandlers[eventType].push(handler);
};

userpilot.off = function (eventType, handler) {
  if (!eventHandlers[eventType]) {
    return;
  }

  if (handler) {
    const index = eventHandlers[eventType].indexOf(handler);
    if (index > -1) {
      eventHandlers[eventType].splice(index, 1);
    }
  } else {
    // Remove all handlers for this event type
    eventHandlers[eventType] = [];
  }
};

// Convenience methods for specific event types
userpilot.onUserpilotNavigationEvent = function (handler) {
  userpilot.on("UserpilotNavigationEvent", handler);
};

userpilot.onUserpilotAnalyticsEvent = function (handler) {
  userpilot.on("UserpilotAnalyticsEvent", handler);
};

userpilot.onUserpilotExperienceEvent = function (handler) {
  userpilot.on("UserpilotExperienceEvent", handler);
};

// Exports
module.exports = userpilot;

});
