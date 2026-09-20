/**
 * Holds the currently tracked screen so interaction hierarchy paths can be
 * suffixed with the screen name.
 */
function ScreenNameTracker() {
  this.currentScreen = undefined;
}

ScreenNameTracker.prototype.updateScreen = function (payload) {
  this.currentScreen = payload;
};

ScreenNameTracker.prototype.getCurrentScreen = function () {
  return this.currentScreen;
};

// Screen name for hierarchy suffixing, or undefined when unknown.
ScreenNameTracker.prototype.getScreenName = function () {
  var name =
    this.currentScreen && this.currentScreen.screenName
      ? this.currentScreen.screenName.replace(/^\s+|\s+$/g, "")
      : "";
  return name || undefined;
};

ScreenNameTracker.prototype.reset = function () {
  this.currentScreen = undefined;
};

module.exports = {
  ScreenNameTracker: ScreenNameTracker
};
