import assert from 'node:assert/strict'
import test from 'node:test'
import { parseXcodebuildMcpResult } from './ios-smoke-result.mjs'

test('reports command stderr when xcodebuildmcp exits without JSON output', () => {
  const result = {
    status: 1,
    stdout: '',
    stderr: 'xcodebuild failed because the simulator was unavailable',
  }

  assert.throws(
    () => parseXcodebuildMcpResult('build-launch', result),
    /build-launch failed: xcodebuild failed because the simulator was unavailable/,
  )
})
