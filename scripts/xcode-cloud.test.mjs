import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const hook = fileURLToPath(new URL('../beakspeak/ios/App/ci_scripts/ci_post_clone.sh', import.meta.url))

function fixture(t, failedCommand) {
  const directory = mkdtempSync(join(tmpdir(), 'beakspeak-cloud-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const repo = join(directory, 'checkout with spaces')
  const bin = join(directory, 'bin')
  const log = join(directory, 'commands.log')
  mkdirSync(join(repo, 'beakspeak'), { recursive: true })
  mkdirSync(join(repo, 'content'))
  mkdirSync(bin)
  writeFileSync(join(repo, 'beakspeak/package-lock.json'), '{}')
  writeFileSync(join(repo, 'content/audio-metadata.lock.json'), '{}')
  for (const command of ['brew', 'npm', 'uv']) {
    const path = join(bin, command)
    writeFileSync(path, `#!/bin/bash
if [[ "$1" == '--prefix' ]]; then
  printf '%s\\n' "$BEAKSPEAK_TEST_BIN/.."
  exit 0
fi
printf '%s|%s|%s\\n' '${command}' "$PWD" "$*" >> "$BEAKSPEAK_TEST_LOG"
if [[ '${command}' == "$BEAKSPEAK_TEST_FAILURE" ]]; then exit 9; fi
`)
    chmodSync(path, 0o755)
  }
  const env = {
    ...process.env,
    CI_PRIMARY_REPOSITORY_PATH: repo,
    PATH: `${bin}:${process.env.PATH}`,
    BEAKSPEAK_TEST_BIN: bin,
    BEAKSPEAK_TEST_LOG: log,
    BEAKSPEAK_TEST_FAILURE: failedCommand ?? '',
  }
  return { repo, log, env }
}

test('Cloud prepares plugins, locked audio, and packaged assets before native compilation', t => {
  const { repo, log, env } = fixture(t)
  const result = spawnSync('bash', [hook], { env, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const commands = readFileSync(log, 'utf8').trim().split('\n')
  assert.deepEqual(commands.map(line => line.split('|').filter((_, i) => i !== 1).join('|')), [
    'brew|install node@22 ffmpeg uv',
    'npm|ci --prefix beakspeak',
    'uv|run --locked --python 3.12 python3 manual_audio.py',
    'npm|run native:sync --prefix beakspeak',
  ])
  assert.ok(commands.slice(1).every(line => line.split('|')[1] === repo))
})

test('a failed content reconstruction prevents packaging an incomplete beta', t => {
  const { log, env } = fixture(t, 'uv')
  const result = spawnSync('bash', [hook], { env, encoding: 'utf8' })
  assert.equal(result.status, 9)
  assert.match(result.stderr, /Cloud preparation failed at line/)
  assert.doesNotMatch(readFileSync(log, 'utf8'), /native:sync/)
})

test('an invalid checkout fails before installing tools or dependencies', t => {
  const { repo, log, env } = fixture(t)
  rmSync(join(repo, 'content/audio-metadata.lock.json'))
  const result = spawnSync('bash', [hook], { env, encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /dependency and audio locks/)
  assert.throws(() => readFileSync(log))
})
