import type {
  FreeConnectionsCalculator,
  FreeConnectionsCalculators
} from '@/healthchecks/types'
import { numberOfFreeConnections } from '@/modules/shared/helpers/dbHelper'
import { postgresMaxConnections } from '@/modules/shared/helpers/envHelper'
import type { Knex } from 'knex'

export const knexFreeDbConnectionSamplerFactory = (opts: {
  db: Knex
  collectionPeriod: number
  sampledDuration: number
}): FreeConnectionsCalculator & { start: () => void } => {
  const { db, collectionPeriod, sampledDuration } = opts
  const dataQueue = new Array<number>()
  const maxQueueSize = sampledDuration / collectionPeriod
  return {
    start: () => {
      setInterval(() => {
        dataQueue.push(numberOfFreeConnections(db))
        if (dataQueue.length > maxQueueSize) {
          dataQueue.shift()
        }
      }, collectionPeriod)
    },
    mean: () => {
      // return the current value if the queue is empty
      if (!dataQueue.length) return numberOfFreeConnections(db)
      return dataQueue.reduce((a, b) => a + b) / dataQueue.length
    }
  }
}

export const calculatePercentageFreeConnections = (deps: {
  getFreeConnectionsCalculators: () => FreeConnectionsCalculators
}) => {
  const percentageFreeConnections: Record<string, number> = {}
  const freeConnectionsCalculators = deps.getFreeConnectionsCalculators()

  for (const [region, value] of Object.entries(freeConnectionsCalculators)) {
    const numFreeConnections = value.mean()
    percentageFreeConnections[region] = Math.floor(
      (numFreeConnections * 100) / postgresMaxConnections()
    )
  }

  return percentageFreeConnections
}
