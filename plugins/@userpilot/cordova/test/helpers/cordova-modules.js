/**
 * Lets plain Node `require` the plugin's www modules.
 *
 * At runtime Cordova resolves `@userpilot/cordova.<Name>` ids from the
 * `<js-module>` declarations in plugin.xml. Node knows nothing about those, so
 * this shim reads the same declarations and maps each id to its file on disk —
 * meaning the tests exercise the shipped sources, and a module renamed in
 * plugin.xml keeps resolving without touching the tests.
 */

const fs = require("fs");
const path = require("path");
const Module = require("module");

const PLUGIN_ROOT = path.resolve(__dirname, "..", "..");
const ID_PREFIX = "@userpilot/cordova.";

function readModuleMap() {
  const pluginXml = fs.readFileSync(
    path.join(PLUGIN_ROOT, "plugin.xml"),
    "utf8"
  );
  const pattern = /<js-module\s+src="([^"]+)"\s+name="([^"]+)"/g;
  const map = new Map();
  let match;
  while ((match = pattern.exec(pluginXml)) !== null) {
    const [, src, name] = match;
    map.set(ID_PREFIX + name, path.join(PLUGIN_ROOT, src));
  }
  if (map.size === 0) {
    throw new Error("No <js-module> declarations found in plugin.xml");
  }
  map.set("cordova/exec", path.join(__dirname, "cordova-exec-stub.js"));
  return map;
}

let installed = false;

function install() {
  if (installed) {
    return;
  }
  const moduleMap = readModuleMap();
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    const resolved = moduleMap.get(request);
    return originalLoad.call(this, resolved || request, parent, isMain);
  };
  installed = true;
}

install();

module.exports = { install, PLUGIN_ROOT };
