/**
 * Resolves the effective light-DOM target for a DOM event.
 *
 * For events that originate inside a web component's shadow DOM (e.g. the
 * native `<button>` rendered inside a custom element), `event.target` /
 * `composedPath()[0]` is the shadow-internal node, which would yield a hierarchy
 * that dead-ends at the shadow boundary. Instead we return the deepest element
 * that lives in the main document tree (the shadow host), so identity and
 * hierarchy reflect the actual component tree.
 */
function isInMainTree(element) {
  var root = element.getRootNode
    ? element.getRootNode()
    : element.ownerDocument;
  return (
    root === element.ownerDocument ||
    (typeof document !== "undefined" && root === document)
  );
}

function isElement(node) {
  return (
    node &&
    typeof node === "object" &&
    node.nodeType === 1 &&
    typeof node.tagName === "string"
  );
}

function resolveEventTarget(event) {
  if (typeof event.composedPath === "function") {
    var composed = event.composedPath();
    if (composed && composed.length) {
      // Prefer the deepest node that lives in the main document tree.
      for (var i = 0; i < composed.length; i++) {
        if (isElement(composed[i]) && isInMainTree(composed[i])) {
          return composed[i];
        }
      }
      // Otherwise fall back to the first element in the path.
      for (var j = 0; j < composed.length; j++) {
        if (isElement(composed[j])) {
          return composed[j];
        }
      }
    }
  }
  return isElement(event.target) ? event.target : null;
}

module.exports = {
  resolveEventTarget: resolveEventTarget,
  isInMainTree: isInMainTree
};
