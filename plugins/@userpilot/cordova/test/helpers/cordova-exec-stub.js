/**
 * Stands in for Cordova's `cordova/exec` outside a WebView. Records every call
 * so tests can assert what would have crossed the native bridge, and never
 * invokes the callbacks — nothing under test depends on a native response.
 */

const calls = [];

function exec(onSuccess, onFail, service, action, args) {
  calls.push({ onSuccess, onFail, service, action, args });
}

exec.calls = calls;
exec.reset = function reset() {
  calls.length = 0;
};

module.exports = exec;
