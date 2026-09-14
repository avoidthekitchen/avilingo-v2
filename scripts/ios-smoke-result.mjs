export function parseXcodebuildMcpResult(label, result) {
  if (result.error) throw result.error

  let output
  try {
    output = JSON.parse(result.stdout)
  } catch (cause) {
    const details = result.stderr?.trim() || result.stdout?.trim() || 'xcodebuildmcp returned invalid JSON'
    throw new Error(`${label} failed: ${details}`, { cause })
  }

  return output
}
