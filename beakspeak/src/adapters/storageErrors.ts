export type StorageFailureKind = 'unavailable' | 'corrupt' | 'newer-schema' | 'timeout'

export class StorageLoadError extends Error {
  readonly kind: StorageFailureKind

  constructor(kind: StorageFailureKind, message: string) {
    super(message)
    this.name = 'StorageLoadError'
    this.kind = kind
  }
}
