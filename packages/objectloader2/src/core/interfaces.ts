import Queue from '../queues/queue.js'
import { Item } from '../types/types.js'

export interface Downloader extends Queue<string> {
  initializePool(params: {
    results: Queue<Item>
    total: number
    maxDownloadBatchWait?: number
  }): void
  downloadSingle(): Promise<Item | undefined>
  disposeAsync(): Promise<void>
}

export interface Database {
  getAll(keys: string[]): Promise<(Item | undefined)[]>
  saveBatch(params: { batch: Item[] }): Promise<void>
  disposeAsync(): Promise<void>
}
