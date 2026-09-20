# Push Notifications

Configure push notifications to receive, display, and handle Userpilot push notifications on Android and iOS.

The Userpilot SDK supports push notifications to help you deliver targeted messages and enhance user engagement.

## Android Setup

### Prerequisites

Configure your Android push settings in the [Userpilot Settings Studio](https://run.userpilot.io/settings/mobile) before setting up push notifications in your app.

To obtain the required keys and configuration details, refer to the [Android Push Notification Guide](./android-push-notification-setup-guide).

### Setup

This guide assumes this is the first time you're adding push notification code to your project using Google services (Firebase Cloud Messaging). If your project is already configured for push, proceed to Step 2.

**Step 1. Add Firebase**

Follow the steps in the official Google documentation on [How to add Firebase to your project](https://firebase.google.com/docs/android/setup).

**Step 2. Request Notifications Permission**

Starting from Android 13 (API level 33), apps must explicitly request the `POST_NOTIFICATIONS` permission to display push notifications.

The Userpilot Flutter plugin **automatically** requests push notifications permission on its own.

**Step 3. Add the Userpilot Firebase Messaging Service**

Firebase connects to your app through a `<service>`. Go to your Manifest file under `example -> android -> app -> manifest` and add:

```xml
<service
    android:name="com.userpilot.pushNotifications.UserpilotFirebaseMessagingService"
    android:exported="false">
    <intent-filter>
        <action android:name="com.google.firebase.MESSAGING_EVENT" />
    </intent-filter>
</service>
```

If your project already has a child of `FirebaseMessagingService`, you can leave it as is and instead plug in `UserpilotFirebaseMessagingService` to your service class.

```kotlin
import com.userpilot.pushNotifications.UserpilotFirebaseMessagingService
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class CustomFirebaseMessageService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        if (UserpilotFirebaseMessagingService.handleMessage(baseContext, message)) {
            // handled as Userpilot message
            return
        }

        // not Userpilot message
        super.onMessageReceived(message)
    }

    override fun onNewToken(token: String) {
        // sets new token from the callback
        UserpilotFirebaseMessagingService.setToken(token)

        super.onNewToken(token)
    }
}
```

**Step 4. Deep Linking**

To ensure your app opens automatically when a Userpilot push notification is tapped, you must configure deep linking by setting up a custom URL scheme.
Follow the guide here: **Configuring the Userpilot URL Scheme**.

**Step 5. Customization**

The Userpilot SDK allows customization for how messages are delivered. These properties are set as `<resources>` values. To change them, create a file under `res/values` under `example -> android -> app` and set the desired values.

```xml
<resources>
    <!-- Small icon displayed in the notification bar -->
    <drawable name="userpilot_notification_small_icon">@drawable/ic_notification</drawable>

    <!-- Accent color applied to notification UI elements -->
    <color name="userpilot_notification_color">#6765E8</color>

    <!-- Determines if notifications are visible on the lock screen (true = visible) -->
    <bool name="userpilot_notification_channel_lock_screen_visibility">true</bool>

    <!-- Enables notification lights for the channel -->
    <bool name="userpilot_notification_channel_enable_light">true</bool>

    <!-- Enables vibration for the notifications -->
    <bool name="userpilot_notification_channel_enable_vibration">true</bool>

    <!-- Unique ID for the notification channel -->
    <string name="userpilot_notification_channel_id">com.userpilot.general.channel</string>

    <!-- Human-readable name for the notification channel -->
    <string name="userpilot_notification_channel_name">General</string>

    <!-- Description shown to the user about this notification channel -->
    <string name="userpilot_notification_channel_description">Default channel used for app messages</string>

    <!-- Importance level of the notification channel (0 = NONE, 5 = MAX) -->
    <integer name="userpilot_notification_channel_importance">3</integer>

    <!-- Key used to identify Userpilot push notifications OR user default scheme using userpilot-USERPILOT_TOKEN -->
    <string name="userpilot_custom_scheme"/>

</resources>
```

## iOS Setup

### Prerequisites

Configure your iOS push settings in the [Userpilot Settings Studio](https://run.userpilot.io/settings/mobile) before setting up push notifications in your app.

To obtain the required keys and configuration details, refer to the [iOS Push Notification Guide](./ios-push-notification-setup-guide).

### Enabling Push Notification Capabilities

In Xcode, navigate to the **Signing & Capabilities** section of your main app target and add the **Push Notifications** capability.

### Configuration

The Userpilot iOS SDK supports receiving push notifications so you can reach your users whenever the moment is right.

There are two options for configuring push notifications: automatic or manual.

Automatic configuration is the quickest and simplest way to configure push notifications and is recommended for most customers.

### Automatic Configuration

Automatic configuration takes advantage of swizzling to automatically provide the necessary implementations of the required `UIApplicationDelegate` and `UNUserNotificationCenterDelegate` methods.

To enable automatic configuration, call `Userpilot.enableAutomaticPushConfig()` from `UIApplicationDelegate.application(_:didFinishLaunchingWithOptions:)` inside `example -> ios -> AppDelegate.swift`.

```swift
func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
) -> Bool {
    // Automatically configure for push notifications
    Userpilot.enableAutomaticPushConfig()

    // Override point for customization after application launch
    return true
}
```

Automatic configuration seamlessly integrates with your app's existing push notification handling. It processes only Userpilot notifications, while ensuring that all other notifications continue to be handled by your app's original logic.

### Manual Configuration

**Step 1. Enable Push Capabilities**  
**Step 2. Register for Push Notifications**  
**Step 3. Set Push Token for Userpilot**  
**Step 4. Enable Push Response Handling**  
**Step 5. Configure Foreground Handling**

Full source code:

```swift
// AppDelegate+PushNotification.swift

import Foundation
import UserNotifications
import userpilot_flutter

extension AppDelegate {
    /// Call from `UIApplicationDelegate.application(_:didFinishLaunchingWithOptions:)`
    func setupPush(application: UIApplication) {
        requestPushNotificationPermission()

        // 1: Register to get a device token
        application.registerForRemoteNotifications()
        
        UNUserNotificationCenter.current().delegate = self
    }
    
    // MARK: - Push Notification Permission Request
    private func requestPushNotificationPermission() {
        let options: UNAuthorizationOptions = [.alert, .sound, .badge]

        // Check if the app has already been authorized
        UNUserNotificationCenter.current().getNotificationSettings { (settings) in
            if settings.authorizationStatus == .authorized {
                // App is already authorized for push notifications
                // Register for remote notifications again to get the device token
                DispatchQueue.main.async {
                    UIApplication.shared.registerForRemoteNotifications()
                }
            } else {
                // If not authorized, request permission
                UNUserNotificationCenter.current().requestAuthorization(options: options) { (granted, error) in
                    if granted {
                        DispatchQueue.main.async {
                            UIApplication.shared.registerForRemoteNotifications()
                        }
                    } else {
                        if let errorDescription = error?.localizedDescription {
                            print("Permission denied or failed to request: \(errorDescription)")
                        } else {
                            print("Permission denied or failed to request: Unknown error")
                        }
                    }
                }
            }
        }
    }

    // 2: Pass device token to Userpilot
    override func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        UserpilotFlutterPlugin.setPushToken(deviceToken)
    }
    
    // 3: Pass the user's response to a delivered notification to Userpilot
    override func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        if UserpilotFlutterPlugin.didReceiveNotification(response: response, completionHandler: completionHandler) {
            return
        }
        
        super.userNotificationCenter(center, didReceive: response, withCompletionHandler: completionHandler)
    }
    
    // 4: Configure handling for notifications that arrive while the app is in the foreground
    override func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        if #available(iOS 14.0, *) {
            completionHandler([.banner, .list])
        } else {
            completionHandler(.alert)
        }
    }
}
```

Call it from 
```swift
func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
) -> Bool {
    // Manual configure for push notifications
    setupPush(application: application)

    // Override point for customization after application launch
    return true
}
```

