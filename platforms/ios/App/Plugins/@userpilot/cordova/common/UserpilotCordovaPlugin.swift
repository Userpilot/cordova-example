import Userpilot

/**
 A Cordova plugin that bridges the native Userpilot iOS SDK with JavaScript.

 This plugin exposes methods for initializing and interacting with the Userpilot SDK,
 allowing you to call `setup`, `identify`, `track`, `screen`, and other methods from
 JavaScript. It also provides support for registering callbacks to receive navigation,
 analytics, and experience events from the SDK.
 */
@objc(UserpilotCordovaPlugin)
class UserpilotCordovaPlugin: CDVPlugin {

    private static let LOG_TAG = "Userpilot Plugin"
    private static let pluginType = "PluginType"
    private static let pluginTypeCordova = "Cordova"
    private static let wrapperEnableScreenAutoCapture = "WrapperEnableScreenAutoCapture"
    private static let wrapperEnableInteractionAutoCapture = "WrapperEnableInteractionAutoCapture"
    private static var implementation: Userpilot?
    /// A URL that arrived before `setup`, replayed once the SDK exists.
    private static var pendingURL: URL?
    /// The last URL this plugin claimed on its own, so the host forwarding the
    /// same one is answered without opening the preview a second time.
    private static var autoHandledURL: URL?
    private var eventCallbackId: String?

    /**
     Supported actions that can be called from the JavaScript side.
     */
    private enum Action: String, CaseIterable {
        case setup = "setup"
        case identify = "identify"
        case anonymous = "anonymous"
        case logout = "logout"
        case screen = "screen"
        case track = "track"
        case trackAutoCaptureScreen = "trackAutoCaptureScreen"
        case trackAutoCaptureEvent = "trackAutoCaptureEvent"
        case triggerExperience = "triggerExperience"
        case endExperience = "endExperience"
        case didHandleUrl = "didHandleUrl"
        case registerCallbacks = "registerCallbacks"

        /// Resolves a string into a corresponding Action enum case.
        static func from(_ actionName: String) -> Action? {
            return Action(rawValue: actionName)
        }
    }

    /**
     Called when the plugin is first initialized by Cordova.
     */
    override func pluginInitialize() {
        super.pluginInitialize()
    }

    /**
     Initializes the Userpilot SDK with a given token and options.

     - Parameter command: A `CDVInvokedUrlCommand` containing the token at index 0 and options at index 1.
     */
    @objc func setup(_ command: CDVInvokedUrlCommand) {
        guard let token = command.arguments.first as? String, !token.isEmpty else {
            sendError("Invalid or missing token", command)
            return
        }

        // Extract options from second argument
        let options = command.arguments.count > 1 ? command.arguments[1] as? [String: Any] : [:]
        let isLogEnabled = options?["logging"] as? Bool ?? false
        let disableRequestPushPermission = options?["disableRequestPushNotificationsPermission"] as? Bool ?? false
        
        let config = Userpilot.Config(token: token).logging(enabled: isLogEnabled)
        if disableRequestPushPermission {
            config.disableRequestPushNotificationsPermission()
        }
        var additionalProperties: [String: Any] = [
            Self.pluginType: Self.pluginTypeCordova
        ]
        if let enableScreenAutoCapture = options?["enableScreenAutoCapture"] as? Bool {
            additionalProperties[Self.wrapperEnableScreenAutoCapture] = enableScreenAutoCapture
        }
        if let enableInteractionAutoCapture = options?["enableInteractionAutoCapture"] as? Bool {
            additionalProperties[Self.wrapperEnableInteractionAutoCapture] =
                enableInteractionAutoCapture
        }
        config.additionalProperties(additionalProperties)

        UserpilotCordovaPlugin.implementation = Userpilot(config: config)

        UserpilotCordovaPlugin.implementation?.navigationDelegate = self
        UserpilotCordovaPlugin.implementation?.analyticsDelegate = self
        UserpilotCordovaPlugin.implementation?.experienceDelegate = self

        handleStoredNativePush()
        handleStoredDeepLink()

        sendSuccess(command)
    }

    /**
     Registers a persistent callback for receiving native events.

     - Parameter command: A `CDVInvokedUrlCommand` with no arguments.
     */
    @objc func registerCallbacks(_ command: CDVInvokedUrlCommand) {
        eventCallbackId = command.callbackId

        let result = CDVPluginResult(status: CDVCommandStatus.noResult)
        result.setKeepCallbackAs(true)
        commandDelegate?.send(result, callbackId: command.callbackId)
    }

    /**
     Sends an event back to the JavaScript side via the registered callback.

     - Parameters:
        - category: The type of event, e.g. `UserpilotNavigationEvent`.
        - data: The event payload.
     */
    private func sendCallbackEvent(category: String, data: [String: Any]) {
        guard let callbackId = eventCallbackId else { return }

        let eventData: [String: Any] = [
            "category": category,
            "data": data
        ]

        let result = CDVPluginResult(status: CDVCommandStatus.ok, messageAs: eventData)
        result.setKeepCallbackAs(true)
        commandDelegate?.send(result, callbackId: callbackId)
    }

    /**
     Identifies a user with Userpilot using a user ID and optional properties.

     - Parameter command: A `CDVInvokedUrlCommand` containing user ID, user properties, and company data.
     */
    @objc func identify(_ command: CDVInvokedUrlCommand) {
        guard let userpilot = UserpilotCordovaPlugin.implementation else {
            sendError("Userpilot not initialized. Call setup first.", command)
            return
        }

        guard let userId = command.arguments.first as? String, !userId.isEmpty else {
            sendError("Invalid or missing user ID", command)
            return
        }

        let properties = command.arguments.count > 1 ? command.arguments[1] as? [String: Any] : nil
        let company = command.arguments.count > 2 ? command.arguments[2] as? [String: Any] : nil

        userpilot.identify(userId: userId, properties: properties, company: company)
        sendSuccess(command)
    }

    /**
     Switches to an anonymous user session.

     - Parameter command: A `CDVInvokedUrlCommand`.
     */
    @objc func anonymous(_ command: CDVInvokedUrlCommand) {
        guard let userpilot = UserpilotCordovaPlugin.implementation else {
            sendError("Userpilot not initialized. Call setup first.", command)
            return
        }

        userpilot.anonymous()
        sendSuccess(command)
    }

    /**
     Logs out the current user.

     - Parameter command: A `CDVInvokedUrlCommand`.
     */
    @objc func logout(_ command: CDVInvokedUrlCommand) {
        guard let userpilot = UserpilotCordovaPlugin.implementation else {
            sendError("Userpilot not initialized. Call setup first.", command)
            return
        }

        userpilot.logout()
        sendSuccess(command)
    }

    /**
     Tracks a screen visit.

     - Parameter command: A `CDVInvokedUrlCommand` with screen name at index 0.
     */
    @objc func screen(_ command: CDVInvokedUrlCommand) {
        guard let userpilot = UserpilotCordovaPlugin.implementation else {
            sendError("Userpilot not initialized. Call setup first.", command)
            return
        }

        guard let screenName = command.arguments.first as? String, !screenName.isEmpty else {
            sendError("Invalid or missing screen name", command)
            return
        }

        userpilot.screen(screenName)
        sendSuccess(command)
    }

    /**
     Tracks a custom event.

     - Parameter command: A `CDVInvokedUrlCommand` with event name and optional properties.
     */
    @objc func track(_ command: CDVInvokedUrlCommand) {
        guard let userpilot = UserpilotCordovaPlugin.implementation else {
            sendError("Userpilot not initialized. Call setup first.", command)
            return
        }

        guard let eventName = command.arguments.first as? String, !eventName.isEmpty else {
            sendError("Invalid or missing event name", command)
            return
        }

        let properties = command.arguments.count > 1 ? command.arguments[1] as? [String: Any] : nil
        userpilot.track(eventName: eventName, properties: properties)
        sendSuccess(command)
    }

    /**
     Reports an auto-captured screen view (DOM auto-capture) to the SDK.

     - Parameter command: A `CDVInvokedUrlCommand` with the screen title at index 0.
     */
    @objc func trackAutoCaptureScreen(_ command: CDVInvokedUrlCommand) {
        guard let userpilot = UserpilotCordovaPlugin.implementation else {
            sendError("Userpilot not initialized. Call setup first.", command)
            return
        }

        guard let title = command.arguments.first as? String, !title.isEmpty else {
            sendError("Invalid or missing screen title", command)
            return
        }

        userpilot.trackExternalAutoCaptureScreen(title)
        sendSuccess(command)
    }

    /**
     Reports an auto-captured interaction event (DOM auto-capture) to the SDK.

     - Parameter command: A `CDVInvokedUrlCommand` with the event type at index 0 and properties at index 1.
     */
    @objc func trackAutoCaptureEvent(_ command: CDVInvokedUrlCommand) {
        guard let userpilot = UserpilotCordovaPlugin.implementation else {
            sendError("Userpilot not initialized. Call setup first.", command)
            return
        }

        guard let eventType = command.arguments.first as? String, !eventType.isEmpty else {
            sendError("Invalid or missing eventType", command)
            return
        }

        let properties = command.arguments.count > 1 ? command.arguments[1] as? [String: Any] : nil

        userpilot.trackExternalAutoCaptureEvent(
            eventName: eventType,
            properties: properties
        )
        sendSuccess(command)
    }

    /**
     Trigger Experience.

     - Parameter command: A `CDVInvokedUrlCommand` with screen name at index 0.
     */
    @objc func triggerExperience(_ command: CDVInvokedUrlCommand) {
        guard let userpilot = UserpilotCordovaPlugin.implementation else {
            sendError("Userpilot not initialized. Call setup first.", command)
            return
        }

        guard let experienceId = command.arguments.first as? String, !experienceId.isEmpty else {
            sendError("Invalid or missing experienceId", command)
            return
        }

        userpilot.triggerExperience(experienceId)
        sendSuccess(command)
    }

    /**
     End Experience.

     - Parameter command: A `CDVInvokedUrlCommand`.
     */
    @objc func endExperience(_ command: CDVInvokedUrlCommand) {
        guard let userpilot = UserpilotCordovaPlugin.implementation else {
            sendError("Userpilot not initialized. Call setup first.", command)
            return
        }

        userpilot.endExperience()
        sendSuccess(command)
    }

    /**
     Handles the URL handling by Userpilot.

     - Parameter command: A `CDVInvokedUrlCommand` with URL at index 0.
     */
    @objc func didHandleUrl(_ command: CDVInvokedUrlCommand) {
        guard let urlString = command.arguments.first as? String, !urlString.isEmpty, let url = URL(string: urlString) else {
            sendError("Invalid or missing URL", command)
            return
        }

        // Already claimed from `handleOpenURL` - answer the host truthfully
        // instead of asking the SDK to open the same preview twice.
        if url == Self.autoHandledURL {
            Self.autoHandledURL = nil
            sendHandled(true, command)
            return
        }

        guard let userpilot = UserpilotCordovaPlugin.implementation else {
            // Hold it for `setup` rather than failing the call: a launch URL
            // reaches the host app long before setup completes, and a failure
            // here is a link the user scanned and never got.
            Self.pendingURL = url
            sendHandled(false, command)
            return
        }

        sendHandled(userpilot.didHandleURL(url), command)
    }

    /**
     Receives every URL opened against the app.

     Cordova posts `CDVPluginHandleOpenURLNotification` to every plugin, for a
     cold launch (`scene(_:willConnectTo:options:)`) as much as a warm one, so
     the SDK no longer depends on the host app forwarding the link. Unlike
     React Native and Flutter, Cordova has no way to ask for the launch URL
     later: it is pushed exactly once and then forgotten, so a link that
     arrives before `setup` has to be held here.
     */
    override func handleOpenURL(_ notification: Notification) {
        guard let url = notification.object as? URL else { return }

        guard let userpilot = UserpilotCordovaPlugin.implementation else {
            // One slot: a newer link supersedes one the SDK never got to see.
            Self.pendingURL = url
            return
        }

        if userpilot.didHandleURL(url) {
            // Remembered so the host forwarding the same link through
            // `didHandleUrl` is answered without re-triggering the preview.
            Self.autoHandledURL = url
        }
    }

    /// Replays the link held while the SDK did not exist yet. Called at setup.
    private func handleStoredDeepLink() {
        guard let url = Self.pendingURL else { return }
        Self.pendingURL = nil

        if Self.implementation?.didHandleURL(url) == true {
            Self.autoHandledURL = url
        }
    }

    /**
     Sends a boolean result back to JavaScript.

     - Parameters:
        - handled: Whether Userpilot claimed the URL.
        - command: The original command to respond to.
     */
    private func sendHandled(_ handled: Bool, _ command: CDVInvokedUrlCommand) {
        let result = CDVPluginResult(status: CDVCommandStatus.ok, messageAs: handled)
        commandDelegate?.send(result, callbackId: command.callbackId)
    }

    /**
     Sends a success result back to JavaScript.

     - Parameter command: The original command to respond to.
     */
    private func sendSuccess(_ command: CDVInvokedUrlCommand) {
        let result = CDVPluginResult(status: CDVCommandStatus.ok)
        commandDelegate?.send(result, callbackId: command.callbackId)
    }

    /**
     Sends an error result back to JavaScript.

     - Parameters:
        - message: The error message.
        - command: The original command to respond to.
     */
    private func sendError(_ message: String, _ command: CDVInvokedUrlCommand) {
        NSLog("\(UserpilotCordovaPlugin.LOG_TAG): \(message)")
        let result = CDVPluginResult(status: CDVCommandStatus.error, messageAs: message)
        commandDelegate?.send(result, callbackId: command.callbackId)
    }
}

/**
 Handles Push Notifications.
 */
extension UserpilotCordovaPlugin {
    private static var pushToken: Data?
    private static var notificationResponse: UNNotificationResponse?

    @objc
    public static func setPushToken(_ deviceToken: Data?) {
        guard let implementation = Self.implementation else {
            Self.pushToken = deviceToken
            return
        }

        implementation.setPushToken(deviceToken)
    }

    @objc
    public static func didReceiveNotification(
        response: UNNotificationResponse,
        completionHandler: @escaping () -> Void
    ) -> Bool {
        guard let implementation = Self.implementation else {
            Self.notificationResponse = response
            return false
        }

        return implementation.didReceiveNotification(
            response: response,
            completionHandler: completionHandler
        )
    }

    // To be called at setup
    private func handleStoredNativePush() {
        if let pushToken = Self.pushToken {
            Self.implementation?.setPushToken(pushToken)
        }
        if let notification = Self.notificationResponse {
            _ = Self.implementation?.didReceiveNotification(
                response: notification,
                completionHandler: {}
            )
        }
    }
}

/**
 Handles navigation events triggered by Userpilot experiences.
 */
extension UserpilotCordovaPlugin: UserpilotNavigationDelegate {
    public func navigate(to url: URL) {
        sendCallbackEvent(category: "UserpilotNavigationEvent", data: ["url": url.absoluteString])
    }
}

/**
 Handles analytics events triggered by the Userpilot SDK.
 */
extension UserpilotCordovaPlugin: UserpilotAnalyticsDelegate {
    public func didTrack(analytic: UserpilotAnalytic, value: String, properties: [String : Any]?) {
        let analyticName: String = {
            switch analytic {
            case .event: return "Event"
            case .screen: return "Screen"
            case .identify: return "Identify"
            }
        }()

        sendCallbackEvent(
            category: "UserpilotAnalyticsEvent",
            data: [
                "analytic": analyticName,
                "value": value,
                "properties": properties ?? [:]
            ]
        )
    }
}

/**
 Handles experience lifecycle and step events triggered by Userpilot experiences.
 */
extension UserpilotCordovaPlugin: UserpilotExperienceDelegate {
    public func onExperienceStateChanged(
        experienceType: UserpilotExperienceType,
        experienceId: NSNumber?,
        experienceState: UserpilotExperienceState
    ) {
        let experienceTypeName: String = {
            switch experienceType {
            case .flow: return "Flow"
            case .survey: return "Survey"
            case .nps: return "NPS"
            }
        }()

        let experienceStateName: String = {
            switch experienceState {
            case .started: return "Started"
            case .dismissed: return "Dismissed"
            case .completed: return "Completed"
            case .skipped: return "Skipped"
            case .submitted: return "Submitted"
            }
        }()

        var data: [String: Any] = [
            "experienceType": experienceTypeName,
            "experienceState": experienceStateName
        ]

        if let id = experienceId?.intValue {
            data["experienceId"] = id
        }

        sendCallbackEvent(category: "UserpilotExperienceEvent", data: data)
    }

    public func onExperienceStepStateChanged(
        experienceType: UserpilotExperienceType,
        experienceId: NSNumber,
        stepId: NSNumber,
        stepState: UserpilotExperienceState,
        step: NSNumber?,
        totalSteps: NSNumber?
    ) {
        let experienceTypeName: String = {
            switch experienceType {
            case .flow: return "Flow"
            case .survey: return "Survey"
            case .nps: return "NPS"
            }
        }()

        let experienceStateName: String = {
            switch stepState {
            case .started: return "Started"
            case .dismissed: return "Dismissed"
            case .completed: return "Completed"
            case .skipped: return "Skipped"
            case .submitted: return "Submitted"
            }
        }()

        var data: [String: Any] = [
            "experienceType": experienceTypeName,
            "experienceId": experienceId.intValue,
            "stepId": stepId.intValue,
            "stepState": experienceStateName
        ]

        if let stepValue = step?.intValue {
            data["step"] = stepValue
        }

        if let totalValue = totalSteps?.intValue {
            data["totalSteps"] = totalValue
        }

        sendCallbackEvent(category: "UserpilotExperienceEvent", data: data)
    }
}
