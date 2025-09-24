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

function onDeviceReady() {
    console.log('Running cordova-' + cordova.platformId + '@' + cordova.version);
    document.getElementById('deviceready').classList.add('ready');
    document.getElementById('plugin-buttons').style.display = 'block';
    setupEventListeners();
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
    const token = 'APP_TOKEN';
    const options = {
        logging: true, // Enable/disable SDK logging
        useInAppBrowser: false, // Enable/disable in-app browser for links - Works for Android
        disableRequestPushNotificationsPermission: true // Disable request push notifications permission by SDK
    };
        
    logOutput('Setup options: ' + JSON.stringify(options));
    executePluginMethod('setup', [token, options], 'Setup success');
}

function callIdentify() {
    const userId = 'user123';
    const userProperties = { name: 'John Doe', email: 'john.doe@example.com', plan: 'premium' };
    const company = { id: 'company123', name: 'Sample Company' };
    
    executePluginMethod('identify', [userId, userProperties, company], 'Identify success');
}

function callAnonymous() {
    executePluginMethod('anonymous', [], 'Anonymous success');
}

function callLogout() {
    executePluginMethod('logout', [], 'Logout success');
}

function callScreen() {
    const screenNames = ['main', 'screen one', 'screen two', 'events', 'identify'];
    const randomScreenName = screenNames[Math.floor(Math.random() * screenNames.length)];
    
    logOutput('Selected screen: ' + randomScreenName);
    executePluginMethod('screen', [randomScreenName], 'Screen success');
}

function callTrack() {
    const events = [
        { name: 'button_clicked', properties: { button_name: 'track_button', timestamp: new Date().toISOString(), user_action: 'manual_trigger' }},
        { name: 'page_viewed', properties: { page_name: 'dashboard', timestamp: new Date().toISOString(), duration: Math.floor(Math.random() * 120) + 30 }},
        { name: 'feature_used', properties: { feature_name: 'export_data', timestamp: new Date().toISOString(), success: true, file_type: 'csv' }}
    ];
    
    const randomEvent = events[Math.floor(Math.random() * events.length)];
    logOutput('Selected event: ' + randomEvent.name);
    executePluginMethod('track', [randomEvent.name, randomEvent.properties], 'Track success');
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
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.innerHTML = `<span class="timestamp">[${timestamp}]</span> ${message}`;
    outputContent.appendChild(logEntry);
    outputContent.scrollTop = outputContent.scrollHeight;
    
    // Also log to console
    console.log(message);
}

// Utility function to log callbacks to the UI
function logCallback(category, data) {
    const callbacksContent = document.getElementById('callbacksContent');
    const dateTime = new Date().toLocaleTimeString(); // Use current time since timestamp was removed
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
    
    // Also log to console with more detail
    console.log(`[${category} Callback]`, data);
}
