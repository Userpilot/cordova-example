const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

function configureIosProject(context) {
    const platforms = context.opts.platforms || context.opts.cordova.platforms;
    if (!platforms.includes('ios')) return;

    const root = context.opts.projectRoot;
    const iosRoot = path.join(root, 'platforms', 'ios');
    const projectPath = path.join(iosRoot, 'App.xcodeproj', 'project.pbxproj');
    if (!fs.existsSync(projectPath)) return;

    // Use the parsers already installed with this sample's Cordova iOS platform.
    const iosRequire = createRequire(require.resolve('cordova-ios/package.json', { paths: [root] }));
    const plist = iosRequire('plist');
    const sources = path.join(root, 'resources', 'ios');
    const suppliedEntitlements = plist.parse(fs.readFileSync(path.join(sources, 'UserpilotSample.entitlements'), 'utf8'));
    const exportOptions = plist.parse(fs.readFileSync(path.join(sources, 'exportOptions.plist'), 'utf8'));

    // Keep the existing development/production push settings while applying the
    // supplied entitlements to the files Xcode actually uses for signing.
    for (const configuration of ['Debug', 'Release']) {
        const target = path.join(iosRoot, 'App', `Entitlements-${configuration}.plist`);
        const existing = plist.parse(fs.readFileSync(target, 'utf8'));
        fs.writeFileSync(target, plist.build({ ...existing, ...suppliedEntitlements }) + '\n');
    }

    const resources = path.join(iosRoot, 'App', 'Resources');
    fs.mkdirSync(resources, { recursive: true });
    fs.copyFileSync(path.join(sources, 'UserpilotSample.entitlements'), path.join(resources, 'UserpilotSample.entitlements'));
    fs.copyFileSync(path.join(sources, 'exportOptions.plist'), path.join(iosRoot, 'exportOptions.plist'));

    // Use Cordova's cached project object so subsequent signing-style updates
    // during the same build retain these settings.
    const project = iosRequire('./lib/projectFile').parse({ root: iosRoot, pbxproj: projectPath });
    const configurations = project.xcode.pbxXCBuildConfigurationSection();
    for (const configuration of Object.values(configurations)) {
        const settings = configuration.buildSettings;
        if (!settings || !settings.CODE_SIGN_ENTITLEMENTS) continue;

        const entitlementsPath = '"App/Entitlements-$(CONFIGURATION).plist"';
        settings.CODE_SIGN_ENTITLEMENTS = entitlementsPath;
        // The older deeplinks plugin runs after app hooks and rewrites the
        // unqualified setting. SDK-specific settings keep the app's choice.
        settings['"CODE_SIGN_ENTITLEMENTS[sdk=iphoneos*]"'] = entitlementsPath;
        settings['"CODE_SIGN_ENTITLEMENTS[sdk=iphonesimulator*]"'] = entitlementsPath;
    }
    project.write();

    if (context.hook === 'before_compile') {
        const buildOptions = context.opts.options;
        buildOptions.exportOptions = { ...exportOptions, ...buildOptions.exportOptions };
        // Cordova maps the export method through packageType when generating
        // its final exportOptions.plist. Explicit command-line options still win.
        buildOptions.packageType = buildOptions.packageType || exportOptions.method;
    }

    console.log('Configured iOS signing and export options from resources/ios.');
}

module.exports = configureIosProject;

if (require.main === module) {
    configureIosProject({ opts: { projectRoot: path.join(__dirname, '..'), platforms: ['ios'] } });
}
