cordova.define('cordova/plugin_list', function(require, exports, module) {
  module.exports = [
    {
      "id": "cordova-plugin-deeplinks.universalLinks",
      "file": "plugins/cordova-plugin-deeplinks/www/universal_links.js",
      "pluginId": "cordova-plugin-deeplinks",
      "clobbers": [
        "universalLinks"
      ]
    },
    {
      "id": "cordova-plugin-customurlscheme.LaunchMyApp",
      "file": "plugins/cordova-plugin-customurlscheme/www/android/LaunchMyApp.js",
      "pluginId": "cordova-plugin-customurlscheme",
      "clobbers": [
        "window.plugins.launchmyapp"
      ]
    },
    {
      "id": "@userpilot/cordova.Userpilot",
      "file": "plugins/@userpilot/cordova/www/userpilot.js",
      "pluginId": "@userpilot/cordova",
      "clobbers": [
        "userpilot"
      ]
    },
    {
      "id": "@userpilot/cordova.AutoCaptureConstants",
      "file": "plugins/@userpilot/cordova/www/autocapture/constants.js",
      "pluginId": "@userpilot/cordova"
    },
    {
      "id": "@userpilot/cordova.AutoCaptureConfig",
      "file": "plugins/@userpilot/cordova/www/autocapture/config.js",
      "pluginId": "@userpilot/cordova"
    },
    {
      "id": "@userpilot/cordova.AutoCaptureInteractionType",
      "file": "plugins/@userpilot/cordova/www/autocapture/interaction-type.js",
      "pluginId": "@userpilot/cordova"
    },
    {
      "id": "@userpilot/cordova.AutoCaptureLogger",
      "file": "plugins/@userpilot/cordova/www/autocapture/util/logger.js",
      "pluginId": "@userpilot/cordova"
    },
    {
      "id": "@userpilot/cordova.AutoCaptureGuardedRun",
      "file": "plugins/@userpilot/cordova/www/autocapture/util/guarded-run.js",
      "pluginId": "@userpilot/cordova"
    },
    {
      "id": "@userpilot/cordova.AutoCaptureEventSuppressor",
      "file": "plugins/@userpilot/cordova/www/autocapture/util/event-suppressor.js",
      "pluginId": "@userpilot/cordova"
    },
    {
      "id": "@userpilot/cordova.AutoCaptureRedactor",
      "file": "plugins/@userpilot/cordova/www/autocapture/dom/redactor.js",
      "pluginId": "@userpilot/cordova"
    },
    {
      "id": "@userpilot/cordova.AutoCaptureGovernance",
      "file": "plugins/@userpilot/cordova/www/autocapture/dom/governance.js",
      "pluginId": "@userpilot/cordova"
    },
    {
      "id": "@userpilot/cordova.AutoCaptureElementClassifier",
      "file": "plugins/@userpilot/cordova/www/autocapture/dom/element-classifier.js",
      "pluginId": "@userpilot/cordova"
    },
    {
      "id": "@userpilot/cordova.AutoCaptureElementInspector",
      "file": "plugins/@userpilot/cordova/www/autocapture/dom/element-inspector.js",
      "pluginId": "@userpilot/cordova"
    },
    {
      "id": "@userpilot/cordova.AutoCaptureEventTarget",
      "file": "plugins/@userpilot/cordova/www/autocapture/dom/event-target.js",
      "pluginId": "@userpilot/cordova"
    },
    {
      "id": "@userpilot/cordova.AutoCaptureInteractionObserver",
      "file": "plugins/@userpilot/cordova/www/autocapture/dom/interaction-observer.js",
      "pluginId": "@userpilot/cordova"
    },
    {
      "id": "@userpilot/cordova.AutoCaptureRouteTracker",
      "file": "plugins/@userpilot/cordova/www/autocapture/screen/route-tracker.js",
      "pluginId": "@userpilot/cordova"
    },
    {
      "id": "@userpilot/cordova.AutoCaptureScreenNameTracker",
      "file": "plugins/@userpilot/cordova/www/autocapture/screen-name-tracker.js",
      "pluginId": "@userpilot/cordova"
    },
    {
      "id": "@userpilot/cordova.AutoCaptureCoordinator",
      "file": "plugins/@userpilot/cordova/www/autocapture/coordinator.js",
      "pluginId": "@userpilot/cordova"
    },
    {
      "id": "@userpilot/cordova.AutoCaptureBridge",
      "file": "plugins/@userpilot/cordova/www/autocapture/bridge.js",
      "pluginId": "@userpilot/cordova"
    },
    {
      "id": "@userpilot/cordova.AutoCaptureEngine",
      "file": "plugins/@userpilot/cordova/www/autocapture/engine.js",
      "pluginId": "@userpilot/cordova"
    }
  ];
  module.exports.metadata = {
    "cordova-plugin-deeplinks": "1.1.1",
    "cordova-plugin-customurlscheme": "5.0.2",
    "@userpilot/cordova": "1.3.0"
  };
});