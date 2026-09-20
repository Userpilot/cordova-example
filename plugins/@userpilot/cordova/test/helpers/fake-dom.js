/**
 * A DOM stub covering just what the auto-capture governance layer touches:
 * `parentElement`, `hasAttribute`, `getAttribute`, and a `document` whose
 * `querySelectorAll` resolves the selectors registered by the test.
 *
 * Deliberately not a DOM implementation — the point is to keep the governance
 * tests dependency-free and readable, not to re-implement selector matching.
 */

class FakeElement {
  constructor(tagName = "div", attributes = {}, textContent = "") {
    this.tagName = tagName.toUpperCase();
    this.attributes = { ...attributes };
    this.textContent = textContent;
    this.parentElement = null;
    this.children = [];
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name);
  }

  getAttribute(name) {
    return this.hasAttribute(name) ? this.attributes[name] : null;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }
}

/**
 * Builds a chain of elements from outermost to innermost, wiring each as the
 * parent of the next. Returns the created elements in the order given.
 */
function buildChain(...specs) {
  const elements = specs.map((spec) =>
    spec instanceof FakeElement
      ? spec
      : new FakeElement(spec.tag || "div", spec.attributes || {}, spec.text || "")
  );
  elements.reduce((parent, child) => {
    parent.appendChild(child);
    return child;
  });
  return elements;
}

/**
 * Installs a `document` global whose `querySelectorAll` returns the elements
 * registered for a selector. Returns a restore function.
 */
function installDocument(selectorMap = {}) {
  const previous = global.document;
  global.document = {
    querySelectorAll(selector) {
      return selectorMap[selector] || [];
    }
  };
  return function restore() {
    if (previous === undefined) {
      delete global.document;
    } else {
      global.document = previous;
    }
  };
}

module.exports = { FakeElement, buildChain, installDocument };
