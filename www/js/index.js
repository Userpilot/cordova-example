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
    
    // Auto-initialize Userpilot SDK, then setup deep link handler
    initializeUserpilot();
}

// Hash router for the app views (home / sdk / components). Switching the hash
// shows the matching view and updates document.title; the plugin's screen
// auto-capture reports each hash route (e.g. "/sdk") as a distinct screen.
function setupViewRouter() {
    var views = document.querySelectorAll('.view');
    if (!views.length) return;

    var titles = {
        '/home': 'Userpilot',
        '/sdk': 'SDK Methods',
        '/components': 'Components',
        '/navigation': 'Navigation',
        '/menus': 'Menus',
        '/list': 'List',
        '/config': 'Auto-Capture Config'
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

    bindClick('redactBtn', function () {
        if (plugin && plugin.userpilotRedactText) {
            plugin.userpilotRedactText('#redactTarget');
            logOutput('userpilotRedactText applied to #redactTarget (captured text now masked)');
        }
    });

    bindClick('ignoreBtn', function () {
        if (plugin && plugin.userpilotIgnoreInteractions) {
            plugin.userpilotIgnoreInteractions('#ignoreTarget');
            logOutput('userpilotIgnoreInteractions applied to #ignoreTarget (taps no longer captured)');
        }
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

// Auto-initialize Userpilot SDK on app start
function initializeUserpilot() {
    const token = 'NX-b7b285fd';
    const options = {
        logging: true,
        useInAppBrowser: false,
        disableRequestPushNotificationsPermission: false,
        // Auto-capture: track screens (route changes) and interactions automatically.
        enableScreenAutoCapture: true,
        enableInteractionAutoCapture: true,
        enableInteractionValueCapture: true
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
    const token = 'NX-b7b285fd';
    const options = {
        logging: true, // Enable/disable SDK logging
        useInAppBrowser: false, // Enable/disable in-app browser for links - Works for Android
        disableRequestPushNotificationsPermission: false, // Disable request push notifications permission by SDK
        enableScreenAutoCapture: true, // Auto-capture screen/route changes
        enableInteractionAutoCapture: true, // Auto-capture taps and other interactions
        enableInteractionValueCapture: true // Include value payloads (is_checked, selected_value, ...)
    };
        
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
