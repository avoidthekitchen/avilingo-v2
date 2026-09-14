import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, cpSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { parseXcodebuildMcpResult } from './ios-smoke-result.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const artifacts = join(root, '.artifacts/ios-smoke')
mkdirSync(artifacts, { recursive: true })

function run(label, args) {
  console.log(`iOS smoke: ${label}`)
  const result = spawnSync('xcodebuildmcp', [...args, '--output', 'json'], {
    cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024,
    timeout: 20 * 60 * 1000,
  })
  writeFileSync(join(artifacts, `${label}.json`), result.stdout ?? '')
  writeFileSync(join(artifacts, `${label}.stderr.log`), result.stderr ?? '')
  const output = parseXcodebuildMcpResult(label, result)
  for (const key of ['buildLogPath', 'runtimeLogPath', 'osLogPath', 'xcresultPath']) {
    const path = output.data?.artifacts?.[key]
    if (path) {
      const source = path.startsWith('~/') ? join(homedir(), path.slice(2)) : path
      const name = key === 'xcresultPath' ? `${label}.xcresult` : `${label}-${key}`
      cpSync(source, join(artifacts, name), { recursive: true })
    }
  }
  // Some CLI commands report tool failures in JSON even with exit status zero.
  if (result.status !== 0 || output.didError) {
    const details = output.error ?? result.stderr?.trim() ?? `exit status ${result.status}`
    throw new Error(`${label} failed: ${details}`)
  }
  return output.data
}

const available = run('simulators', ['simulator', 'list', '--enabled']).simulators
const candidates = available.filter(sim => {
  const [major, minor] = sim.runtime.replace('iOS ', '').split('.').map(Number)
  return sim.isAvailable && sim.name.startsWith('iPhone') &&
    (major > 18 || (major === 18 && minor >= 4))
}).sort((a, b) => b.runtime.localeCompare(a.runtime, undefined, { numeric: true }))
const simulator = process.env.IOS_SIMULATOR_ID
  ? candidates.find(sim => sim.simulatorId === process.env.IOS_SIMULATOR_ID)
  : candidates[0]
if (!simulator) throw new Error('No matching iPhone simulator with iOS 18.4 or newer is available.')
console.log(`Using ${simulator.name}, ${simulator.runtime} (${simulator.simulatorId})`)

run('build-launch', ['simulator', 'build-and-run',
  '--project-path', join(root, 'beakspeak/ios/App/App.xcodeproj'),
  '--scheme', 'App', '--simulator-id', simulator.simulatorId,
  '--derived-data-path', join(artifacts, 'app-derived-data')])
const tests = run('test', ['simulator', 'test',
  '--project-path', join(root, 'beakspeak/ios/Smoke/Smoke.xcodeproj'),
  '--scheme', 'Smoke', '--simulator-id', simulator.simulatorId,
  '--derived-data-path', join(artifacts, 'test-derived-data'),
  '--extra-args', '-parallel-testing-enabled', 'NO'])
if (tests.summary?.counts?.passed !== 1 || tests.summary?.counts?.failed !== 0) {
  throw new Error('Expected exactly one passing simulator smoke test.')
}
console.log('iOS smoke passed: launch → Learn Birds → Lesson 1 → American Crow.')
