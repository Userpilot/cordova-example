# Configuring the Userpilot URL Scheme

Userpilot Cordova Plugin supports a custom URL scheme for previewing Userpilot experiences and handling push notifications.

## Prerequisites

Your application must be set up to handle incoming custom URL scheme links. The example application in this repository provides one possible approach using its own bridge to the native code to handle links. For the Userpilot SDK to check for and handle deep links, the entire link URL must be passed through to the SDK, not just the path segment.

## Register the Custom URL Scheme

Add the Userpilot scheme to your project configuration. Replace `USERPILOT_TOKEN` in the snippet below with the Userpilot token your app is initialized with. For example, if your Userpilot token is `NX-12345678` your url scheme value would be `userpilot-nx-12345678`.

## Handle the Custom URL Scheme
This scheme will be used by the operating system to route deep links back to your app and forward them to the Userpilot SDK.


## Handle the Custom URL Scheme

To handle deep links in a Cordova app, we will use **`cordova-plugin-deeplinks`**.

### Install the Deep Links Plugin

```shell
cordova plugin add cordova-plugin-deeplinks
```

### Configure the Plugin

Add the following configuration to your package.json.
Make sure to replace USERPILOT_TOKEN with your actual token.

inside package.json 
```json
"plugins": {
      "@userpilot/cordova": {
        "DEPLOYMENT-TARGET": "13.0"
      },
      "cordova-plugin-deeplinks": {
        "URL_SCHEME": "userpilot-USERPILOT_TOKEN",
        "DEEPLINK_HOST": "sdk",
        "ANDROID_PATH_PREFIX": "/"
      }
    }
```

### Generated config.xml Configuration

Based on the plugin configuration above, Cordova will automatically add the following entry to your config.xml file:


this will add a new configuration inside config.xml file 
```xml
<!-- Deep Links Configuration for cordova-plugin-deeplinks -->
<universal-links>
    <host name="sdk" scheme="userpilot-USERPILOT_TOKEN" event="deeplink" />
</universal-links>
```

**Native Platform Configuration**

After building the project, the deep link configuration will be reflected in the native platform files.

iOS - in Info.plist:
```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleTypeRole</key>
        <string>Editor</string>
        <key>CFBundleURLName</key>
        <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>userpilot-USERPILOT_TOKEN</string>
        </array>
    </dict>
</array>
```

Android - in AndroidManifest.xml for the main Activity:
```xml
<activity
    android:name="..."
    android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
    </intent-filter>
    <intent-filter>
        <data android:scheme="userpilot-USERPILOT_TOKEN"/>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
    </intent-filter>
</activity>
```

### Handling Deep Links in JavaScript

Once the native configuration is in place, you can capture incoming deep links and forward them to the Userpilot SDK.

**Experience previews work without any of this.** The plugin loads at app start and receives every URL opened against the app directly from Cordova, including the one the app was launched with, so a QR code scanned while the app was closed opens its preview even if your app forwards nothing. A link that arrives before `setup` is held and replayed once the SDK exists.

Forward URLs anyway if your app routes on the result: `didHandleUrl` tells you whether Userpilot claimed the link, so you know when to fall through to your own routing. It no longer needs to be ordered against `setup` — a URL passed before or during setup is held and answered once setup succeeds; up to 10 URLs wait at once, each for at most 10 seconds, after which the success callback receives `false` so your own routing still runs. A link the plugin already claimed on its own is answered `true` without opening the preview twice. The example below keeps its own `pendingDeepLinkUrl` slot, which is now belt and braces rather than a requirement.

``` js
// Track if Userpilot SDK is initialized
var isUserpilotInitialized = false;
var pendingDeepLinkUrl = null;

// Auto-initialize Userpilot SDK on app start
function initializeUserpilot() {
    const token = 'APP_TOKEN';
    const options = {
        logging: true,
        useInAppBrowser: false,
        disableRequestPushNotificationsPermission: false
    };
    
    logOutput('Initializing Userpilot SDK...');
    
    const plugin = getUserpilotPlugin();
    if (!plugin) {
        logOutput('Userpilot plugin not found.');
        return;
    }
    
    plugin.setup(
        token,
        options,
        function(result) {
            logOutput('Userpilot SDK initialized successfully');
            isUserpilotInitialized = true;
            
            // Setup deep link handler after SDK is initialized
            setupDeepLinkHandler();
            
            // Process any pending deep link that arrived before initialization
            if (pendingDeepLinkUrl) {
                logOutput('Processing pending deep link: ' + pendingDeepLinkUrl);
                processDeepLink(pendingDeepLinkUrl);
                pendingDeepLinkUrl = null;
            }
        },
        function(error) {
            logOutput('Userpilot SDK setup error: ' + JSON.stringify(error));
        }
    );
}

// Process deep link URL through Userpilot plugin
function processDeepLink(url) {
    if (!url) return;
    
    // If Userpilot is not initialized yet, store the URL for later
    if (!isUserpilotInitialized) {
        logOutput('Userpilot not initialized yet, storing deep link for later: ' + url);
        pendingDeepLinkUrl = url;
        return;
    }
    
    logOutput('Processing deep link: ' + url);
    
    const plugin = getUserpilotPlugin();
    if (!plugin) {
        logOutput('Userpilot plugin not found. Cannot handle deep link.');
        return;
    }
    
    // Userpilot API
    plugin.didHandleUrl(
        url,
        function(result) {
            var handled = result === true || result === 'true';
            logOutput('Userpilot didHandleUrl result: ' + handled);
            
            if (!handled) {
                // URL was not handled by Userpilot, you can add custom handling here
                logOutput('Deep link not handled by Userpilot. Custom handling can be added here.');
                handleCustomDeepLink(url);
            }
        },
        function(error) {
            logOutput('Userpilot didHandleUrl error: ' + JSON.stringify(error));
        }
    );
}

// Custom deep link handler for URLs not handled by Userpilot
function handleCustomDeepLink(url) {
    // Parse the URL and handle custom schemes/paths
    try {
        var urlParts = url.replace(/.*?:\/\//g, '').split('/');
        var action = urlParts[0] || '';
        var params = urlParts.slice(1);
        
        logOutput('Custom deep link - Action: ' + action + ', Params: ' + JSON.stringify(params));
        
        // Add your custom deep link handling logic here
        // For example, navigate to a specific screen based on action
    } catch (e) {
        logOutput('Error parsing custom deep link: ' + e.message);
    }
}

// Setup deep link handler using cordova-plugin-deeplinks
function setupDeepLinkHandler() {
    // Check if universalLinks plugin is available
    if (typeof universalLinks === 'undefined' && !(window.plugins && window.plugins.universalLinks)) {
        logOutput('universalLinks plugin not found');
        return;
    }
    
    var ulPlugin = universalLinks || window.plugins.universalLinks;
    
    logOutput('Setting up deep link handler...');
    
    // Subscribe to the 'deeplink' event (configured in config.xml)
    ulPlugin.subscribe('deeplink', function(eventData) {
        console.log('Deep link received:', JSON.stringify(eventData));
        logOutput('Deep link received: ' + JSON.stringify(eventData));
        
        // eventData contains: { url, host, path, scheme, hash, ... }
        // Pass the full URL to userpilot.didHandleUrl
        var fullUrl = eventData.url;
        processDeepLink(fullUrl);
    });
    
    logOutput('Deep link handler registered for event: deeplink');
}
```