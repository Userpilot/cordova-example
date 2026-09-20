# Observing SDK Callbacks

The Userpilot SDK provides three types of callbacks to help you handle navigation, analytics, and experience lifecycle events within your app.

## Navigation Listener
Navigation Listener is called when a deep link is triggered from an experience or notification. It holds the custom deep link URL to be handled by the client app.

Params:
```js
url: string
```

Analytics Listener is called when an event is triggered by the client app.

Params:

```js
analytic: string
value: string
properties: Map<string, any>
```

Analytics Listener
Called when an analytics event is triggered by the Userpilot SDK.
Use this to mirror or log SDK-level events into your analytics system.

Params:

```js
analytic: "Identify" | "Screen" | "Event"

value: String — Event value, if any.

properties: Map<String, Any> — Additional metadata for the event.
```

Experience Listener
Called when an experience or its step changes state. Includes two callback types:

onExperienceStateChanged
Triggered when the overall state of an experience changes.

```js
experienceId?: Int — Unique ID of the experience (optional)

experienceType: "Flow" | "Survey" | "NPS"

experienceState: "Started" | "Completed" | "Dismissed" | "Skipped" | "Submitted"
```

onExperienceStepStateChanged
Triggered when the state of a specific step within an experience changes.

```js
stepId: Int — Unique identifier of the step

experienceId: Int — ID of the parent experience

experienceType: "Flow" | "Survey" | "NPS"

stepState: "Started" | "Completed" | "Dismissed" | "Skipped" | "Submitted"

step?: Int — Step index (optional)

totalSteps?: Int — Total number of steps in the experience (optional)
```

Both callbacks are sent under the same event name: UserpilotExperienceEvent

```js
// Register for callbacks
window.userpilot.registerCallbacks(
    function(event) {
        console.log('Callback received:', event);
    },
    function(error) {
        console.error('Failed to register callbacks:', error);
    }
);

// Set up individual event listeners
window.userpilot.onUserpilotNavigationEvent(function(data) {
    console.log('Navigation Event:', data);
    // Handle deep link navigation
    if (data.url) {
        handleDeepLink(data.url);
    }
});

window.userpilot.onUserpilotAnalyticsEvent(function(data) {
    console.log('Analytics Event:', data);
});

window.userpilot.onUserpilotExperienceEvent(function(data) {
    console.log('Experience Event:', data);
});
```
