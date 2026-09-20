# Userpilot Cordova Plugin

[![npm](https://img.shields.io/npm/v/@userpilot/cordova.svg?logo=npm&logoColor=fff&label=NPM+package&color=limegreen)](https://www.npmjs.com/package/@userpilot/cordova)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/Userpilot/cordova-plugin/blob/main/LICENSE)

Userpilot Cordova Plugin enables you to capture user insights and deliver personalized in-app experiences in real time. With just a one-time setup, you can immediately begin leveraging Userpilot's analytics and engagement features to understand user behaviors and guide their journeys in-app.

This document provides a step-by-step walkthrough of the installation and initialization process, as well as instructions on using the plugin's public APIs.

- [Userpilot Cordova Plugin](#userpilot-cordova-plugin)
  - [🚀 Getting Started](#-getting-started)
    - [Prerequisites](#prerequisites)
    - [Installation](#installation)
    - [Initializing](#initializing)
    - [Identifying Users](#identifying-users)
    - [Tracking Screens](#tracking-screens-required)
    - [Tracking Events](#tracking-events)
    - [Logging Out](#logging-out)
    - [Anonymous Users](#anonymous-users)
    - [Trigger Experience](#trigger-experience)
    - [End Experience](#end-experience)
    - [Handle Deep Link URL](#handle-deep-link-url)
    - [SDK Callbacks](#sdk-callbacks)
    - [Push Notifications](#push-notification)
  - [📝 Documentation](#-documentation)
  - [🎬 Examples](#-examples)
  - [📄 License](#-license)

## 🚀 Getting Started

### Prerequisites

**Cordova** - your application should use Cordova version 10+ with cordova-cli installed globally.

**Android** - your application's `config.xml` must have an `android-compileSdkVersion` of 36+ and `android-minSdkVersion` of 23+. Your project must use Android Gradle Plugin (AGP) version 8.9.1 or above.

```xml
<platform name="android">
    <preference name="android-minSdkVersion" value="23" />
    <preference name="android-compileSdkVersion" value="36" />
    <preference name="android-targetSdkVersion" value="35" />
    <preference name="AndroidGradlePluginVersion" value="8.9.1" />
    <preference name="GradlePluginKotlinEnabled" value="true" />
</platform>
```

**iOS** - your application must target iOS 13+ to install the SDK, Update the iOS project xcodeproj to set the deployment target. Update your config.xml to set the deployment target.

```xml
<platform name="ios">
    <preference name="deployment-target" value="13.0" />
    <preference name="SwiftVersion" value="5.0" />
</platform>
```

### Installation

Add the Userpilot Cordova Plugin to your application.

1. In your app's root directory, install the Userpilot Cordova Plugin
   ```sh
   cordova plugin add @userpilot/cordova
   or 
   cordova plugin add @userpilot/cordova --variable DEPLOYMENT-TARGET=13.0
   ```

3. Prepare your platforms:
   ```sh
   cordova prepare
   ```

### Initializing

To use Userpilot, initialize it once when your device is ready. This ensures the SDK is ready as soon as your app starts. Replace `<APP_TOKEN>` with your Application Token, which can be fetched from your [Environments Page](https://run.userpilot.io/environment).

##### &nbsp;&nbsp;&nbsp; API:

```js
setup(token, options, onSuccess, onError)
```

##### &nbsp;&nbsp;&nbsp; Basic Example:

```js
document.addEventListener('deviceready', function() {
    window.userpilot.setup('<APP_TOKEN>', 
        function(success) {
            console.log('Userpilot initialized successfully');
        },
        function(error) {
            console.error('Failed to initialize Userpilot:', error);
        }
    );
}, false);
```

##### &nbsp;&nbsp;&nbsp; Advanced Example with Options:

```js
document.addEventListener('deviceready', function() {
    const options = {
        logging: true,         // Enable/disable SDK logging
        useInAppBrowser: true, // Determines whether to open URLs inside CustomTabsIntent/SFSafariViewController or use the system browser.     
    };
    
    window.userpilot.setup('<APP_TOKEN>', options,
        function(success) {
            console.log('Userpilot initialized successfully');
        },
        function(error) {
            console.error('Failed to initialize Userpilot:', error);
        }
    );
}, false);
```

#### Configurations (Optional)
| **Parameter**                             | **Type** | **Description**                                                                                              |
| ----------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| logging                                   | Boolean  | Enable or Disable logs for SDK<br /><br />**Default: false**                                                 |
| disableRequestPushNotificationsPermission | Boolean  | Disable request push notifications permission by SDK.<br /><br />**Default: false**                          |
| useInAppBrowser                           | Boolean  | cDetermines whether to open URLs inside CustomTabsIntent/SFSafariViewController or use the system browser.<br /><br />**Default: false** |


### Identifying Users

This API is used to identify unique users and companies (groups of users) and set their properties. Once identified, all subsequent tracked events and screens will be attributed to that user.

**Recommended Usage:**

- **On user authentication (login):** Immediately call `identify` when a user signs in to establish their identity for all future events.
- **On app launch for authenticated users:** If the user has a valid authenticated session, call `identify` at app launch.
- **Upon property updates:** Whenever user or company properties change.

##### &nbsp;&nbsp;&nbsp; API:

```js
identify(userID, properties, company, onSuccess, onError)
```

##### &nbsp;&nbsp;&nbsp; Example:

```js
window.userpilot.identify(
    '<USER_ID>',
    {
        'name': 'John Doe', 
        'email': 'user@example.com', 
        'created_at': '2019-10-17', 
        'role': 'Admin'
    },
    {
        'id': 'company123', 
        'name': 'Acme Labs', 
        'created_at': '2019-10-17', 
        'plan': 'Free'
    },
    function(success) {
        console.log('User identified successfully');
    },
    function(error) {
        console.error('Failed to identify user:', error);
    }
);
```

**Properties Guidelines**

- Key `id` is required in company properties, to identify a unique company.
- Userpilot supports String, Numeric, and Date types.
- Make sure you're sending date values in ISO8601 format.
- If you are planning to use Userpilot's localization features, make sure you are passing user property `locale_code` with a value that adheres to ISO 639-1 format.
- Userpilot's reserved properties have pre-determined types and improve profiles interface in the dashboard:
  - Use key `email` to pass the user's email.
  - Use key `name` to pass the user's or company's name.
  - Use key `created_at` to pass the user's or company's signed up date.

**Notes**

- Make sure your User ID source is consistent across all of your platform installations (Web, Android, and iOS).
- While properties are optional, they are essential in Userpilot's segmentation capabilities. We encourage you to set the properties with the people who are responsible for Userpilot integration.

### Tracking Screens (Required)

Calling screen is crucial for unlocking Userpilot's core engagement and analytics capabilities. When a user navigates to a particular screen, invoking screen records that view and triggers any eligible in-app experiences. Subsequent events are also attributed to the most recently tracked screen, providing context for richer analytical insights. For these reasons, we strongly recommend tracking all of your app's screen views.

##### &nbsp;&nbsp;&nbsp; API:

```js
screen(screenName, onSuccess, onError)
```

##### &nbsp;&nbsp;&nbsp; Example:

```js
window.userpilot.screen('Profile',
    function(success) {
        console.log('Screen tracked successfully');
    },
    function(error) {
        console.error('Failed to track screen:', error);
    }
);
```

**Notes**

- You do not have to order this call against `setup`. A screen tracked before `setup` completes is held and reported once it succeeds, so your `onSuccess` runs immediately and nothing is lost. Only the most recent one is held — a screen view describes where the user is now, so a newer one replaces it.
- Nothing is reported if `setup` fails, or if you enabled `enableScreenAutoCapture` — auto-capture reports the starting screen itself.

### Tracking Events

Log any meaningful action the user performs. Events can be button clicks, form submissions, or any custom activity you want to analyze. Optionally, you can pass metadata with the event to provide specific context.

##### &nbsp;&nbsp;&nbsp; API:

```js
track(name, properties, onSuccess, onError)
```

##### &nbsp;&nbsp;&nbsp; Example:

```js
window.userpilot.track('Added to Cart', 
    { 
        itemId: 'sku_456', 
        price: 29.99 
    },
    function(success) {
        console.log('Event tracked successfully');
    },
    function(error) {
        console.error('Failed to track event:', error);
    }
);
```

### Logging Out

When a user logs out, call `logout()` to clear the current user context. This ensures subsequent events are no longer associated with the previous user.

##### &nbsp;&nbsp;&nbsp; API:

```js
logout(onSuccess, onError)
```

##### &nbsp;&nbsp;&nbsp; Example:

```js
window.userpilot.logout(
    function(success) {
        console.log('User logged out successfully');
    },
    function(error) {
        console.error('Failed to logout user:', error);
    }
);
```

### Anonymous Users

If a user is not authenticated, call `anonymous()` to track events without a user ID. This is useful for pre-signup flows or guest user sessions.

##### &nbsp;&nbsp;&nbsp; API:

```js
anonymous(onSuccess, onError)
```

##### &nbsp;&nbsp;&nbsp; Example:

```js
window.userpilot.anonymous(
    function(success) {
        console.log('Anonymous user set successfully');
    },
    function(error) {
        console.error('Failed to set anonymous user:', error);
    }
);
```

**Notes**

- Anonymous users are counted towards your Monthly Active Users usage. You should take your account's MAU limit into consideration before applying this API.

### Trigger Experience

Triggers a specific experience programmatically using its ID. This API allows you to manually initiate an experience within your application.

##### &nbsp;&nbsp;&nbsp; API:

```js
triggerExperience(experienceId, onSuccess, onError)
```

##### &nbsp;&nbsp;&nbsp; Example:

```js
window.userpilot.triggerExperience('<EXPERIENCE_ID>',
    function(success) {
        console.log('Experience triggered successfully');
    },
    function(error) {
        console.error('Failed to trigger experience:', error);
    }
);
```

### End Experience

Ends the current active experience programmatically.

##### &nbsp;&nbsp;&nbsp; API:

```js
endExperience(onSuccess, onError)
```

##### &nbsp;&nbsp;&nbsp; Example:

```js
window.userpilot.endExperience(
    function(success) {
        console.log('Experience ended successfully');  
    },
    function(error) {
        console.error('Failed to end experience:', error);
    }
);
```

### Handle Deep Link URL

Checks if Userpilot can handle a given URL (typically from a deep link). Returns a boolean indicating whether the URL was handled by Userpilot.

##### &nbsp;&nbsp;&nbsp; API:

```js
didHandleUrl(url, onSuccess, onError)
```

##### &nbsp;&nbsp;&nbsp; Example:

```js
window.userpilot.didHandleUrl('userpilot-USERPILOT_TOKEN://sdk',
    function(handled) {
        if (handled) {
            console.log('URL was handled by Userpilot');
        } else {
            console.log('URL was not handled by Userpilot');
            // Handle the URL in your app
        }
    },
    function(error) {
        console.error('Failed to check URL:', error);
    }
);
```

**Notes**

- This API is useful when your app receives deep links to preview experience or handle push notifications and you want to check if Userpilot should handle them.
- The success callback receives a boolean value indicating whether Userpilot handled the URL.
- If `true`, Userpilot has handled the URL and triggered appropriate actions (e.g., showing an experience).
- If `false`, your app should handle the URL navigation.
- A URL passed before or during `setup` is held and forwarded once setup succeeds, so you do not have to order the two calls yourself. Up to 10 URLs wait at once, each for at most 10 seconds, after which the success callback receives `false` and your own routing runs. A failed setup answers held URLs the same way.
- Calling this is optional for experience previews: the plugin also receives URLs straight from Cordova, including the launch URL of a cold start, and holds one until `setup` if needed. Call it when your app routes on the result — a link the plugin already claimed is answered `true` without opening the preview twice.

#### SDK callbacks

Userpilot SDK provides three types of callbacks:

- Navigation Listener
- Analytics Listener
- Experience Listener

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

### SDK callbacks

Userpilot SDK provides three types of callbacks to help you handle navigation, analytics, and experience lifecycle events within your app, please refer to the [Observing SDK Callbacks](https://docs.userpilot.com/developer/installation/mobile/cordova/callbacks).

### Push Notification

Userpilot SDK supports handling push notifications to help you deliver targeted messages and enhance user engagement. For setup instructions, and integration details, please refer to the [Push Notification Guide](https://docs.userpilot.com/developer/installation/mobile/cordova/push-notifications).

### Auto Capture

Userpilot SDK supports automatic screen tracking to help you capture mobile screen views without manually sending screen events. please refer to the [Userpilot Documentation](https://docs.userpilot.com/developer/installation/mobile/mobile-cordova).

## 📝 Documentation

Full documentation is available at [Userpilot Documentation](https://docs.userpilot.com/developer/installation/mobile/cordova/installation).

## 🎬 Examples

The [`cordova-sample`](https://github.com/Userpilot/cordova-example) repository contains a full example Cordova app providing references for correct installation and usage of the Userpilot Plugin APIs.

## 📄 License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for more information.
