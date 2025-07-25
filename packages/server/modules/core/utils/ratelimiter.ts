import { getRedisUrl, getIntFromEnv } from '@/modules/shared/helpers/envHelper'
import type { RateLimiterAbstract } from 'rate-limiter-flexible'
import {
  BurstyRateLimiter,
  RateLimiterMemory,
  RateLimiterRedis,
  RateLimiterRes
} from 'rate-limiter-flexible'
import type { Nullable } from '@speckle/shared'
import { TIME } from '@speckle/shared'
import { rateLimiterLogger } from '@/observability/logging'
import { createRedisClient } from '@/modules/shared/redis/redis'
import { RateLimitError } from '@/modules/core/errors/ratelimit'

export interface RateLimitResult {
  isWithinLimits: boolean
  action: RateLimitAction
}

export interface RateLimitSuccess extends RateLimitResult {
  isWithinLimits: true
  remainingPoints: number
}

export interface RateLimitBreached extends RateLimitResult {
  isWithinLimits: false
  msBeforeNext: number
}

type BurstyRateLimiterOptions = {
  regularOptions: RateLimits
  burstOptions: RateLimits
}

export type RateLimits = {
  limitCount: number
  duration: number
}

type RateLimiterOptions = {
  [key: string]: BurstyRateLimiterOptions
}

export type RateLimiterMapping = {
  [key in RateLimitAction]: (
    source: string
  ) => Promise<RateLimitSuccess | RateLimitBreached>
}

export type RateLimitAction = keyof typeof LIMITS

export const LIMITS = <const>{
  ALL_REQUESTS: {
    regularOptions: {
      limitCount: getIntFromEnv('RATELIMIT_ALL_REQUESTS', '500'),
      duration: 1 * TIME.second
    },
    burstOptions: {
      limitCount: getIntFromEnv('RATELIMIT_BURST_ALL_REQUESTS', '2000'),
      duration: 1 * TIME.minute
    }
  },
  USER_CREATE: {
    regularOptions: {
      limitCount: getIntFromEnv('RATELIMIT_USER_CREATE', '6'),
      duration: 1 * TIME.hour
    },
    burstOptions: {
      limitCount: getIntFromEnv('RATELIMIT_BURST_USER_CREATE', '1000'),
      duration: 1 * TIME.week
    }
  },
  STREAM_CREATE: {
    regularOptions: {
      limitCount: getIntFromEnv('RATELIMIT_STREAM_CREATE', '1'),
      duration: 1 * TIME.second
    },
    burstOptions: {
      limitCount: getIntFromEnv('RATELIMIT_BURST_STREAM_CREATE', '100'),
      duration: 1 * TIME.minute
    }
  },
  COMMIT_CREATE: {
    regularOptions: {
      limitCount: getIntFromEnv('RATELIMIT_COMMIT_CREATE', '1'),
      duration: 1 * TIME.second
    },
    burstOptions: {
      limitCount: getIntFromEnv('RATELIMIT_BURST_COMMIT_CREATE', '100'),
      duration: 1 * TIME.minute
    }
  },
  GENDO_AI_RENDER_REQUEST: {
    regularOptions: {
      limitCount: getIntFromEnv('RATELIMIT_GENDO_AI_RENDER_REQUEST', '1'),
      duration:
        getIntFromEnv('RATELIMIT_GENDO_AI_RENDER_REQUEST_PERIOD_SECONDS', '20') *
        TIME.second
    },
    burstOptions: {
      limitCount: getIntFromEnv('RATELIMIT_BURST_GENDO_AI_RENDER_REQUEST', '3'),
      duration:
        getIntFromEnv('RATELIMIT_BURST_GENDO_AI_RENDER_REQUEST_PERIOD_SECONDS', '60') *
        TIME.second
    }
  },
  'POST /api/getobjects/:streamId': {
    regularOptions: {
      limitCount: getIntFromEnv('RATELIMIT_POST_GETOBJECTS_STREAMID', '3'),
      duration: 1 * TIME.second
    },
    burstOptions: {
      limitCount: getIntFromEnv('RATELIMIT_BURST_POST_GETOBJECTS_STREAMID', '200'),
      duration: 1 * TIME.minute
    }
  },
  'POST /api/diff/:streamId': {
    regularOptions: {
      limitCount: getIntFromEnv('RATELIMIT_POST_DIFF_STREAMID', '10'),
      duration: 1 * TIME.second
    },
    burstOptions: {
      limitCount: getIntFromEnv('RATELIMIT_BURST_POST_DIFF_STREAMID', '1000'),
      duration: 1 * TIME.minute
    }
  },
  'POST /objects/:streamId': {
    regularOptions: {
      limitCount: getIntFromEnv('RATELIMIT_POST_OBJECTS_STREAMID', '6'),
      duration: 1 * TIME.second
    },
    burstOptions: {
      limitCount: getIntFromEnv('RATELIMIT_BURST_POST_OBJECTS_STREAMID', '400'),
      duration: 1 * TIME.minute
    }
  },
  'GET /objects/:streamId/:objectId': {
    regularOptions: {
      limitCount: getIntFromEnv('RATELIMIT_GET_OBJECTS_STREAMID_OBJECTID', '3'),
      duration: 1 * TIME.second
    },
    burstOptions: {
      limitCount: getIntFromEnv('RATELIMIT_BURST_GET_OBJECTS_STREAMID_OBJECTID', '200'),
      duration: 1 * TIME.minute
    }
  },
  'GET /objects/:streamId/:objectId/single': {
    regularOptions: {
      limitCount: getIntFromEnv('RATELIMIT_GET_OBJECTS_STREAMID_OBJECTID_SINGLE', '3'),
      duration: 1 * TIME.second
    },
    burstOptions: {
      limitCount: getIntFromEnv(
        'RATELIMIT_BURST_GET_OBJECTS_STREAMID_OBJECTID_SINGLE',
        '200'
      ),
      duration: 1 * TIME.minute
    }
  },
  'POST /graphql': {
    regularOptions: {
      limitCount: getIntFromEnv('RATELIMIT_POST_GRAPHQL', '50'),
      duration: 1 * TIME.second
    },
    burstOptions: {
      limitCount: getIntFromEnv('RATELIMIT_BURST_POST_GRAPHQL', '200'),
      duration: 1 * TIME.minute
    }
  },
  '/auth/local/login': {
    regularOptions: {
      limitCount: getIntFromEnv('RATELIMIT_GET_AUTH', '4'),
      duration: 10 * TIME.minute
    },
    burstOptions: {
      limitCount: getIntFromEnv('RATELIMIT_BURST_GET_AUTH', '10'),
      duration: 30 * TIME.minute
    }
  },
  '/auth/azure': {
    regularOptions: {
      limitCount: getIntFromEnv('RATELIMIT_GET_AUTH', '4'),
      duration: 10 * TIME.minute
    },
    burstOptions: {
      limitCount: getIntFromEnv('RATELIMIT_BURST_GET_AUTH', '10'),
      duration: 30 * TIME.minute
    }
  },
  '/auth/gh': {
    regularOptions: {
      limitCount: getIntFromEnv('RATELIMIT_GET_AUTH', '4'),
      duration: 10 * TIME.minute
    },
    burstOptions: {
      limitCount: getIntFromEnv('RATELIMIT_BURST_GET_AUTH', '10'),
      duration: 30 * TIME.minute
    }
  },
  '/auth/goog': {
    regularOptions: {
      limitCount: getIntFromEnv('RATELIMIT_GET_AUTH', '4'),
      duration: 10 * TIME.minute
    },
    burstOptions: {
      limitCount: getIntFromEnv('RATELIMIT_BURST_GET_AUTH', '10'),
      duration: 30 * TIME.minute
    }
  },
  '/auth/oidc': {
    regularOptions: {
      limitCount: getIntFromEnv('RATELIMIT_GET_AUTH', '4'),
      duration: 10 * TIME.minute
    },
    burstOptions: {
      limitCount: getIntFromEnv('RATELIMIT_BURST_GET_AUTH', '10'),
      duration: 30 * TIME.minute
    }
  },
  '/auth/azure/callback': {
    regularOptions: {
      limitCount: getIntFromEnv('RATELIMIT_GET_AUTH', '4'),
      duration: 10 * TIME.minute
    },
    burstOptions: {
      limitCount: getIntFromEnv('RATELIMIT_BURST_GET_AUTH', '10'),
      duration: 30 * TIME.minute
    }
  },
  '/auth/gh/callback': {
    regularOptions: {
      limitCount: getIntFromEnv('RATELIMIT_GET_AUTH', '4'),
      duration: 10 * TIME.minute
    },
    burstOptions: {
      limitCount: getIntFromEnv('RATELIMIT_BURST_GET_AUTH', '10'),
      duration: 30 * TIME.minute
    }
  },
  '/auth/goog/callback': {
    regularOptions: {
      limitCount: getIntFromEnv('RATELIMIT_GET_AUTH', '4'),
      duration: 10 * TIME.minute
    },
    burstOptions: {
      limitCount: getIntFromEnv('RATELIMIT_BURST_GET_AUTH', '10'),
      duration: 30 * TIME.minute
    }
  },
  '/auth/oidc/callback': {
    regularOptions: {
      limitCount: getIntFromEnv('RATELIMIT_GET_AUTH', '4'),
      duration: 10 * TIME.minute
    },
    burstOptions: {
      limitCount: getIntFromEnv('RATELIMIT_BURST_GET_AUTH', '10'),
      duration: 30 * TIME.minute
    }
  }
}

export const allActions = Object.keys(LIMITS) as RateLimitAction[]

export const getActionForPath = (path: string, verb: string): RateLimitAction => {
  const maybeAction = `${verb} ${path}` as RateLimitAction
  const maybeActionNoVerb = path as RateLimitAction

  if (LIMITS[maybeAction]) return maybeAction
  if (LIMITS[maybeActionNoVerb]) return maybeActionNoVerb
  return 'ALL_REQUESTS'
}

// we need to take the `BurstyRateLimiter` specific type because
// its not considered as an RateLimiterAbstract in the rate-limiter-flexible package
// This is just a rant comment, but why define the Abstract then if not
// all RateLimiters are implementing it?
export const createConsumer =
  (action: RateLimitAction, rateLimiter: RateLimiterAbstract | BurstyRateLimiter) =>
  async (source: string): Promise<RateLimitSuccess | RateLimitBreached> => {
    try {
      const rateLimitRes = await rateLimiter.consume(source)
      return {
        action,
        isWithinLimits: true,
        remainingPoints: rateLimitRes.remainingPoints
      }
    } catch (err) {
      if (err instanceof RateLimiterRes)
        return { action, isWithinLimits: false, msBeforeNext: err.msBeforeNext }

      rateLimiterLogger.error(err, 'Error while consuming rate limiter')
      throw err
    }
  }

const initializeRedisRateLimiters = (
  options: RateLimiterOptions = LIMITS
): RateLimiterMapping => {
  const redisClient = createRedisClient(getRedisUrl(), {
    enableReadyCheck: false,
    maxRetriesPerRequest: null
  })

  const mapping = Object.fromEntries(
    allActions.map((action) => {
      const limits = options[action]
      const burstyLimiter = new BurstyRateLimiter(
        new RateLimiterRedis({
          storeClient: redisClient,
          keyPrefix: action,
          points: limits.regularOptions.limitCount,
          duration: limits.regularOptions.duration,
          inMemoryBlockOnConsumed: limits.regularOptions.limitCount, // stops additional requests going to Redis once the limit is reached
          inMemoryBlockDuration: limits.regularOptions.duration,
          insuranceLimiter: new RateLimiterMemory({
            keyPrefix: action,
            points: limits.regularOptions.limitCount,
            duration: limits.regularOptions.duration
          })
        }),
        new RateLimiterRedis({
          storeClient: redisClient,
          keyPrefix: `BURST_${action}`,
          points: limits.burstOptions.limitCount,
          duration: limits.burstOptions.duration,
          inMemoryBlockOnConsumed: limits.burstOptions.limitCount,
          inMemoryBlockDuration: limits.burstOptions.duration,
          insuranceLimiter: new RateLimiterMemory({
            keyPrefix: `BURST_${action}`,
            points: limits.burstOptions.limitCount,
            duration: limits.burstOptions.duration
          })
        })
      )

      return [action, createConsumer(action, burstyLimiter)]
    })
  )
  // i know that all the values are in there, but TS doesn't...
  return mapping as RateLimiterMapping
}

export const RATE_LIMITERS = initializeRedisRateLimiters()

export const isRateLimitBreached = (
  rateLimitResult: RateLimitResult
): rateLimitResult is RateLimitBreached => !rateLimitResult.isWithinLimits

export async function getRateLimitResult(
  action: RateLimitAction,
  source: string,
  rateLimiterMapping: RateLimiterMapping = RATE_LIMITERS
): Promise<RateLimitSuccess | RateLimitBreached> {
  const consumerFunc = rateLimiterMapping[action]
  return await consumerFunc(source)
}

export type ThrowIfRateLimited = (params: {
  action: RateLimitAction
  source: string
  handleRateLimitBreachPriorToThrowing?: (rateLimitResult: RateLimitBreached) => void
}) => Promise<Nullable<RateLimitSuccess>>

export function throwIfRateLimitedFactory(opts: {
  rateLimiterEnabled: boolean
  rateLimiterMapping?: RateLimiterMapping
}): ThrowIfRateLimited {
  const { rateLimiterEnabled, rateLimiterMapping } = opts
  return async (params) => {
    const { action, source, handleRateLimitBreachPriorToThrowing } = params
    if (!rateLimiterEnabled) return null

    const rateLimitResult = await getRateLimitResult(action, source, rateLimiterMapping)
    if (isRateLimitBreached(rateLimitResult)) {
      handleRateLimitBreachPriorToThrowing?.(rateLimitResult)
      throw new RateLimitError(rateLimitResult)
    }
    return rateLimitResult
  }
}
