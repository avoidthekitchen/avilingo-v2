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
    .filter(name => name.startsWith('@capacitor/') && !['@capacitor/core', '@capacitor/ios'].includes(name))
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
