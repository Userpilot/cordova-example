const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const productName = 'UserpilotSample';
const bundleId = 'com.userpilot.cordovasample';
const buildDir = path.join(__dirname, '..', 'platforms', 'ios', 'build', 'Debug-iphoneos');
const ipaPath = path.join(buildDir, `${productName}.ipa`);
const appPath = path.join(buildDir, `${productName}.app`);

function run(cmd, args, opts = {}) {
    execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

function connectedIPhoneId() {
    const jsonPath = path.join(os.tmpdir(), 'userpilot-ios-devices.json');
    run('xcrun', ['devicectl', 'list', 'devices', '--json-output', jsonPath], { stdio: 'pipe' });
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const devices = (data.result && data.result.devices) || [];
    const phone = devices.find((device) => {
        const hardware = device.hardwareProperties || {};
        const connection = device.connectionProperties || {};
        return (
            hardware.deviceType === 'iPhone' &&
            hardware.reality === 'physical' &&
            connection.tunnelState === 'connected'
        );
    });

    if (!phone) {
        throw new Error('No connected iPhone found. Unlock the phone and keep it paired in Xcode.');
    }

    return {
        id: phone.identifier,
        name: phone.deviceProperties && phone.deviceProperties.name
    };
}

if (!fs.existsSync(ipaPath) && !fs.existsSync(appPath)) {
    console.error('No iOS device build found. Run: npx cordova build ios --device');
    process.exit(1);
}

if (fs.existsSync(ipaPath)) {
    run('unzip', ['-o', '-qq', ipaPath], { cwd: buildDir });
    const inflated = path.join(buildDir, 'Payload', `${productName}.app`);
    fs.rmSync(appPath, { recursive: true, force: true });
    fs.renameSync(inflated, appPath);
    fs.rmSync(path.join(buildDir, 'Payload'), { recursive: true, force: true });
}

const device = connectedIPhoneId();
console.log(`Installing ${productName} on ${device.name}...`);
run('xcrun', ['devicectl', 'device', 'install', 'app', '--device', device.id, appPath]);
console.log(`Launching ${bundleId}...`);
run('xcrun', ['devicectl', 'device', 'process', 'launch', '--device', device.id, bundleId]);
