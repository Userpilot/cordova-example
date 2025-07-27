# Cordova Quickstart for Userpilot SDK

[![GitHub](https://img.shields.io/badge/GitHub-cordova--plugin--userpilot-blue)](https://github.com/Userpilot/cordova-plugin)

Userpilot lets you add user analytics and in-app experiences to your mobile app. Capture user insights and deliver personalized experiences in real time with advanced segmentation, flow analytics, and engagement tracking.

This repo contains an example Cordova app that has everything you need to get started with the Userpilot Cordova Plugin.

For information about how to get started with Cordova SDK, please check this [Guide](https://docs.userpilot.com/developer/installation/mobile/mobile-cordova).

## How to get started?

### Create Userpilot Account
Sign up for [Userpilot](https://userpilot.com) and get your app token from the [Setup page](https://run.userpilot.io/environment).

### Set up the environment
- Install [Cordova CLI](https://cordova.apache.org/docs/en/latest/guide/cli/)
- Set up [development environment](https://cordova.apache.org/docs/en/latest/guide/platforms/)

### Clone Quickstart app
```bash
git clone https://github.com/Userpilot/cordova-example.git
cd UserpilotSample
```

### Install Dependencies

#### General Dependencies
```bash
npm install
```

#### iOS dependencies
Quickstart app uses CocoaPods dependency manager to install the latest version of the iOS SDK. Using the latest version of CocoaPods is advised.

If you don't have CocoaPods, [install it first](https://guides.cocoapods.org/using/getting-started.html).

```bash
cd platforms/ios
pod install
```

### Add platforms
```bash
cordova platform add android
cordova platform add ios
```

### Configure Android platform
Add build params to `platforms/android/gradle.properties`:
```properties
android.useAndroidX=true
android.enableJetifier=true
```

### Update the app token and configuration
Configure the Userpilot SDK settings:

1. Open `www/js/index.js`
2. Replace `'APP_TOKEN'` with your actual Userpilot token:
   ```js
   const token = 'APP_TOKEN';
   ```
3. Customize the configuration options as needed:
   ```js
   const options = {
       logging: true,        // Set to false for production
       useInAppBrowser: true // Set to true to use in-app browser
   };
   ```

## Run the app

### Build the app
```bash
cordova build
```

### Android
```bash
cordova run android
```

### iOS
1. Open the app's workspace file (`platforms/ios/UserpilotSample.xcworkspace`) with Xcode.
2. Select your device (SDK requires real device for full functionality).
3. Hit Run.

**If you have "Unsupported Swift Version" error:**
- Set Build Settings > Swift Compiler - Language > Swift version to the latest version

## Using the Sample App

### 1. Initialize Userpilot
Press the **"Setup"** button to initialize the Userpilot SDK with your app token and configuration options:
- **Logging enabled**: Debug logging is turned on for development
- **In-app browser disabled**: Links will open in external browser instead of in-app

### 2. Register for Callbacks
Press **"Register Callbacks"** to start receiving SDK events in real-time.

### 3. Identify Users
Press **"Identify"** to identify a sample user. This associates subsequent events with that user.

### 4. User Sessions
- **"Anonymous"** - Switch to anonymous user tracking

### 5. Track Events
- **"Track"** - Log a custom event with properties (randomly selects from 3 different event types)
- **"Screen"** - Track screen views for analytics (randomly selects from 5 screen names)

### 6. Experience Management
- **"Trigger Experience"** - Manually trigger a specific experience
- **"End Experience"** - End the current active experience

### 7. User Management
- **"Logout"** - Clear current user context

### 6. Monitor SDK Events
Watch the **"SDK Callbacks"** section to see real-time events from the Userpilot SDK:
- **Navigation Events** - Deep link triggers
- **Analytics Events** - Event tracking confirmations  
- **Experience Events** - In-app experience state changes

## Features Demonstrated

### Core SDK APIs
- ✅ SDK initialization with token
- ✅ User identification with properties
- ✅ Anonymous user tracking
- ✅ Event tracking with metadata (3 different event types)
- ✅ Screen view tracking (5 different screen names)
- ✅ Experience triggering and management
- ✅ User logout functionality

### Real-time Callbacks
- ✅ Navigation event handling
- ✅ Analytics event monitoring
- ✅ Experience lifecycle tracking
- ✅ Real-time event display

### Sample Data
The app includes sample data for testing:
- **Sample user**: `user123` with name, email, and role
- **Sample company**: `company123` with plan details
- **Sample events** (randomly selected):
  - `button_clicked` - Button interaction tracking
  - `page_viewed` - Page view with duration metrics
  - `feature_used` - Feature usage with success status
- **Sample screens** (randomly selected): `main`, `screen one`, `screen two`, `events`, `identify`
- **Sample experience**: `experience_123` for testing experience triggers

## File Structure

```
UserpilotSample/
├── www/
│   ├── index.html          # Main app interface
│   ├── js/
│   │   └── index.js        # Core app logic & Userpilot integration
│   └── css/
│       └── index.css       # App styling
├── config.xml              # Cordova configuration
├── package.json            # Dependencies
└── plugins/
    └── @userpilot/cordova  # Userpilot plugin
```

## Troubleshooting

### Plugin not found
If you see "Userpilot plugin not found":
1. Ensure the plugin is installed: `cordova plugin list`
2. Reinstall if needed: `cordova plugin remove @userpilot/cordova && cordova plugin add @userpilot/cordova`
3. Clean and rebuild: `cordova clean && cordova build`

### Class not found (Android)
If you see "ClassNotFoundException":
1. Remove and re-add the plugin
2. Clean the project: `cordova clean`
3. Rebuild: `cordova build android`

### Build errors
- **Android**: Ensure `android-compileSdkVersion` is 35+ in `config.xml`
- **iOS**: Ensure deployment target is 13.0+ in `config.xml`

## Next Steps

1. **Get your token**: Replace the sample token with your actual Userpilot app token
2. **Configure options**: Adjust `logging` and `useInAppBrowser` based on your app requirements
3. **Customize events**: Modify the sample events to match your app's user actions
4. **Add screens**: Track all important screens in your user journey
5. **Set up experiences**: Create in-app experiences in the Userpilot dashboard and replace `experience_123` with actual experience IDs
6. **Test callbacks**: Use the callback system to handle deep links and track user engagement
7. **Anonymous tracking**: Implement anonymous user flows for pre-signup experiences

## Support

- 📚 [Documentation](https://docs.userpilot.com)
- 💬 [Support](dev@userpilot.com)
- 🌐 [Userpilot Dashboard](https://run.userpilot.io) 