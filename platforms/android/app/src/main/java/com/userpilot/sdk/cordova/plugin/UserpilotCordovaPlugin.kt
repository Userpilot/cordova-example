package com.userpilot.sdk.cordova.plugin

import org.apache.cordova.CallbackContext
import org.apache.cordova.CordovaPlugin
import org.apache.cordova.PluginResult
import android.content.Context
import android.content.Intent
import com.userpilot.Userpilot
import com.userpilot.utilities.helper.Payload
import com.userpilot.interfaces.UserpilotNavigationHandler
import com.userpilot.interfaces.UserpilotExperienceListener
import com.userpilot.interfaces.UserpilotAnalyticsListener
import com.userpilot.interfaces.UserpilotAnalytic
import com.userpilot.interfaces.UserpilotExperienceState
import com.userpilot.interfaces.UserpilotExperienceType
import com.userpilot.utilities.helper.UserpilotMessageKeys
import android.net.Uri
import org.apache.cordova.LOG
import org.json.JSONArray
import org.json.JSONObject
/**
 * A Cordova plugin to bridge the native Userpilot Android SDK with JavaScript code in a Cordova app.
 * Provides actions such as setup, identify, track, screen, and more, and listens to various Userpilot
 * lifecycle and analytic events to communicate back to the web layer.
 */
class UserpilotCordovaPlugin : CordovaPlugin() {

    companion object {
        private const val LOG_TAG = "Userpilot Plugin"
        private const val PLUGIN_TYPE = "PluginType"
        private const val PLUGIN_TYPE_CORDOVA = "Cordova"
        private const val WRAPPER_ENABLE_SCREEN_AUTO_CAPTURE =
            "WrapperEnableScreenAutoCapture"
        private const val WRAPPER_ENABLE_INTERACTION_AUTO_CAPTURE =
            "WrapperEnableInteractionAutoCapture"
        private var userpilot: Userpilot? = null

        /** A link that arrived before [setup], replayed once the SDK exists. */
        private var pendingUrl: Uri? = null

        /**
         * The last link this plugin claimed on its own, so the host forwarding
         * the same one is answered without opening the preview a second time.
         */
        private var autoHandledUrl: Uri? = null
    }

    private var eventCallbackContext: CallbackContext? = null

    private enum class Action(val actionName: String) {
        SETUP("setup"),
        IDENTIFY("identify"),
        ANONYMOUS("anonymous"),
        LOGOUT("logout"),
        SCREEN("screen"),
        TRACK("track"),
        TRACK_AUTO_CAPTURE_SCREEN("trackAutoCaptureScreen"),
        TRACK_AUTO_CAPTURE_EVENT("trackAutoCaptureEvent"),
        TRIGGER_EXPERIENCE("triggerExperience"),
        END_EXPERIENCE("endExperience"),
        DID_HANDLE_URL("didHandleUrl"),
        REGISTER_CALLBACKS("registerCallbacks");

        companion object {
            private val lookup = entries.associateBy { it.actionName }

            /**
             * Gets the enum constant corresponding to a given action name.
             *
             * @param name The action name as a string.
             * @return The [Action] enum value or null if not found.
             */
            fun get(name: String): Action? = lookup[name]
        }
    }

    /**
     * Logs an error and returns it via the callback.
     *
     * @param cbCtx The callback context to send the error to.
     * @param message The error message.
     */
    private fun error(cbCtx: CallbackContext, message: String) {
        LOG.e(LOG_TAG, message)
        cbCtx.error(message)
    }

    /**
     * Executes the given Cordova action.
     *
     * @param action The action name from JavaScript.
     * @param args Arguments passed from JavaScript.
     * @param cbCtx The callback context used to return data.
     * @return true if the action was handled; false otherwise.
     */
    override fun execute(action: String, args: JSONArray, cbCtx: CallbackContext): Boolean {
        val act = Action.get(action)

        if (act == null) {
            error(cbCtx, "unknown action: $action")
            return false
        }

        if (userpilot == null && act != Action.SETUP && act != Action.REGISTER_CALLBACKS) {
            error(cbCtx, "you must initialize userpilot first using \"setup\" action")
            return false
        }

        return when (act) {
            Action.SETUP -> setup(args, cbCtx)
            Action.IDENTIFY -> identify(args, cbCtx)
            Action.ANONYMOUS -> anonymous(args, cbCtx)
            Action.LOGOUT -> logout(args, cbCtx)
            Action.SCREEN -> screen(args, cbCtx)
            Action.TRACK -> track(args, cbCtx)
            Action.TRACK_AUTO_CAPTURE_SCREEN -> trackAutoCaptureScreen(args, cbCtx)
            Action.TRACK_AUTO_CAPTURE_EVENT -> trackAutoCaptureEvent(args, cbCtx)
            Action.TRIGGER_EXPERIENCE -> triggerExperience(args, cbCtx)
            Action.END_EXPERIENCE -> endExperience(args, cbCtx)
            Action.DID_HANDLE_URL -> didHandleUrl(args, cbCtx)
            Action.REGISTER_CALLBACKS -> registerCallbacks(args, cbCtx)
        }
    }

    /**
     * Cleans up resources when the plugin is destroyed.
     */
    override fun onDestroy() {
        super.onDestroy()
        eventCallbackContext = null
    }

        /**
     * Handles the setup of the Userpilot SDK.
     *
     * @param args JSONArray containing the token and options.
     * @param cbCtx The callback context for response.
     * @return true if setup is successful.
     */
    private fun setup(args: JSONArray, cbCtx: CallbackContext): Boolean {
        val token = args.optString(0, "")
        val options = args.optJSONObject(1) ?: JSONObject()
        val ctx: Context = cordova.activity
        
        // Extract options
        val isLogEnabled = options.optBoolean("logging", false)
        val isInAppBrowserEnabled = options.optBoolean("useInAppBrowser", false)
        val disableRequestPushPermission = options.optBoolean("disableRequestPushNotificationsPermission", false)
        val additionalProperties = mutableMapOf<String, Any>(
            PLUGIN_TYPE to PLUGIN_TYPE_CORDOVA
        )
        (options.opt("enableScreenAutoCapture") as? Boolean)?.let {
            additionalProperties[WRAPPER_ENABLE_SCREEN_AUTO_CAPTURE] = it
        }
        (options.opt("enableInteractionAutoCapture") as? Boolean)?.let {
            additionalProperties[WRAPPER_ENABLE_INTERACTION_AUTO_CAPTURE] = it
        }

        // Extract sdkMessages map from options
//        val sdkMessagesJson = options.optJSONObject("sdkMessages")
//        val sdkMessages = if (sdkMessagesJson != null) {
//            convertJsonToStringMap(sdkMessagesJson)
//        } else {
//            mapOf()
//        }

        userpilot = Userpilot(ctx.applicationContext, token) {
            loggingEnabled = isLogEnabled
            useInAppBrowser = isInAppBrowserEnabled
            disableRequestPushNotificationsPermission = disableRequestPushPermission
            this.additionalProperties = additionalProperties

//            if (sdkMessages.isNotEmpty()) {
//                this.sdkMessages = sdkMessages
//            }
            
            navigationHandler = object : UserpilotNavigationHandler {
                override fun navigateTo(uri: Uri) {
                    sendCallbackEvent("UserpilotNavigationEvent", JSONObject().apply {
                        put("url", uri)
                    })
                }
            }

            analyticsListener = object : UserpilotAnalyticsListener {
                override fun didTrack(
                    type: UserpilotAnalytic,
                    value: String,
                    properties: Payload,
                ) {
                    sendCallbackEvent("UserpilotAnalyticsEvent", JSONObject().apply {
                        put("analytic", type.name)
                        put("value", value)
                        put("properties", properties?.let { JSONObject(it) } ?: JSONObject())
                    })
                }
            }

            experienceListener = object : UserpilotExperienceListener {
                override fun onExperienceStateChanged(
                    experienceType: UserpilotExperienceType,
                    experienceId: Int?,
                    experienceState: UserpilotExperienceState
                ) {
                    sendCallbackEvent("UserpilotExperienceEvent", JSONObject().apply {
                        put("experienceType", experienceType.name)
                        experienceId?.let { put("experienceId", it) }
                        put("experienceState", experienceState.name)
                    })
                }

                override fun onExperienceStepStateChanged(
                    experienceType: UserpilotExperienceType,
                    experienceId: Int,
                    stepId: Int,
                    stepState: UserpilotExperienceState,
                    step: Int?,
                    totalSteps: Int?
                ) {
                    sendCallbackEvent("UserpilotExperienceEvent", JSONObject().apply {
                        put("experienceType", experienceType.name)
                        put("experienceId", experienceId)
                        put("experienceState", stepState.name)
                        step?.let { put("step", it) }
                        totalSteps?.let { put("totalSteps", it) }
                    })
                }
            }
        }
        handleStoredDeepLink()
        cbCtx.success()
        return true
    }

    /**
     * Registers a persistent callback from JavaScript to receive Userpilot events.
     *
     * @param args Ignored.
     * @param cbCtx The callback context to store.
     * @return true when callback is stored.
     */
    private fun registerCallbacks(args: JSONArray, cbCtx: CallbackContext): Boolean {
        eventCallbackContext = cbCtx
        val result = PluginResult(PluginResult.Status.NO_RESULT)
        result.keepCallback = true
        cbCtx.sendPluginResult(result)
        return true
    }

    /**
     * Sends an event to the JavaScript side via the persistent callback.
     *
     * @param category The event category (e.g. Navigation, Analytics, Experience).
     * @param data The event payload.
     */
    private fun sendCallbackEvent(category: String, data: JSONObject) {
        eventCallbackContext?.let { ctx ->
            val eventData = JSONObject().apply {
                put("category", category)
                put("data", data)
            }

            val result = PluginResult(PluginResult.Status.OK, eventData)
            result.keepCallback = true
            ctx.sendPluginResult(result)
        }
    }

    /**
     * Handles identifying a user in the Userpilot SDK.
     *
     * @param args [userId, userProperties, companyProperties]
     * @param cbCtx Callback context.
     * @return true when successful.
     */
    private fun identify(args: JSONArray, cbCtx: CallbackContext): Boolean {
        val userId = args.optString(0, "")
        val properties = args.optJSONObject(1) ?: JSONObject()
        val company = args.optJSONObject(2) ?: JSONObject()

        userpilot?.identify(userId, properties.toPayload(), company.toPayload())
        cbCtx.success()
        return true
    }

    /**
     * Handles switching to an anonymous user.
     *
     * @param args Ignored.
     * @param cbCtx Callback context.
     * @return true when successful.
     */
    private fun anonymous(args: JSONArray, cbCtx: CallbackContext): Boolean {
        userpilot?.anonymous()
        cbCtx.success()
        return true
    }

    /**
     * Handles logging out the current user.
     *
     * @param args Ignored.
     * @param cbCtx Callback context.
     * @return true when successful.
     */
    private fun logout(args: JSONArray, cbCtx: CallbackContext): Boolean {
        userpilot?.logout()
        cbCtx.success()
        return true
    }

    /**
     * Sends a screen event to Userpilot.
     *
     * @param args [screenName]
     * @param cbCtx Callback context.
     * @return true when successful.
     */
    private fun screen(args: JSONArray, cbCtx: CallbackContext): Boolean {
        val title = args.optString(0, "")
        userpilot?.screen(title)
        cbCtx.success()
        return true
    }

    /**
     * Tracks a custom event with optional properties.
     *
     * @param args [eventName, properties]
     * @param cbCtx Callback context.
     * @return true when successful.
     */
    private fun track(args: JSONArray, cbCtx: CallbackContext): Boolean {
        val event = args.optString(0, "")
        val properties = args.optJSONObject(1) ?: JSONObject()
        userpilot?.track(event, properties.toPayload())
        cbCtx.success()
        return true
    }

    /**
     * Reports an auto-captured screen view (DOM auto-capture) to the SDK.
     *
     * @param args [screenTitle]
     * @param cbCtx Callback context.
     * @return true when successful.
     */
    private fun trackAutoCaptureScreen(args: JSONArray, cbCtx: CallbackContext): Boolean {
        val title = args.optString(0, "")
        if (title.isNotEmpty()) {
            userpilot?.trackExternalAutoCaptureScreen(title)
        }
        cbCtx.success()
        return true
    }

    /**
     * Reports an auto-captured interaction event (DOM auto-capture) to the SDK.
     *
     * @param args [eventType, properties]
     * @param cbCtx Callback context.
     * @return true when successful.
     */
    private fun trackAutoCaptureEvent(args: JSONArray, cbCtx: CallbackContext): Boolean {
        val eventType = args.optString(0, "")
        val properties = args.optJSONObject(1) ?: JSONObject()
        if (eventType.isNotEmpty()) {
            userpilot?.trackExternalAutoCaptureEvent(eventType, properties.toPayload())
        }
        cbCtx.success()
        return true
    }
    
    /**
     * Triggers a specific experience programmatically.
     *
     * @param args [experienceId]
     * @param cbCtx Callback context.
     * @return true when successful.
     */
    private fun triggerExperience(args: JSONArray, cbCtx: CallbackContext): Boolean {
        val experienceId = args.optString(0, "")
        if (experienceId.isEmpty()) {
            error(cbCtx, "Experience ID is required")
            return false
        }
        
        userpilot?.triggerExperience(experienceId)
        cbCtx.success()
        return true
    }

    /**
     * Ends the current active experience.
     *
     * @param args Ignored.
     * @param cbCtx Callback context.
     * @return true when successful.
     */
    private fun endExperience(args: JSONArray, cbCtx: CallbackContext): Boolean {
        userpilot?.endExperience()
        cbCtx.success()
        return true
    }

    /**
     * Handles the URL handling by Userpilot.
     *
     * @param args [url]
     * @param cbCtx Callback context.
     * @return true when successful.
     */
    private fun didHandleUrl(args: JSONArray, cbCtx: CallbackContext): Boolean {
        val url = args.optString(0, "")
        if (url.isEmpty()) {
            error(cbCtx, "Invalid or missing URL")
            return false
        }
        val uri = runCatching { Uri.parse(url) }.getOrNull()
        if (uri == null) {
            error(cbCtx, "Invalid or missing URL")
            return false
        }

        // Already claimed from the launch intent - answer the host truthfully
        // instead of asking the SDK to open the same preview twice.
        if (uri == autoHandledUrl) {
            autoHandledUrl = null
            cbCtx.sendPluginResult(PluginResult(PluginResult.Status.OK, true))
            return true
        }

        val implementation = userpilot
        if (implementation == null) {
            // Hold it for [setup] rather than failing the call: a launch link
            // reaches the host app long before setup completes, and a failure
            // here is a link the user scanned and never got.
            pendingUrl = uri
            cbCtx.sendPluginResult(PluginResult(PluginResult.Status.OK, false))
            return true
        }

        val handled = implementation.onNewIntent(viewIntent(uri))

        val result = PluginResult(PluginResult.Status.OK, handled)
        cbCtx.sendPluginResult(result)
        return true
    }

    /**
     * Claims the link the app was launched with, before any JavaScript has run.
     *
     * The plugin is declared `onload`, so this runs at startup while the launch
     * intent is still the activity's intent. Unlike React Native and Flutter,
     * Cordova has no way to ask for that link later, so it is held here until
     * [setup] can hand it to the SDK.
     */
    override fun pluginInitialize() {
        super.pluginInitialize()
        handleIncomingUrl(cordova.activity?.intent?.data)
    }

    /** Claims a link delivered to an already-running app. */
    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        handleIncomingUrl(intent?.data)
    }

    /** Hands [uri] to the SDK, or holds it until [setup] creates one. */
    private fun handleIncomingUrl(uri: Uri?) {
        if (uri == null) return

        val implementation = userpilot
        if (implementation == null) {
            // One slot: a newer link supersedes one the SDK never got to see.
            pendingUrl = uri
            return
        }

        if (implementation.onNewIntent(viewIntent(uri))) {
            autoHandledUrl = uri
        }
    }

    /** Replays the link held while the SDK did not exist yet. Called at setup. */
    private fun handleStoredDeepLink() {
        val uri = pendingUrl ?: return
        pendingUrl = null

        if (userpilot?.onNewIntent(viewIntent(uri)) == true) {
            autoHandledUrl = uri
        }
    }

    private fun viewIntent(uri: Uri): Intent = Intent(Intent.ACTION_VIEW).apply { data = uri }

    /**
     * Converts a [JSONObject] into a [Map<String, String>] for SDK messages.
     * Only processes string values, ignoring other types.
     *
     * @param jsonObject The JSONObject to convert.
     * @return A map representation with string keys and values.
     */
    private fun convertJsonToStringMap(jsonObject: JSONObject): Map<String, String> {
        val map = mutableMapOf<String, String>()
        val keys = jsonObject.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            val value = jsonObject.optString(key, "")
            if (value.isNotEmpty()) {
                map[key] = value
            }
        }
        return map
    }

    /**
     * Converts a [JSONObject] into a [Payload] (Map<String, Any>).
     * Supports nested structures.
     *
     * @receiver The JSONObject to convert.
     * @return A map representation.
     */
    private fun JSONObject.toPayload(): Payload {
        val map = mutableMapOf<String, Any>()
        val keys = keys()
        while (keys.hasNext()) {
            val key = keys.next()
            val value = when (val v = this[key]) {
                is JSONObject -> v.toPayload() ?: continue
                is JSONArray -> v.toList()
                JSONObject.NULL -> continue
                else -> v
            }
            map[key] = value
        }
        return map
    }

    /**
     * Converts a [JSONArray] into a [List<Any>].
     * Supports nested arrays and objects.
     *
     * @receiver The JSONArray to convert.
     * @return A list representation.
     */
    private fun JSONArray.toList(): List<Any> {
        val list = mutableListOf<Any>()
        for (i in 0 until length()) {
            val value = when (val v = get(i)) {
                is JSONObject -> v.toPayload() ?: continue
                is JSONArray -> v.toList()
                JSONObject.NULL -> continue
                else -> v
            }
            list.add(value)
        }
        return list
    }
}
