# Auto capture

The Userpilot Cordova plugin can automatically capture **screens** (route changes) and **interactions** (taps, toggles, selections, text input, form submissions, and dialog presentations) in your app.

Cordova apps render their UI in a WebView, so auto capture is implemented entirely in the **DOM**: the plugin attaches a small set of delegated, capture-phase listeners on `document` and patches the History API. There is **no build-time instrumentation** and **no per-element wiring** — it works for any HTML/JS/framework UI out of the box and scales to any DOM size (the listener count is constant regardless of how many elements the page has).

Captured screens and interactions are forwarded to the native Userpilot SDK through the plugin bridge, so they appear alongside native auto capture on the backend.

## SDK config

Auto capture is configured through the `options` object passed to `setup`. All keys are optional; defaults match the native SDKs.

```js
userpilot.setup(
  "<APP_TOKEN>",
  {
    logging: true,

    // Auto capture
    enableScreenAutoCapture: true,
    enableInteractionAutoCapture: true,
    enableInteractionTextCapture: true,
    enableInteractionAccessibilityLabelCapture: true,
    enableInteractionValueCapture: false
  },
  function onSuccess() {},
  function onFail(error) {}
);
```

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `enableScreenAutoCapture` | `boolean` | `false` | Enables automatic screen tracking from route/history changes. |
| `enableInteractionAutoCapture` | `boolean` | `false` | Enables automatic interaction capture (taps, changes, text input, submits, dialogs). |
| `enableInteractionTextCapture` | `boolean` | `true` | If `false`, `target_text` is **omitted entirely** from captured payloads (not masked). Text typed into inputs is **never** captured verbatim regardless of this flag. |
| `enableInteractionAccessibilityLabelCapture` | `boolean` | `true` | If `false`, accessibility labels (`aria-label` / `title`) are not captured, and `attr__desc` is omitted from hierarchy segments. |
| `enableInteractionValueCapture` | `boolean` | `false` | Enables value payloads: `is_checked`, `selected_value`, slider `min`/`max`, selected date/time. `selected_index` for selects/lists is always included; `selected_value` only when this flag is `true`. |
| `maxHierarchyDepth` | `number` | `30` | Max ancestry depth walked when building the interaction hierarchy path. |
| `logging` | `boolean` | `false` | Enables SDK logging, including auto-capture diagnostic logs (screens/events are logged to the WebView console). |

Auto capture only starts when `enableScreenAutoCapture` and/or `enableInteractionAutoCapture` is `true`. The configuration is read once from `setup`; use the [runtime controls](#runtime-controls) to pause/resume afterwards.

> A few low-level tuning values (max text length, text-input debounce, and de-dupe window) are fixed internally and are not configurable through `setup`. Reach out if your integration needs them exposed.

## Screen tracking

When `enableScreenAutoCapture` is `true`, the plugin patches `history.pushState` / `history.replaceState` and listens for `popstate` and `hashchange`. The screen name is resolved with the following priority:

1. **Hash route** (e.g. `#/settings` → `/settings`). File-based Cordova apps keep a constant, noisy `pathname`, so a meaningful hash route is preferred. This covers hash-based SPA routers.
2. **`location.pathname + location.search`** (for history-routed apps), reported as-is — a bare `/` is a valid screen name and is kept.

The name always comes from the URL; there is **no fallback** to `document.title` or any other substitute. If the URL resolves to an empty string, no screen event is emitted (a name is never invented). Repeated resolutions to the same name are de-duplicated.

> **Manual vs automatic screens are mutually exclusive.** When `enableScreenAutoCapture` is configured, manual `userpilot.screen(...)` calls are ignored (and a warning is logged) — including while auto-capture is stopped via `stopAutoCapture()`. To send screens manually, leave `enableScreenAutoCapture: false`.

Debounced `text_change` events are flushed **before** a screen transition is published — on both automatic route changes and manual `userpilot.screen(...)` calls — so a field edited just before navigating is still attributed to the screen it was typed on, with that screen's hierarchy and privacy rules applied.

## Interaction capture

When `enableInteractionAutoCapture` is `true`, the plugin captures interactions via delegated capture-phase listeners for `click`, `change`, `input`, and `submit`, plus a `MutationObserver` for dialog presentation. Events that originate inside a web component's shadow DOM are resolved to the real host element via `composedPath()`.

Each interaction is classified into a `raw_interaction_type` based on the element's tag, `type`, and ARIA `role`:

| `raw_interaction_type` | Captured from |
|------------------------|---------------|
| `tap` | `button`, `a[href]`, `[role="button"]`, `[role="link"]`, `[role="menuitem"]`, `[onclick]` (climbs to the nearest interactive ancestor) |
| `tab_selected` | `[role="tab"]` |
| `list_item_selected` | a clickable element that also matches `[role="option"]` or `[role="listitem"]` |
| `menu_item_selected` | `[role="menuitem"]`, or any clickable element inside a `[role="menu"]` container |
| `checkbox_selected` | `input[type="checkbox"]` |
| `radio_button_selected` | `input[type="radio"]` |
| `switch_changed` | `[role="switch"]` |
| `slider_changed` | `input[type="range"]` |
| `spinner_selected` | `select` |
| `date_picker_changed` | `input[type="date" \| "month" \| "week" \| "datetime-local"]` |
| `time_picker_changed` | `input[type="time"]` |
| `text_field_changed` | `input` (text-like types), `textarea`, `[contenteditable]`, `[role="textbox"]` — debounced per field |
| `form_submitted` | `form` submit (submit-control taps are omitted so only this event is sent) |
| `view_presented` | an element matching `[role="dialog"]` / `[role="alertdialog"]` added to the DOM |

> **Tip:** To make custom components captured, build them from standard HTML and ARIA roles. For example, a custom list row should be a clickable element (`<button>` / `<a href>`) carrying `role="option"` (or `role="listitem"`) to be reported as `list_item_selected`; a custom toggle should carry `role="switch"`.

Rapid duplicate interactions on the same element are suppressed with a short de-dupe window (~500ms).

### Captured payload properties

| Property | Notes |
|----------|-------|
| `target_class` | Element tag (e.g. `button`). |
| `target_view_class` | Element view/component name (tag). |
| `target_text` | Visible text of the target. For **text fields** this is the field's own label (`aria-labelledby`, an associated/wrapping `<label>`, or a `label` attribute) — never the typed value. Masked to `****` when the element is marked for redaction, and omitted entirely when `enableInteractionTextCapture` is `false`. |
| `accessibility_label` | `aria-label` / `title` (when accessibility-label capture is enabled). Developer-authored, so redaction markers do not mask it. |
| `target_resource_id` | The element `id` attribute. |
| `view_tag` | First of `data-testid`, `data-test`, `data-cy`, `name`. |
| `hierarchy` | Semicolon-separated ancestry path from the target up to the screen name. Each segment is `Tag:attr__id="…",attr__index="N",attr__desc="…"`, with `id`/`desc` omitted when absent — e.g. `button:attr__id="save",attr__index="0";li:attr__index="3";…;/list`. |
| `raw_interaction_type` | The concrete interaction type (see table above). |
| `class_name` | Developer-authored `class` attribute of the target. |
| `tab_index` | For `tab_selected`, the tab's position within its `[role="tablist"]`. Otherwise the element's `tabindex` attribute, and only when it is a non-negative integer (a `-1` used purely for focusability is dropped). |
| `is_checked` | Checkbox/switch/toggle state (value capture only). |
| `selected_index` | Index for selects/lists. |
| `selected_value` | Selected value/label for selects, radios, sliders, and list items (value capture only). For elements without a form value, falls back to a `data-value` attribute or the visible label. |
| `min` / `max` | Slider bounds. |
| `has_text` / `text_length` | Text-field presence and length (the value itself is never sent). |
| `placeholder` | Text-field placeholder. |
| `selected_date` / `selected_time` | Date/time picker values (value capture only). |
| `dialog_title` / `presentation_surface` | Dialog presentation details. |

## Privacy & payload controls

Auto capture never sends typed input values verbatim — only the field's label plus `has_text` / `text_length`. Beyond that, you control text and interaction capture at three levels.

### Global flags

- `enableInteractionTextCapture: false` — omit `target_text` from all captured payloads.
- `enableInteractionAccessibilityLabelCapture: false` — drop accessibility labels.
- `enableInteractionValueCapture: false` — drop value payloads (`is_checked`, `selected_value`, dates/times, slider value).

### Declarative attributes

Add attributes directly in your markup to opt out by subtree:

```html
<!-- Ignore all interaction capture inside this subtree -->
<div data-userpilot-ignore>
  <button>Internal action</button>
</div>

<!-- Redact captured text inside this subtree -->
<form data-userpilot-redact>
  <input type="email" />
</form>
```

| Attribute | Effect |
|-----------|--------|
| `data-userpilot-ignore` | Drops auto capture for the element and its subtree. |
| `data-userpilot-redact` | Masks `target_text` for the element and its subtree. |

Both attributes take an optional `"true"` / `"false"` value. A bare attribute means `true`; `"false"` carves an exception out of an enclosing subtree:

```html
<div data-userpilot-ignore>
  <button>Not captured</button>

  <div data-userpilot-ignore="false">
    <button>Captured</button>
  </div>
</div>
```

### Programmatic helpers

Mark elements at runtime, by element reference or CSS selector:

```js
// Mask the captured text of an element (and its subtree)
userpilot.userpilotRedactText("#profile-form");
userpilot.userpilotRedactText(document.querySelector(".credit-card"));

// Ignore all interaction capture in an element's subtree
userpilot.userpilotIgnoreInteractions("#admin-panel");
userpilot.userpilotIgnoreInteractions(myElement);
```

| Method | Signature |
|--------|-----------|
| `userpilot.userpilotRedactText` | `(target, redact = true)` |
| `userpilot.userpilotIgnoreInteractions` | `(target, ignore = true)` |

`target` is a CSS selector string or a DOM `Element`. A selector is resolved when the call is made, so call these once the target elements are in the DOM. The boolean is optional and defaults to `true`, so existing one-argument calls keep their meaning.

### Nesting: the closest marker wins

Both markers apply to the whole subtree, and both are resolved **nearest-first**. When an interaction is captured, the engine walks from the interacted element up toward the document root and stops at the first element that has an opinion — so passing `false` on a descendant carves an exception out of an enclosing `true`:

```js
userpilot.userpilotIgnoreInteractions("#admin-panel", true);
userpilot.userpilotIgnoreInteractions("#admin-panel .support-chat", false);
```

```html
<div id="admin-panel">
  <button id="button1">Not captured</button>

  <div class="support-chat">
    <button id="button2">Captured</button>
  </div>
</div>
```

`#button1` resolves to `#admin-panel` (`true`) and fires nothing. `#button2` resolves to `.support-chat` (`false`) first and is captured normally. `userpilotRedactText` behaves the same way for `target_text`.

Elements that no marker on their chain covers are captured and unredacted, as before.

#### Precedence

Controls are resolved in this order — each step only gets a say if the one above it allows the event through.

**1. Ignore outranks everything else.** When an element resolves to ignored, no event is built at all, so redaction is moot. `userpilotIgnoreInteractions(el, true)` combined with `userpilotRedactText(el, false)` sends nothing — there is no payload left to un-redact.

**2. Global config outranks per-element redaction.** A global flag set to `false` removes the data everywhere; no per-element `false` can bring it back.

| Global flag | When `false` |
|-------------|--------------|
| `enableInteractionTextCapture` | `target_text`, `dialog_title`, and `placeholder` are omitted from every payload, whatever `userpilotRedactText` says. |
| `enableInteractionAccessibilityLabelCapture` | Accessibility labels are dropped. |
| `enableInteractionValueCapture` | `is_checked`, `selected_value`, dates/times, and slider values are dropped. |

`has_text` and `text_length` are unaffected — they describe the typed value without carrying it, and the value itself is never captured under any setting.

**3. Then the nearest element on the chain**, starting with the interacted element itself (see above).

**4. On a single element, a programmatic marker beats the attribute.** `userpilotIgnoreInteractions(el, false)` overrides a `data-userpilot-ignore` on that same element.

Calling a helper again on the same element replaces its value, so you can flip a subtree back and forth at runtime.

#### What redaction covers

`userpilotRedactText` masks every field carrying the element's on-screen text: `target_text`, `dialog_title` for dialogs, and `placeholder` for text fields. It does not touch developer-authored identifiers — `id`, `class_name`, `name`, `role`, `data-testid`, and the hierarchy path — which are treated as structure, not content, matching the native SDKs. Accessibility labels are governed separately by `enableInteractionAccessibilityLabelCapture`.

## Runtime controls

Pause and resume the capture pipeline at runtime without re-passing the config:

```js
userpilot.stopAutoCapture(onSuccess, onFail);   // detaches all listeners
userpilot.resumeAutoCapture(onSuccess, onFail); // restarts with the same config
```

Pausing auto-capture does not enable manual `screen()` calls. When `enableScreenAutoCapture` is configured, manual and automatic screen tracking remain mutually exclusive, including while auto-capture is stopped.

## Known limitations

- **WebView only.** Auto capture observes the DOM rendered in the Cordova WebView. Anything rendered outside the WebView (fully native screens/plugins with their own UI) is not captured by this engine.
- **Custom widgets need semantic markup.** Elements that handle interactions without using standard tags/ARIA roles (e.g. a clickable `<div>` with no `role` and no handler attribute) are not classified. Use the supported building blocks (see the [interaction table](#interaction-capture)) — or add the appropriate `role` — to be captured.
- **Typed input values are never captured.** For text fields, `target_text` is the field's *label* and only `has_text` / `text_length` describe the content; the value itself is never sent.
- **Text fields need a label to report one.** `target_text` is resolved from `aria-labelledby`, an associated/wrapping `<label>`, or a `label` attribute. A placeholder is deliberately not used as a label — it is reported separately as `placeholder`.
- **One screen source at a time.** Manual `screen(...)` is suppressed whenever `enableScreenAutoCapture` is configured, including while auto-capture is stopped.

## Example

```js
document.addEventListener("deviceready", function () {
  userpilot.setup(
    "<APP_TOKEN>",
    {
      logging: true,
      enableScreenAutoCapture: true,
      enableInteractionAutoCapture: true,
      enableInteractionValueCapture: true
    },
    function () {
      console.log("Userpilot ready with auto capture");
    },
    function (error) {
      console.error("Userpilot setup failed", error);
    }
  );
});
```
