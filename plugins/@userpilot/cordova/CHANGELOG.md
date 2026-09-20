## [1.3.0]

### Changed
- Bump Userpilot native SDK dependencies to 1.4.0 on Android and iOS (offline mode).

## [1.2.0]

### Changed
- Bump Userpilot native SDK dependencies to 1.3.0 on Android and iOS.
- Ignore and redact markers now take an optional boolean — on the `userpilot.userpilotIgnoreInteractions(target, ignore)` / `userpilot.userpilotRedactText(target, redact)` APIs and a `"true"` / `"false"` value on the `data-userpilot-ignore` / `data-userpilot-redact` attributes. It defaults to `true`, so existing one-argument calls and bare attributes are unchanged, and nested markers resolve nearest-first: passing `false` on a descendant carves an exception out of an enclosing `true`.

### Fixed
- `dialog_title` no longer ships the dialog's title verbatim when `enableInteractionTextCapture` is off or the dialog is redacted — it now follows the same text policy as `target_text`.
- A text field's `placeholder` is now omitted when `enableInteractionTextCapture` is off and masked when the field is redacted, instead of always being sent verbatim.

## [1.1.0]

### Added
- Add support for auto capture.

### Changed
- Bump Userpilot native SDK dependencies to 1.2.2 on Android and iOS.

## [1.0.6]

### Added
- Fix compatibility with Cordova iOS 8.0.0

## [1.0.5]

### Added
- Upgrade Userpilot native SDK dependencies - iOS 1.0.14, Android 1.0.13

## [1.0.4]

### Added
- Upgrade Userpilot native SDK, Android 1.0.12

## [1.0.3]

### Added
- Upgrade native SDK dependencies, iOS 1.0.12, Android 1.0.10
- Added a configuration option to disable automatic push notification permission requests.
- Enhanced user property update handling with smoother fake reload support.
- Fixed processing of pending content to ensure consistent delivery.
- Ensured screen events are requested after returning from background when active content is visible.
- Refined logout flush queue logic for more reliable event cleanup.
- Improved state management during late SDK initialization.
- Enhanced fetching of active experiences and logout handling for pending content.
- Updated handling of application state transitions.
- Minor enhancements on Experiences UI.
- Refactored ExperiencesPublisher and AnalyticsPublisher to improve maintainability and scalability.

## [1.0.2]

### Added
- Upgrade Userpilot native SDK, iOS 1.0.11, Android 1.0.9
- Enhance iOS Obj-c compatibility

## [1.0.1]

### Added
- Upgrade Userpilot native SDK, version 1.0.7

## [1.0.0]

### Added
- Initial release of Cordova Userpilot Plugin
- Cross-platform support for Android and iOS (Userpilot SDK 1.0.6)
- Core API methods: `setup()`, `identify()`, `anonymous()`, `logout()`, `screen()`, `track()`
- Experience management: `triggerExperience()`, `endExperience()`
- Event system with callbacks: `registerCallbacks()`, `on()`, `off()`
- Support for Navigation, Analytics, and Experience events
- Compatible with Cordova Android 8.1.0+ and iOS 6.1.1+
- Plugin ID: `@userpilot/cordova`
