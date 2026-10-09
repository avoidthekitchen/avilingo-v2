import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

// Consistency checks across the hand-maintained native files. Each of these values is
// declared in more than one place, and drift between them only shows up as a failed
// install, a rejected upload, or a smoke run that silently tests the wrong thing.

const read = path => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

const capacitorConfig = read('../beakspeak/capacitor.config.ts')
const pbxproj = read('../beakspeak/ios/App/App.xcodeproj/project.pbxproj')
const infoPlist = read('../beakspeak/ios/App/App/Info.plist')
const smokeTests = read('../beakspeak/ios/Smoke/SmokeTests.swift')
const packageSwift = read('../beakspeak/ios/App/CapApp-SPM/Package.swift')
const packageJson = JSON.parse(read('../beakspeak/package.json'))
const iosSmoke = read('./ios-smoke.mjs')

const appId = capacitorConfig.match(/appId:\s*'([^']+)'/)[1]

function settingValues(name) {
  return [...pbxproj.matchAll(new RegExp(`${name} = ([^;]+);`, 'g'))].map(match => match[1].trim())
}

test('the bundle identifier is the same in Capacitor, Xcode, and the XCTest smoke', () => {
  assert.equal(appId, 'com.unformedideas.beakspeak')
  assert.deepEqual([...new Set(settingValues('PRODUCT_BUNDLE_IDENTIFIER'))], [appId])
  assert.match(smokeTests, new RegExp(`bundleIdentifier = "${appId.replaceAll('.', '\\.')}"`))
})

test('the app declares the iPhone-portrait, iOS 18.4 target the spec commits to', () => {
  assert.deepEqual([...new Set(settingValues('IPHONEOS_DEPLOYMENT_TARGET'))], ['18.4'])
  assert.deepEqual([...new Set(settingValues('TARGETED_DEVICE_FAMILY'))], ['1'])
  assert.match(packageSwift, /platforms: \[\.iOS\(\.v18\)\]/)

  const orientations = infoPlist.match(
    /<key>UISupportedInterfaceOrientations<\/key>\s*<array>([\s\S]*?)<\/array>/,
  )[1]
  assert.deepEqual(
    [...orientations.matchAll(/<string>([^<]+)<\/string>/g)].map(match => match[1]),
    ['UIInterfaceOrientationPortrait'],
  )
})

test('every Capacitor plugin the app depends on is linked into the native package', () => {
  const plugins = Object.keys(packageJson.dependencies)
    .filter(name => (name.startsWith('@capacitor/') || name.startsWith('@capacitor-community/')) &&
      !['@capacitor/core', '@capacitor/ios'].includes(name))
  assert.ok(plugins.length > 0)
  for (const plugin of plugins) {
    assert.match(
      packageSwift,
      new RegExp(`path: "\\.\\./\\.\\./\\.\\./node_modules/${plugin}"`),
      `${plugin} is missing from CapApp-SPM/Package.swift`,
    )
  }
})

test('the smoke runner expects exactly the number of XCTest cases that exist', () => {
  const testCases = (smokeTests.match(/^\s*func test\w+\(\)/gm) ?? []).length
  const expected = Number(iosSmoke.match(/counts\?\.passed !== (\d+)/)[1])
  assert.equal(testCases, expected)
})

test('the iOS marketing version matches the package version shown in Credits', () => {
  assert.deepEqual([...new Set(settingValues('MARKETING_VERSION'))], [packageJson.version])
})

test('native builds retain the owner-confirmed Apple-OS encryption declaration', () => {
  assert.match(infoPlist, /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\s*\/>/)
})

test('native SQLite uses the backed-up application-support directory without database encryption', () => {
  assert.match(capacitorConfig, /iosDatabaseLocation: 'Library\/Application Support\/BeakSpeak'/)
  assert.match(capacitorConfig, /iosIsEncryption: false/)
  const scene = read('../beakspeak/ios/App/App/SceneDelegate.swift')
  assert.match(scene, /registerPluginInstance\(BeakSpeakStoragePlugin\(\)\)/)
  assert.match(scene, /\.applicationSupportDirectory/)
  assert.match(scene, /appendingPathComponent\("BeakSpeak", isDirectory: true\)/)
  assert.match(scene, /isExcludedFromBackup = false/)
})


test('programmatic scene setup does not also request storyboard windows', () => {
  assert.doesNotMatch(infoPlist, /<key>(UISceneStoryboardFile|UIMainStoryboardFile)<\/key>/)
  assert.match(infoPlist, /<key>UILaunchStoryboardName<\/key>\s*<string>LaunchScreen<\/string>/)
  assert.match(read('../beakspeak/ios/App/App/AppDelegate.swift'), /config\.storyboard = nil/)
})


test('launch and native chrome use the existing light BeakSpeak presentation', () => {
  const launch = read('../beakspeak/ios/App/App/Base.lproj/LaunchScreen.storyboard')
  assert.match(launch, /text="BeakSpeak"/)
  assert.doesNotMatch(launch, /image="Splash"/)
  assert.match(capacitorConfig, /backgroundColor: '#FAF8F5'/)
  assert.match(infoPlist, /<key>UIUserInterfaceStyle<\/key>\s*<string>Light<\/string>/)
})

test('native Swift package pins the installed patched Capacitor iOS version', () => {
  const lock = JSON.parse(read('../beakspeak/package-lock.json'))
  const version = lock.packages['node_modules/@capacitor/ios'].version
  assert.equal(packageSwift.match(/capacitor-swift-pm.git", exact: "([^"]+)"/)[1], version)
  const resolved = JSON.parse(read('../beakspeak/ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved'))
  assert.equal(resolved.pins.find(pin => pin.identity === 'capacitor-swift-pm').state.version, version)
})
