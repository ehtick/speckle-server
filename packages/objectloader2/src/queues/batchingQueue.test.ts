import { describe, test, expect, vi } from 'vitest'
import BatchingQueue from './batchingQueue.js'

describe('BatchingQueue', () => {
  test('should add items and process them in batches', async () => {
    const processSpy = vi.fn()
    const queue = new BatchingQueue({
      batchSize: 2,
      maxWaitTime: 100,
      processFunction: async (batch: string[]): Promise<void> => {
        await new Promise((resolve) => setTimeout(resolve, 0))
        processSpy(batch)
      }
    })

    try {
      queue.add('key1', 'item1')
      queue.add('key2', 'item2')

      await new Promise((resolve) => setTimeout(resolve, 200))

      expect(processSpy).toHaveBeenCalledTimes(1)
      expect(processSpy).toHaveBeenCalledWith(['item1', 'item2'])
    } finally {
      await queue.disposeAsync()
    }
  })

  test('should process items after timeout if batch size is not reached', async () => {
    const processSpy = vi.fn()
    const queue = new BatchingQueue({
      batchSize: 5,
      maxWaitTime: 100,
      processFunction: async (batch: string[]): Promise<void> => {
        await new Promise((resolve) => setTimeout(resolve, 0))
        processSpy(batch)
      }
    })

    try {
      queue.add('key1', 'item1')
      queue.add('key2', 'item2')

      await new Promise((resolve) => setTimeout(resolve, 200))

      expect(processSpy).toHaveBeenCalledTimes(1)
      expect(processSpy).toHaveBeenCalledWith(['item1', 'item2'])
    } finally {
      await queue.disposeAsync()
    }
  })

  test('should handle multiple batches correctly', async () => {
    const processSpy = vi.fn()
    const queue = new BatchingQueue({
      batchSize: 2,
      maxWaitTime: 100,
      processFunction: async (batch: string[]): Promise<void> => {
        await new Promise((resolve) => setTimeout(resolve, 0))
        processSpy(batch)
      }
    })

    try {
      queue.add('key1', 'item1')
      queue.add('key2', 'item2')
      queue.add('key3', 'item3')
      queue.add('key4', 'item4')

      await new Promise((resolve) => setTimeout(resolve, 200))

      expect(processSpy).toHaveBeenCalledTimes(2)
      expect(processSpy).toHaveBeenCalledWith(['item1', 'item2'])
      expect(processSpy).toHaveBeenCalledWith(['item3', 'item4'])
    } finally {
      await queue.disposeAsync()
    }
  })

  test('should retrieve items by key', async () => {
    const queue = new BatchingQueue<string>({
      batchSize: 3,
      maxWaitTime: 100,
      processFunction: async (): Promise<void> => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    })
    try {
      queue.add('key1', 'item1')
      queue.add('key2', 'item2')

      expect(queue.get('key1')).toBe('item1')
      expect(queue.get('key2')).toBe('item2')
      expect(queue.get('key3')).toBeUndefined()
    } finally {
      await queue.disposeAsync()
    }
  })

  test('should return correct count of items', async () => {
    const queue = new BatchingQueue<string>({
      batchSize: 3,
      maxWaitTime: 100,
      processFunction: async (): Promise<void> => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    })
    try {
      expect(queue.count()).toBe(0)

      queue.add('key1', 'item1')
      queue.add('key2', 'item2')

      expect(queue.count()).toBe(2)
    } finally {
      await queue.disposeAsync()
    }
  })

  test('should not process items if already processing', async () => {
    const processSpy = vi.fn()
    const queue = new BatchingQueue({
      batchSize: 2,
      maxWaitTime: 100,
      processFunction: async (batch: string[]): Promise<void> => {
        processSpy(batch)
        await new Promise((resolve) => setTimeout(resolve, 300))
      }
    })

    try {
      queue.add('key1', 'item1')
      queue.add('key2', 'item2')
      queue.add('key3', 'item3')

      await new Promise((resolve) => setTimeout(resolve, 200))

      expect(processSpy).toHaveBeenCalledTimes(1)
      expect(processSpy).toHaveBeenCalledWith(['item1', 'item2'])

      await new Promise((resolve) => setTimeout(resolve, 500))

      expect(processSpy).toHaveBeenCalledTimes(2)
      expect(processSpy).toHaveBeenCalledWith(['item3'])
    } finally {
      await queue.disposeAsync()
    }
  })
})
