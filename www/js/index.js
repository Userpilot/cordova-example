/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

// Wait for the deviceready event before using any of Cordova's device APIs.
// See https://cordova.apache.org/docs/en/latest/cordova/events/events.html#deviceready
document.addEventListener('deviceready', onDeviceReady, false);

// Track if Userpilot SDK is initialized
var isUserpilotInitialized = false;
var pendingDeepLinkUrl = null;

var DEFAULT_APP_TOKEN = 'NX-b7b285fd';
var RESTART_DELAY_MS = 1000;

/**
 * localStorage-backed persistence for the sample app configuration.
 * Values are read at SDK init and written from the Configuration screen.
 */
var StorageManager = {
    APP_TOKEN: 'APP_TOKEN',

    getString: function (key, defaultValue) {
        if (defaultValue === undefined) defaultValue = '';
        var value = localStorage.getItem(key);
        return value !== null ? value : defaultValue;
    },

    setString: function (key, value) {
        localStorage.setItem(key, value);
    },

    getBoolean: function (key, defaultValue) {
        if (defaultValue === undefined) defaultValue = false;
        var value = localStorage.getItem(key);
        if (value === null) return defaultValue;
        return value === 'true';
    },

    setBoolean: function (key, value) {
        localStorage.setItem(key, String(value));
    },

    getNumber: function (key, defaultValue) {
        if (defaultValue === undefined) defaultValue = 0;
        var value = localStorage.getItem(key);
        if (value === null) return defaultValue;
        var parsed = Number(value);
        return isFinite(parsed) ? parsed : defaultValue;
    },

    setNumber: function (key, value) {
        localStorage.setItem(key, String(value));
    }
};

/**
 * Bridge config options exposed on the Configuration screen.
 * Maps to Cordova plugin setup options (excludes native-only flags).
 */
var CONFIG_FLAGS = [
    {
        key: 'CONFIG_LOGGING',
        title: 'logging',
        description:
            'Enables verbose SDK logs in the console. Turn on while integrating to debug Userpilot behaviour; keep it off in production.',
        defaultValue: true,
        kind: 'boolean'
    },
    {
        key: 'CONFIG_USE_IN_APP_BROWSER',
        title: 'useInAppBrowser',
        description:
            'Opens experience/URL links inside an in-app browser (Custom Tabs / SFSafariViewController) instead of an external browser.',
        defaultValue: false,
        kind: 'boolean'
    },
    {
        key: 'CONFIG_DISABLE_REQUEST_PUSH_NOTIFICATIONS_PERMISSION',
        title: 'disableRequestPushNotificationsPermission',
        description:
            'Prevents the SDK from requesting the push notifications permission. Enable it when your app manages the permission itself.',
        defaultValue: false,
        kind: 'boolean'
    },
    {
        key: 'CONFIG_ENABLE_SCREEN_AUTO_CAPTURE',
        title: 'enableScreenAutoCapture',
        description:
            'Automatically tracks route/page changes in the Cordova app without manual screen() calls.',
        defaultValue: true,
        kind: 'boolean'
    },
    {
        key: 'CONFIG_ENABLE_INTERACTION_AUTO_CAPTURE',
        title: 'enableInteractionAutoCapture',
        description:
            'Automatically captures user interactions (taps and value changes) as events.',
        defaultValue: true,
        kind: 'boolean'
    },
    {
        key: 'CONFIG_ENABLE_INTERACTION_TEXT_CAPTURE',
        title: 'enableInteractionTextCapture',
        description:
            'Includes the visible text/labels of tapped elements in autocapture events. Disable it to avoid capturing PII or sensitive data.',
        defaultValue: true,
        kind: 'boolean'
    },
    {
        key: 'CONFIG_ENABLE_INTERACTION_ACCESSIBILITY_LABEL_CAPTURE',
        title: 'enableInteractionAccessibilityLabelCapture',
        description:
            'Includes accessibility labels (aria-label/title) in autocapture events. Use it together with text capture for richer element targeting.',
        defaultValue: true,
        kind: 'boolean'
    },
    {
        key: 'CONFIG_ENABLE_INTERACTION_VALUE_CAPTURE',
        title: 'enableInteractionValueCapture',
        description:
            'Captures value payloads for change events (switch state, slider values, selected date/time and list selections).',
        defaultValue: true,
        kind: 'boolean'
    },
    {
        key: 'CONFIG_MAX_HIERARCHY_DEPTH',
        title: 'maxHierarchyDepth',
        description:
            'Maximum number of ancestry nodes included in the captured hierarchy path.',
        defaultValue: 30,
        kind: 'number'
    }
];

function getFlagValue(flag) {
    if (flag.kind === 'number') {
        return StorageManager.getNumber(flag.key, flag.defaultValue);
    }
    return StorageManager.getBoolean(flag.key, flag.defaultValue);
}

function saveFlagValue(flag, value) {
    if (flag.kind === 'number') {
        StorageManager.setNumber(flag.key, value);
    } else {
        StorageManager.setBoolean(flag.key, value);
    }
}

function getStoredAppToken() {
    return StorageManager.getString(StorageManager.APP_TOKEN, '');
}

function getAppTokenForSetup() {
    var token = getStoredAppToken().trim();
    return token || DEFAULT_APP_TOKEN;
}

function buildSetupOptionsFromStorage() {
    var options = {};
    CONFIG_FLAGS.forEach(function (flag) {
        options[flag.title] = getFlagValue(flag);
    });
    return options;
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

function onDeviceReady() {
    console.log('Running cordova-' + cordova.platformId + '@' + cordova.version);
    document.getElementById('deviceready').classList.add('ready');
    document.getElementById('app-views').style.display = 'block';
    setupEventListeners();
    setupViewRouter();
    setupDemoInteractions();
    setupConfigurationScreen();
    setupStressScreens();

    // Auto-initialize Userpilot SDK, then setup deep link handler
    initializeUserpilot();

    // First launch (or cleared token): open Configuration so the token can be set.
    if (!getStoredAppToken().trim()) {
        location.hash = '#/configuration';
    }
}

// Hash router for the app views (home / sdk / components). Switching the hash
// shows the matching view and updates document.title; the plugin's screen
// auto-capture reports each hash route (e.g. "/sdk") as a distinct screen.
function setupViewRouter() {
    var views = document.querySelectorAll('.view');
    if (!views.length) return;

    var titles = {
        '/home': 'Userpilot',
        '/configuration': 'Configuration',
        '/sdk': 'SDK Methods',
        '/components': 'Components',
        '/navigation': 'Navigation',
        '/menus': 'Menus',
        '/list': 'List',
        '/config': 'Auto-Capture Config',
        '/stress-static': 'Auto-Capture Stress (Static)',
        '/stress-feed': 'Auto-Capture Stress (Feed)'
    };

    function render() {
        var route = (location.hash || '#/home').replace(/^#/, '') || '/home';
        var matched = false;
        for (var i = 0; i < views.length; i++) {
            var isMatch = views[i].getAttribute('data-view') === route;
            views[i].hidden = !isMatch;
            if (isMatch) matched = true;
        }
        if (!matched) {
            views[0].hidden = false;
            route = views[0].getAttribute('data-view');
        }
        document.title = titles[route] || 'Userpilot Sample';
        window.scrollTo(0, 0);
    }

    window.addEventListener('hashchange', render);
    if (!location.hash) {
        location.hash = '#/home';
    }
    render();

    // Prevent the demo form from navigating; the engine still captures the submit.
    var form = document.getElementById('acForm');
    if (form) {
        form.addEventListener('submit', function (e) {
            e.preventDefault();
        });
    }
}

// Reads a trimmed value from an input, falling back to a default.
function inputValue(id, fallback) {
    var el = document.getElementById(id);
    var value = el && el.value ? el.value.trim() : '';
    return value || fallback;
}

// Wires the UI behaviour for the navigation / menu / config demo screens. The
// auto-capture engine captures the interactions on its own (delegated document
// listeners); these handlers only drive the visual behaviour of the widgets.
function setupDemoInteractions() {
    setupTabs();
    setupBottomNav();
    setupDrawer();
    setupMenu('dropdownBtn', 'dropdownMenu');
    setupMenu('contextBtn', 'contextMenu');
    setupConfigControls();

    // Close transient overlays whenever the screen changes.
    window.addEventListener('hashchange', closeAllOverlays);
}

function setupTabs() {
    var tabs = document.querySelectorAll('.tab[role="tab"]');
    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            var target = tab.getAttribute('data-tab');
            tabs.forEach(function (t) {
                t.setAttribute('aria-selected', String(t === tab));
            });
            document.querySelectorAll('.tab-panel').forEach(function (panel) {
                panel.hidden = panel.getAttribute('data-panel') !== target;
            });
        });
    });
}

function setupBottomNav() {
    var items = document.querySelectorAll('.bottom-nav-item');
    var label = document.getElementById('bottomNavLabel');
    items.forEach(function (item) {
        item.addEventListener('click', function () {
            items.forEach(function (i) {
                i.setAttribute('aria-selected', String(i === item));
            });
            if (label) {
                label.textContent = item.getAttribute('data-nav');
            }
        });
    });
}

function setupDrawer() {
    var openBtn = document.getElementById('drawerOpenBtn');
    var drawer = document.getElementById('drawer');
    var overlay = document.getElementById('drawerOverlay');
    if (!openBtn || !drawer || !overlay) return;

    function open() {
        drawer.hidden = false;
        overlay.hidden = false;
        drawer.classList.add('open');
    }
    function close() {
        drawer.classList.remove('open');
        drawer.hidden = true;
        overlay.hidden = true;
    }

    openBtn.addEventListener('click', open);
    overlay.addEventListener('click', close);
    drawer.querySelectorAll('.menu-item').forEach(function (item) {
        item.addEventListener('click', function () {
            logOutput('Drawer item: ' + item.getAttribute('data-action'));
            close();
        });
    });
}

// Toggle a menu (dropdown / context) anchored to a trigger button.
function setupMenu(triggerId, menuId) {
    var trigger = document.getElementById(triggerId);
    var menu = document.getElementById(menuId);
    if (!trigger || !menu) return;

    function toggle(show) {
        menu.hidden = !show;
        trigger.setAttribute('aria-expanded', String(show));
    }

    trigger.addEventListener('click', function (e) {
        e.stopPropagation();
        toggle(menu.hidden);
    });
    menu.querySelectorAll('.menu-item').forEach(function (item) {
        item.addEventListener('click', function () {
            logOutput('Menu item: ' + item.getAttribute('data-action'));
            toggle(false);
        });
    });
    // Tap outside closes the menu.
    document.addEventListener('click', function (e) {
        if (!menu.hidden && e.target !== trigger && !menu.contains(e.target)) {
            toggle(false);
        }
    });
}

function setupConfigControls() {
    var plugin = getUserpilotPlugin();
    var status = document.getElementById('autoCaptureStatus');

    bindClick('stopCaptureBtn', function () {
        if (plugin && plugin.stopAutoCapture) {
            plugin.stopAutoCapture(function () {
                if (status) status.textContent = 'stopped';
                logOutput('Auto-capture stopped');
            }, function (err) {
                logOutput('stopAutoCapture error: ' + JSON.stringify(err));
            });
        }
    });

    bindClick('resumeCaptureBtn', function () {
        if (plugin && plugin.resumeAutoCapture) {
            plugin.resumeAutoCapture(function () {
                if (status) status.textContent = 'running';
                logOutput('Auto-capture resumed');
            }, function (err) {
                logOutput('resumeAutoCapture error: ' + JSON.stringify(err));
            });
        }
    });

    // Both helpers take the marker value as their second argument. Markers are
    // resolved nearest-first, so applying one to a nested element overrides the
    // enclosing subtree rather than being swallowed by it.
    function applyIgnore(selector, ignore) {
        if (!plugin || !plugin.userpilotIgnoreInteractions) return;
        plugin.userpilotIgnoreInteractions(selector, ignore);
        logOutput('userpilotIgnoreInteractions(\'' + selector + '\', ' + ignore + ')');
    }

    function applyRedact(selector, redact) {
        if (!plugin || !plugin.userpilotRedactText) return;
        plugin.userpilotRedactText(selector, redact);
        logOutput('userpilotRedactText(\'' + selector + '\', ' + redact + ')');
    }

    bindClick('redactBtn', function () {
        applyRedact('#redactTarget', true);
    });

    bindClick('unredactBtn', function () {
        applyRedact('#redactTarget', false);
    });

    bindClick('ignoreBtn', function () {
        applyIgnore('#ignoreTarget', true);
    });

    bindClick('captureBtn', function () {
        applyIgnore('#ignoreTarget', false);
    });

    // Outer ignored, inner explicitly not: Button 1 stops firing, Button 2 keeps
    // firing because the inner marker is the closest one to it.
    bindClick('nestedIgnoreApplyBtn', function () {
        applyIgnore('#nestedIgnoreOuter', true);
        applyIgnore('#nestedIgnoreInner', false);
        logOutput('Tap both buttons: only "Button 2" should reach SDK Callbacks');
    });

    bindClick('nestedIgnoreResetBtn', function () {
        applyIgnore('#nestedIgnoreOuter', false);
        applyIgnore('#nestedIgnoreInner', false);
        logOutput('Nested ignore cleared: both buttons are captured again');
    });

    // Same shape for text. Both buttons still fire; only the outer one is masked.
    bindClick('nestedRedactApplyBtn', function () {
        applyRedact('#nestedRedactOuter', true);
        applyRedact('#nestedRedactInner', false);
        logOutput('Tap both buttons: target_text should be "****" then "Visible Label"');
    });

    bindClick('nestedRedactResetBtn', function () {
        applyRedact('#nestedRedactOuter', false);
        applyRedact('#nestedRedactInner', false);
        logOutput('Nested redact cleared: both labels are sent verbatim');
    });
}

function bindClick(id, handler) {
    var el = document.getElementById(id);
    if (el) {
        el.addEventListener('click', handler);
    }
}

function closeAllOverlays() {
    ['dropdownMenu', 'contextMenu', 'drawer', 'drawerOverlay'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.hidden = true;
    });
    var drawer = document.getElementById('drawer');
    if (drawer) drawer.classList.remove('open');
}

function exitAppAfterConfigSave() {
    var platform = (typeof cordova !== 'undefined' && cordova.platformId) || '';

    if (navigator.app && typeof navigator.app.exitApp === 'function') {
        navigator.app.exitApp();
        return;
    }

    // Some iOS builds expose exit via cordova.exec; try before asking the user.
    if (typeof cordova !== 'undefined' && cordova.exec) {
        try {
            cordova.exec(null, null, 'Exit', 'exitApp', []);
            return;
        } catch (e) {
            // Fall through to alert.
        }
    }

    if (platform === 'ios') {
        alert('Configuration saved. Please force-quit and relaunch the app for changes to take effect.');
        return;
    }

    // Browser / unsupported platform fallback.
    window.location.reload();
}

function setupConfigurationScreen() {
    var tokenInput = document.getElementById('configAppToken');
    var flagsContainer = document.getElementById('configFlags');
    if (!tokenInput || !flagsContainer) return;

    tokenInput.value = getStoredAppToken() || DEFAULT_APP_TOKEN;

    flagsContainer.innerHTML = '';
    CONFIG_FLAGS.forEach(function (flag) {
        var row = document.createElement('div');
        row.className = 'config-flag-row';

        var labelWrap = document.createElement('div');
        labelWrap.className = 'config-flag-copy';

        var title = document.createElement('div');
        title.className = 'config-flag-title';
        title.textContent = flag.title;

        var desc = document.createElement('div');
        desc.className = 'config-flag-desc';
        desc.textContent = flag.description;

        labelWrap.appendChild(title);
        labelWrap.appendChild(desc);
        row.appendChild(labelWrap);

        if (flag.kind === 'number') {
            var numberInput = document.createElement('input');
            numberInput.type = 'number';
            numberInput.min = '1';
            numberInput.inputMode = 'numeric';
            numberInput.className = 'config-number-input';
            numberInput.id = 'flag_' + flag.key;
            numberInput.value = String(getFlagValue(flag));
            row.appendChild(numberInput);
        } else {
            var toggle = document.createElement('input');
            toggle.type = 'checkbox';
            toggle.className = 'config-toggle';
            toggle.id = 'flag_' + flag.key;
            toggle.checked = Boolean(getFlagValue(flag));
            toggle.setAttribute('role', 'switch');
            toggle.setAttribute('aria-label', flag.title);
            row.appendChild(toggle);
        }

        flagsContainer.appendChild(row);
    });

    bindClick('configSaveRestartBtn', onSaveAndRestartClicked);
}

function onSaveAndRestartClicked() {
    var tokenInput = document.getElementById('configAppToken');
    var token = tokenInput && tokenInput.value ? tokenInput.value.trim() : '';
    if (!token) {
        alert('Please enter an app token');
        return;
    }

    StorageManager.setString(StorageManager.APP_TOKEN, token);

    CONFIG_FLAGS.forEach(function (flag) {
        var control = document.getElementById('flag_' + flag.key);
        if (!control) return;
        if (flag.kind === 'number') {
            var parsed = Number(control.value);
            saveFlagValue(
                flag,
                isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : flag.defaultValue
            );
        } else {
            saveFlagValue(flag, Boolean(control.checked));
        }
    });

    logOutput('Config saved. Restarting…');
    var saveBtn = document.getElementById('configSaveRestartBtn');
    if (saveBtn) saveBtn.disabled = true;

    setTimeout(exitAppAfterConfigSave, RESTART_DELAY_MS);
}

// Auto-initialize Userpilot SDK on app start from persisted Configuration values.
function initializeUserpilot() {
    var token = getAppTokenForSetup();
    var options = buildSetupOptionsFromStorage();

    logOutput('Initializing Userpilot SDK...');
    logOutput('Setup options: ' + JSON.stringify(options));

    var plugin = getUserpilotPlugin();
    if (!plugin) {
        logOutput('Userpilot plugin not found.');
        return;
    }

    plugin.setup(
        token,
        options,
        function (result) {
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
        function (error) {
            logOutput('Userpilot SDK setup error: ' + JSON.stringify(error));
        }
    );
}

function setupEventListeners() {
    document.getElementById('setupBtn').addEventListener('click', callSetup);
    document.getElementById('identifyBtn').addEventListener('click', callIdentify);
    document.getElementById('anonymousBtn').addEventListener('click', callAnonymous);
    document.getElementById('callbacksBtn').addEventListener('click', registerCallbacks);
    document.getElementById('screenBtn').addEventListener('click', callScreen);
    document.getElementById('trackBtn').addEventListener('click', callTrack);
    document.getElementById('triggerExpBtn').addEventListener('click', callTriggerExperience);
    document.getElementById('endExpBtn').addEventListener('click', callEndExperience);
    document.getElementById('logoutBtn').addEventListener('click', callLogout);
    
    // Deep link test button (if it exists)
    var deepLinkBtn = document.getElementById('deepLinkBtn');
    if (deepLinkBtn) {
        deepLinkBtn.addEventListener('click', testDeepLink);
    }
}

// Test deep link handling with a sample URL
function testDeepLink() {
    var testUrl = 'userpilot-nx-b7b285fd://sdk/experience_preview/49?type=mobile_content';
    logOutput('Testing deep link with: ' + testUrl);
    processDeepLink(testUrl);
}

// Helper function to find the Userpilot plugin
function getUserpilotPlugin() {
    return window.userpilot || null;
}

// Helper function to execute plugin methods with consistent error handling
function executePluginMethod(methodName, args, successMessage) {
    logOutput(`Calling ${methodName} method...`);
    
    const plugin = getUserpilotPlugin();
    if (!plugin) {
        logOutput('Userpilot plugin not found. Make sure the plugin is installed.');
        return;
    }
    
    const successCallback = (result) => logOutput(`${successMessage}: ${JSON.stringify(result)}`);
    const errorCallback = (error) => logOutput(`${methodName} error: ${JSON.stringify(error)}`);
    
    plugin[methodName].apply(plugin, [...args, successCallback, errorCallback]);
}

// Plugin method implementations
function callSetup() {
    var token = getAppTokenForSetup();
    var options = buildSetupOptionsFromStorage();

    logOutput('Setup options: ' + JSON.stringify(options));
    executePluginMethod('setup', [token, options], 'Setup success');
}

function callIdentify() {
    const userId = inputValue('userIdInput', 'user123');
    const userProperties = { name: 'John Doe', email: 'john.doe@example.com', plan: 'premium' };
    const company = { id: 'company123', name: 'Sample Company' };
    
    logOutput('Identify userId: ' + userId);
    executePluginMethod('identify', [userId, userProperties, company], 'Identify success');
}

function callAnonymous() {
    executePluginMethod('anonymous', [], 'Anonymous success');
}

function callLogout() {
    executePluginMethod('logout', [], 'Logout success');
}

function callScreen() {
    const screenName = inputValue('screenNameInput', 'Dashboard');
    
    logOutput('Selected screen: ' + screenName);
    executePluginMethod('screen', [screenName], 'Screen success');
}

function callTrack() {
    const eventName = inputValue('eventNameInput', 'button_clicked');
    const properties = { timestamp: new Date().toISOString(), user_action: 'manual_trigger' };
    
    logOutput('Track event: ' + eventName);
    executePluginMethod('track', [eventName, properties], 'Track success');
}

function callTriggerExperience() {
    const experienceId = 'experience_123';
    logOutput('Triggering experience: ' + experienceId);
    executePluginMethod('triggerExperience', [experienceId], 'Trigger Experience success');
}

function callEndExperience() {
    executePluginMethod('endExperience', [], 'End Experience success');
}

function registerCallbacks() {
    logOutput('Registering SDK callbacks...');
    
    const plugin = getUserpilotPlugin();
    if (!plugin) {
        logOutput('Userpilot plugin not found. Make sure the plugin is installed.');
        return;
    }
    
    // Register test event handler
    if (typeof plugin.on === 'function') {
        plugin.on('TestEvent', (data) => {
            logCallback('TestEvent', data);
        });
    }
    
    plugin.onUserpilotNavigationEvent((data) => {
        logCallback('UserpilotNavigationEvent', data);
    });
    
    plugin.onUserpilotAnalyticsEvent((data) => {
        logCallback('UserpilotAnalyticsEvent', data);
    });
    
    plugin.onUserpilotExperienceEvent((data) => {
        logCallback('UserpilotExperienceEvent', data);
    });
    
    // Register the native callback handler
    plugin.registerCallbacks(
        () => logOutput('Callbacks registered successfully'),
        (error) => logOutput('Callbacks registration error: ' + JSON.stringify(error))
    );
}

// Utility function to log output to the UI
function logOutput(message) {
    const outputContent = document.getElementById('outputContent');
    if (!outputContent) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.innerHTML = `<span class="timestamp">[${timestamp}]</span> ${message}`;
    outputContent.appendChild(logEntry);
    outputContent.scrollTop = outputContent.scrollHeight;
}

// Utility function to log callbacks to the UI
function logCallback(category, data) {
    const callbacksContent = document.getElementById('callbacksContent');
    if (!callbacksContent) return;
    
    const dateTime = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry callback-entry';
    logEntry.innerHTML = `
        <span class="timestamp">[${dateTime}]</span> 
        <span class="category">${category}:</span> 
        <span class="callback-data">${JSON.stringify(data, null, 2)}</span>
    `;
    callbacksContent.appendChild(logEntry);
    
    // Ensure scrolling works
    setTimeout(() => {
        callbacksContent.scrollTop = callbacksContent.scrollHeight;
    }, 10);
}
