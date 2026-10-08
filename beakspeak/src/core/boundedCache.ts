/** Least-recently-used cache bounded by retained bytes and entry count. */
export class BoundedCache<K, V> {
  private entries = new Map<K, { value: V; bytes: number }>()
  private bytes = 0

  private maxBytes: number
  private maxEntries: number
  private sizeOf: (value: V, key: K) => number

  constructor(maxBytes: number, maxEntries: number, sizeOf: (value: V, key: K) => number) {
    this.maxBytes = maxBytes
    this.maxEntries = maxEntries
    this.sizeOf = sizeOf
  }

  get(key: K): V | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value
  }

  set(key: K, value: V): void {
    const previous = this.entries.get(key)
    if (previous) { this.bytes -= previous.bytes; this.entries.delete(key) }
    const bytes = this.sizeOf(value, key)
    if (!Number.isFinite(bytes) || bytes < 0 || bytes > this.maxBytes) return
    while (this.entries.size && (this.bytes + bytes > this.maxBytes || this.entries.size >= this.maxEntries)) {
      const oldest = this.entries.keys().next().value!
      this.bytes -= this.entries.get(oldest)!.bytes
      this.entries.delete(oldest)
    }
    if (this.maxEntries <= 0) return
    this.entries.set(key, { value, bytes })
    this.bytes += bytes
  }
}
