import { describe, expect, it } from 'vitest'
import { BoundedCache } from './boundedCache'

describe('BoundedCache', () => {
  it('evicts least recently used entries to respect the byte budget', () => {
    const cache = new BoundedCache<string, number>(10, 10, size => size)
    cache.set('a', 4); cache.set('b', 4)
    expect(cache.get('a')).toBe(4)
    cache.set('c', 4)
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('a')).toBe(4)
    expect(cache.get('c')).toBe(4)
  })
  it('bounds zero-byte entries and skips oversized values', () => {
    const cache = new BoundedCache<string, number>(10, 2, size => size)
    cache.set('a', 0); cache.set('b', 0); cache.set('c', 0); cache.set('huge', 11)
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe(0)
    expect(cache.get('c')).toBe(0)
    expect(cache.get('huge')).toBeUndefined()
  })
})
