import {
  clamp,
  groupBy,
  has,
  isNaN,
  isNull,
  isObjectLike,
  isUndefined,
  mapValues,
  omit,
  omitBy,
  reduce,
  toNumber,
  keyBy
} from 'lodash-es'
import {
  Streams,
  StreamAcl,
  StreamFavorites,
  knex,
  Users,
  StreamCommits,
  Commits,
  Branches,
  ServerAcl
} from '@/modules/core/dbSchema'
import { InvalidArgumentError, LogicError } from '@/modules/shared/errors'
import type { StreamRoles } from '@/modules/core/helpers/mainConstants'
import { Roles } from '@/modules/core/helpers/mainConstants'
import type {
  StreamAclRecord,
  StreamCommitRecord,
  StreamFavoriteRecord,
  StreamRecord,
  UserWithRole
} from '@/modules/core/helpers/types'
import { ProjectRecordVisibility } from '@/modules/core/helpers/types'
import type {
  ProjectUpdateInput,
  StreamUpdateInput
} from '@/modules/core/graph/generated/graphql'
import {
  DiscoverableStreamsSortType,
  SortDirection
} from '@/modules/core/graph/generated/graphql'
import type { Nullable, Optional } from '@/modules/shared/helpers/typeHelper'
import {
  decodeCompositeCursor,
  decodeCursor,
  encodeCompositeCursor,
  encodeCursor
} from '@/modules/shared/helpers/dbHelper'
import dayjs from 'dayjs'
import cryptoRandomString from 'crypto-random-string'
import type { Knex } from 'knex'
import {
  isProjectCreateInput,
  mapGqlToDbProjectVisibility
} from '@/modules/core/helpers/project'
import {
  StreamAccessUpdateError,
  StreamNotFoundError,
  StreamUpdateError
} from '@/modules/core/errors/stream'
import { metaHelpers } from '@/modules/core/helpers/meta'
import { removePrivateFields } from '@/modules/core/helpers/userHelper'
import type {
  DeleteProjectRole,
  UpdateProject,
  UpsertProjectRole
} from '@/modules/core/domain/projects/operations'
import type {
  StreamWithCommitId,
  StreamWithOptionalRole
} from '@/modules/core/domain/streams/types'
import type {
  StoreStream,
  GetCommitStream,
  GetCommitStreams,
  GetStream,
  GetStreamCollaborators,
  GetStreams,
  DeleteStreamRecord,
  UpdateStreamRecord,
  RevokeStreamPermissions,
  GrantStreamPermissions,
  GetOnboardingBaseStream,
  GetDiscoverableStreamsParams,
  CountDiscoverableStreams,
  GetDiscoverableStreamsPage,
  LegacyGetStreams,
  GetFavoritedStreamsPage,
  GetFavoritedStreamsCount,
  SetStreamFavorited,
  CanUserFavoriteStream,
  GetBatchUserFavoriteData,
  GetBatchStreamFavoritesCounts,
  GetOwnedFavoritesCountByUserIds,
  GetStreamRoles,
  GetUserStreamCounts,
  GetStreamsSourceApps,
  BaseUserStreamsQueryParams,
  UserStreamsQueryParams,
  UserStreamsQueryCountParams,
  GetUserStreamsPage,
  GetUserStreamsCount,
  MarkBranchStreamUpdated,
  MarkCommitStreamUpdated,
  MarkOnboardingBaseStream,
  GetUserDeletableStreams,
  GetStreamsCollaborators,
  GetStreamsCollaboratorCounts,
  GetImplicitUserProjectsCountFactory,
  GrantProjectPermissions,
  GetExplicitProjects
} from '@/modules/core/domain/streams/operations'
import { generateProjectName } from '@/modules/core/domain/projects/logic'
import { WorkspaceAcl } from '@/modules/workspacesCore/helpers/db'
export type { StreamWithOptionalRole, StreamWithCommitId }

const tables = {
  streams: (db: Knex) => db<StreamRecord>(Streams.name),
  streamAcl: (db: Knex) => db<StreamAclRecord>(StreamAcl.name),
  streamCommits: (db: Knex) => db<StreamCommitRecord>(StreamCommits.name),
  streamFavorites: (db: Knex) => db<StreamFavoriteRecord>(StreamFavorites.name)
}

/**
 * List of base columns to select when querying for user streams
 * (expects join to StreamAcl)
 */
export const STREAM_WITH_OPTIONAL_ROLE_COLUMNS = [...Streams.cols, StreamAcl.col.role]

export const generateId = () => cryptoRandomString({ length: 10 })

/**
 * Get multiple streams. If userId is specified, the role will be resolved as well.
 */
export const getStreamsFactory =
  (deps: { db: Knex }): GetStreams =>
  async (
    streamIds: string[],
    options: Partial<{ userId: string; trx: Knex.Transaction }> = {}
  ) => {
    const { userId, trx } = options
    if (!streamIds?.length) throw new InvalidArgumentError('Empty stream IDs')

    const q = tables.streams(deps.db).whereIn(Streams.col.id, streamIds)

    if (userId) {
      q.select<StreamWithOptionalRole[]>([
        ...Object.values(Streams.col),
        // Getting first role from grouped results
        knex.raw(`(array_agg("stream_acl"."role"))[1] as role`)
      ])
      q.leftJoin(StreamAcl.name, function () {
        this.on(StreamAcl.col.resourceId, Streams.col.id).andOnVal(
          StreamAcl.col.userId,
          userId
        )
      })
      q.groupBy(Streams.col.id)
    }

    if (trx) {
      q.transacting(trx)
    }

    return await q
  }

/**
 * Get a single stream. If userId is specified, the role will be resolved as well.
 */
export const getStreamFactory =
  (deps: { db: Knex }): GetStream =>
  async (
    params: { streamId?: string; userId?: string },
    options?: Partial<{ trx: Knex.Transaction }>
  ): Promise<Optional<StreamWithOptionalRole>> => {
    const { streamId, userId } = params
    if (!streamId) throw new InvalidArgumentError('Invalid stream ID')

    const streams = await getStreamsFactory(deps)([streamId], {
      userId,
      ...(options || {})
    })
    return <Optional<StreamWithOptionalRole>>streams[0]
  }

export const getCommitStreamsFactory =
  (deps: { db: Knex }): GetCommitStreams =>
  async (params: { commitIds: string[]; userId?: string }) => {
    const { commitIds, userId } = params
    if (!commitIds?.length) return []

    const q = tables
      .streamCommits(deps.db)
      .select<Array<StreamWithCommitId>>([...Streams.cols, StreamCommits.col.commitId])
      .innerJoin(Streams.name, Streams.col.id, StreamCommits.col.streamId)
      .whereIn(StreamCommits.col.commitId, commitIds)

    if (userId) {
      q.select([
        // Getting first role from grouped results
        knex.raw(`(array_agg("stream_acl"."role"))[1] as role`)
      ])
      q.leftJoin(StreamAcl.name, function () {
        this.on(StreamAcl.col.resourceId, Streams.col.id).andOnVal(
          StreamAcl.col.userId,
          userId
        )
      })
      q.groupBy(Streams.col.id, StreamCommits.col.commitId)
    }

    const results = await q
    return results
  }

export const getCommitStreamFactory =
  (deps: { db: Knex }): GetCommitStream =>
  async (params: { commitId: string; userId?: string }) => {
    const { commitId } = params
    if (!commitId) throw new InvalidArgumentError('Invalid commit ID')

    const results = await getCommitStreamsFactory(deps)({
      commitIds: [commitId],
      userId: params.userId
    })
    return <Optional<StreamWithCommitId>>results[0]
  }

/**
 * Get base query for finding or counting user favorited streams
 * @param {string} userId The user's ID
 */
const getFavoritedStreamsQueryBaseFactory =
  (deps: { db: Knex }) => (userId: string, streamIdWhitelist?: Optional<string[]>) => {
    if (!userId)
      throw new InvalidArgumentError(
        'User ID must be specified to retrieve favorited streams'
      )

    const query = tables
      .streamFavorites(deps.db)
      .where(StreamFavorites.col.userId, userId)
      .innerJoin(Streams.name, Streams.col.id, StreamFavorites.col.streamId)
      .leftJoin(StreamAcl.name, (q) =>
        q
          .on(StreamAcl.col.resourceId, '=', StreamFavorites.col.streamId)
          .andOnVal(StreamAcl.col.userId, userId)
      )
      .andWhere((q) =>
        q
          .where(Streams.col.visibility, ProjectRecordVisibility.Public)
          .orWhereNotNull(StreamAcl.col.resourceId)
      )

    if (streamIdWhitelist?.length) {
      query.whereIn(Streams.col.id, streamIdWhitelist)
    }

    return query
  }

/**
 * Get favorited streams
 * @param {Object} p
 * @param {string} p.userId
 * @param {string} [p.cursor] ISO8601 timestamp after which to look for favoirtes
 * @param {number} [p.limit] Defaults to 25
 */
export const getFavoritedStreamsPageFactory =
  (deps: { db: Knex }): GetFavoritedStreamsPage =>
  async (params) => {
    const { userId, cursor, limit, streamIdWhitelist } = params
    const finalLimit = clamp(limit || 25, 1, 25)
    const query = getFavoritedStreamsQueryBaseFactory(deps)(userId, streamIdWhitelist)
    query
      .select<
        Array<StreamWithOptionalRole & { favoritedDate: Date; favCursor: string }>
      >([
        ...STREAM_WITH_OPTIONAL_ROLE_COLUMNS,
        { favoritedDate: StreamFavorites.col.createdAt },
        { favCursor: StreamFavorites.col.cursor }
      ])
      .limit(finalLimit)
      .orderBy(StreamFavorites.col.cursor, 'desc')

    if (cursor) query.andWhere(StreamFavorites.col.cursor, '<', cursor)

    const rows = await query

    return {
      streams: rows,
      cursor: rows.length > 0 ? rows[rows.length - 1].favCursor : null
    }
  }

/**
 * Get total amount of streams favorited by user
 */
export const getFavoritedStreamsCountFactory =
  (deps: { db: Knex }): GetFavoritedStreamsCount =>
  async (userId: string, streamIdWhitelist?: Optional<string[]>) => {
    const query = getFavoritedStreamsQueryBaseFactory(deps)(userId, streamIdWhitelist)
    query.count()

    const [res] = await query
    return parseInt(res.count)
  }

/**
 * Set stream as favorited/unfavorited for a specific user
 * @param {Object} p
 * @param {string} p.streamId
 * @param {string} p.userId
 * @param {boolean} [p.favorited] By default favorites the stream, but you can set this
 * to false to unfavorite it
 */
export const setStreamFavoritedFactory =
  (deps: { db: Knex }): SetStreamFavorited =>
  async (params: { streamId: string; userId: string; favorited?: boolean }) => {
    const { streamId, userId, favorited = true } = params

    if (!userId || !streamId)
      throw new InvalidArgumentError('Invalid stream or user ID', {
        info: { userId, streamId }
      })

    const favoriteQuery = tables.streamFavorites(deps.db).where({
      streamId,
      userId
    })

    if (!favorited) {
      await favoriteQuery.del()
      return
    }

    // Upserting the favorite
    await tables
      .streamFavorites(deps.db)
      .insert({
        userId,
        streamId
      })
      .onConflict(['streamId', 'userId'])
      .ignore()

    return
  }

/**
 * Get favorite metadata for specified user and all specified stream IDs
 */
export const getBatchUserFavoriteDataFactory =
  (deps: { db: Knex }): GetBatchUserFavoriteData =>
  async (params: { userId: string; streamIds: string[] }) => {
    const { userId, streamIds } = params
    if (!userId || !streamIds || !streamIds.length)
      throw new InvalidArgumentError('Invalid user ID or stream IDs', {
        info: { userId, streamIds }
      })

    const query = tables
      .streamFavorites(deps.db)
      .select()
      .where(StreamFavorites.col.userId, userId)
      .whereIn(StreamFavorites.col.streamId, streamIds)

    const rows = await query
    return keyBy(rows, 'streamId')
  }

/**
 * Get favorites counts for all specified streams
 */
export const getBatchStreamFavoritesCountsFactory =
  (deps: { db: Knex }): GetBatchStreamFavoritesCounts =>
  async (streamIds: string[]) => {
    const query = tables
      .streamFavorites(deps.db)
      .columns<{ streamId: string; count: string }[]>([
        StreamFavorites.col.streamId,
        knex.raw('COUNT(*) as count')
      ])
      .whereIn(StreamFavorites.col.streamId, streamIds)
      .groupBy(StreamFavorites.col.streamId)

    const rows = await query
    return mapValues(keyBy(rows, 'streamId'), (r) => parseInt(r?.count || '0'))
  }

/**
 * Check if user can favorite a stream
 */
export const canUserFavoriteStreamFactory =
  (deps: { db: Knex }): CanUserFavoriteStream =>
  async (params: { userId: string; streamId: string }) => {
    const { userId, streamId } = params

    if (!userId || !streamId)
      throw new InvalidArgumentError('Invalid stream or user ID', {
        info: { userId, streamId }
      })

    const query = tables
      .streams(deps.db)
      .select<Array<Pick<StreamRecord, 'id'>>>([Streams.col.id])
      .leftJoin(StreamAcl.name, function () {
        this.on(StreamAcl.col.resourceId, Streams.col.id).andOnVal(
          StreamAcl.col.userId,
          userId
        )
      })
      .where(Streams.col.id, streamId)
      .andWhere(function () {
        this.where(
          Streams.col.visibility,
          ProjectRecordVisibility.Public
        ).orWhereNotNull(StreamAcl.col.resourceId)
      })
      .limit(1)

    const result = await query
    return result?.length > 0
  }

/**
 * Find total favorites of owned streams for specified users
 */
export const getOwnedFavoritesCountByUserIdsFactory =
  (deps: { db: Knex }): GetOwnedFavoritesCountByUserIds =>
  async (userIds: string[]) => {
    const query = tables
      .streamAcl(deps.db)
      .select<Array<{ userId: string; count: string }>>([
        StreamAcl.col.userId,
        knex.raw('COUNT(*)')
      ])
      .join(StreamFavorites.name, function () {
        this.andOn(StreamFavorites.col.streamId, StreamAcl.col.resourceId)
      })
      .whereIn(StreamAcl.col.userId, userIds)
      .andWhere(StreamAcl.col.role, Roles.Stream.Owner)
      .groupBy(StreamAcl.col.userId)

    const results = await query
    return mapValues(keyBy(results, 'userId'), (r) => parseInt(r?.count || '0'))
  }

/**
 * Get user's role in all of the specified streams
 */
export const getStreamRolesFactory =
  (deps: { db: Knex }): GetStreamRoles =>
  async (userId: string, streamIds: string[]) => {
    const q = tables
      .streams(deps.db)
      .select<{ id: string; role: Nullable<StreamRoles> }[]>([
        Streams.col.id,
        StreamAcl.col.role
      ])
      .leftJoin(StreamAcl.name, (q) =>
        q
          .on(StreamAcl.col.resourceId, '=', Streams.col.id)
          .andOnVal(StreamAcl.col.userId, userId)
      )
      .whereIn(Streams.col.id, streamIds)

    const results = await q
    return mapValues(
      keyBy(results, (r) => r.id),
      (v) => v.role
    )
  }

const buildDiscoverableStreamsBaseQueryFactory =
  (deps: { db: Knex }) =>
  <Result = Array<StreamRecord>>(params: GetDiscoverableStreamsParams) => {
    const q = tables
      .streams(deps.db)
      .select<Result>(Streams.cols)
      .andWhere(Streams.col.visibility, ProjectRecordVisibility.Public)
      .andWhere(false) // TODO: No such thing as discoverability anymore, just return nothing

    if (params.streamIdWhitelist?.length) {
      q.whereIn(Streams.col.id, params.streamIdWhitelist)
    }

    return q
  }

const decodeDiscoverableStreamsCursor = (
  sortType: DiscoverableStreamsSortType,
  cursor: string
): Nullable<string | number> => {
  const decodedCursor = cursor ? decodeCursor(cursor) : null

  switch (sortType) {
    case DiscoverableStreamsSortType.CreatedDate: {
      let dateCursor: Nullable<string> = null
      try {
        dateCursor = dayjs(decodedCursor).toISOString()
      } catch (e: unknown) {
        if (!(e instanceof RangeError)) {
          throw e
        }
      }

      return dateCursor
    }
    case DiscoverableStreamsSortType.FavoritesCount: {
      const numericCursor = toNumber(decodedCursor)
      return isNaN(numericCursor) ? null : numericCursor
    }
  }
}

export const encodeDiscoverableStreamsCursor = (
  sortType: DiscoverableStreamsSortType,
  retrievedStreams: StreamRecord[],
  previousCursor: Nullable<string>
): Nullable<string> => {
  const decodedPreviousCursor = previousCursor
    ? decodeDiscoverableStreamsCursor(sortType, previousCursor)
    : null

  let value: Nullable<string>
  switch (sortType) {
    case DiscoverableStreamsSortType.CreatedDate: {
      // Using timestamps for filtering w/ a WHERE clause,
      // cause there will never be duplicates
      const lastItem = retrievedStreams.length
        ? retrievedStreams[retrievedStreams.length - 1]
        : null
      value = lastItem?.createdAt.toISOString() || null
      break
    }
    case DiscoverableStreamsSortType.FavoritesCount: {
      // Using offset based pagination here, cause there will be many rows with
      // the same favorite count
      const previousOffset: number = (decodedPreviousCursor as number) || 0
      value = `${previousOffset + retrievedStreams.length}`
      break
    }
  }

  return value ? encodeCursor(value) : null
}

/**
 * Counts all discoverable streams
 */
export const countDiscoverableStreamsFactory =
  (deps: { db: Knex }): CountDiscoverableStreams =>
  async (params: GetDiscoverableStreamsParams) => {
    const q =
      buildDiscoverableStreamsBaseQueryFactory(deps)<{ count: string }[]>(params)
    q.clearSelect()
    q.count()

    const [res] = await q
    return parseInt(res.count)
  }

/**
 * Paginated discoverable stream retrieval with support for multiple sorting approaches
 */
export const getDiscoverableStreamsPageFactory =
  (deps: { db: Knex }): GetDiscoverableStreamsPage =>
  async (params: GetDiscoverableStreamsParams) => {
    const { cursor, sort, limit } = params
    const q = buildDiscoverableStreamsBaseQueryFactory(deps)(params).limit(limit)

    const decodedCursor = cursor
      ? decodeDiscoverableStreamsCursor(sort.type, cursor)
      : null
    const sortOperator = sort.direction === SortDirection.Asc ? '>' : '<'

    switch (sort.type) {
      case DiscoverableStreamsSortType.CreatedDate: {
        q.orderBy([
          { column: Streams.col.createdAt, order: sort.direction },
          { column: Streams.col.name }
        ])

        if (decodedCursor) {
          q.andWhere(Streams.col.createdAt, sortOperator, decodedCursor)
        }

        break
      }
      case DiscoverableStreamsSortType.FavoritesCount: {
        q.leftJoin(StreamFavorites.name, StreamFavorites.col.streamId, Streams.col.id)
          .groupBy(Streams.col.id)
          .orderByRaw(`COUNT("stream_favorites"."streamId") ${sort.direction}`)
          .orderBy([{ column: Streams.col.name }])

        if (decodedCursor) q.offset(decodedCursor as number)
        break
      }
    }

    return await q
  }

export const getStreamsCollaboratorCountsFactory =
  (deps: { db: Knex }): GetStreamsCollaboratorCounts =>
  async ({ streamIds, type }) => {
    if (!streamIds.length) return {}

    const q = tables
      .streamAcl(deps.db)
      .whereIn(StreamAcl.col.resourceId, streamIds)
      .groupBy(StreamAcl.col.resourceId, StreamAcl.col.role)
      .select<Array<{ streamId: string; role: StreamRoles; count: string }>>([
        StreamAcl.colAs('resourceId', 'streamId'),
        StreamAcl.col.role,
        knex.raw('COUNT(*) as count')
      ])

    if (type) {
      q.andWhere(StreamAcl.col.role, type)
    }

    const res = await q
    return res.reduce((acc, { streamId, role, count }) => {
      acc[streamId] = acc[streamId] || {}
      acc[streamId][role] = parseInt(count)
      return acc
    }, {} as Awaited<ReturnType<GetStreamsCollaboratorCounts>>)
  }

/**
 * Get stream collaborators for multiple streams at a time
 */
export const getStreamsCollaboratorsFactory =
  (deps: { db: Knex }): GetStreamsCollaborators =>
  async ({ streamIds }) => {
    if (!streamIds.length) return {}

    const q = tables
      .streamAcl(deps.db)
      .select<Array<UserWithRole & { streamRole: StreamRoles; streamId: string }>>([
        ...Users.cols,
        knex.raw(`(array_agg(??))[1] as "streamRole"`, [StreamAcl.col.role]),
        knex.raw(`(array_agg(??))[1] as "streamId"`, [StreamAcl.col.resourceId]),
        knex.raw(`(array_agg(??))[1] as "role"`, [ServerAcl.col.role])
      ])
      .whereIn(StreamAcl.col.resourceId, streamIds)
      .innerJoin(Users.name, Users.col.id, StreamAcl.col.userId)
      .innerJoin(ServerAcl.name, ServerAcl.col.userId, Users.col.id)
      .groupBy(StreamAcl.col.resourceId, Users.col.id)

    const res = (await q).map((i) => ({
      ...removePrivateFields(i),
      streamRole: i.streamRole,
      role: i.role,
      streamId: i.streamId
    }))

    return groupBy(res, 'streamId')
  }

/**
 * Get all stream collaborators. Optionally filter only specific roles.
 */
export const getStreamCollaboratorsFactory =
  (deps: { db: Knex }): GetStreamCollaborators =>
  async (streamId: string, type?: StreamRoles, options?) => {
    const { limit } = options || {}

    const q = tables
      .streamAcl(deps.db)
      .select<Array<UserWithRole & { streamRole: StreamRoles }>>([
        ...Users.cols,
        knex.raw(`${StreamAcl.col.role} as "streamRole"`),
        knex.raw(`(array_agg(${ServerAcl.col.role}))[1] as "role"`)
      ])
      .where(StreamAcl.col.resourceId, streamId)
      .innerJoin(Users.name, Users.col.id, StreamAcl.col.userId)
      .innerJoin(ServerAcl.name, ServerAcl.col.userId, Users.col.id)
      .groupBy(Users.col.id, StreamAcl.col.role)

    if (type) {
      q.andWhere(StreamAcl.col.role, type)
    }

    if (limit) {
      q.limit(limit)
    }

    const items = (await q).map((i) => ({
      ...removePrivateFields(i),
      streamRole: i.streamRole,
      role: i.role
    }))
    return items
  }

/**
 * Get base query for finding or counting user streams
 */
const getUserStreamsQueryBaseFactory =
  (deps: { db: Knex }) =>
  ({
    userId,
    searchQuery,
    forOtherUser,
    ownedOnly,
    withRoles,
    streamIdWhitelist,
    workspaceId,
    onlyWithActiveSsoSession,
    personalOnly,
    includeImplicitAccess
  }: BaseUserStreamsQueryParams) => {
    const query = tables.streams(deps.db).leftJoin(StreamAcl.name, (j1) => {
      j1.on(StreamAcl.col.resourceId, Streams.col.id).andOnVal(
        StreamAcl.col.userId,
        userId
      )
    })

    if (includeImplicitAccess) {
      /**
       * implicit access rules:
       * 1. user must have an explicit stream role OR
       * 2. if project is in a workspace that the user is in:
       *  - user must be a workspace admin OR
       *  - project must not be fully private and user is non-workspace-guest
       */
      query
        .leftJoin(WorkspaceAcl.name, (j2) => {
          j2.on(WorkspaceAcl.col.workspaceId, Streams.col.workspaceId).andOnVal(
            WorkspaceAcl.col.userId,
            userId
          )
        })
        .andWhere((w1) => {
          w1.whereNotNull(StreamAcl.col.role).orWhere((w2) => {
            // Implicit workspace role conditions
            w2.whereNotNull(WorkspaceAcl.col.role).andWhere((w2) => {
              w2.andWhere(WorkspaceAcl.col.role, Roles.Workspace.Admin).orWhere(
                (w4) => {
                  w4.where(
                    WorkspaceAcl.col.role,
                    '!=',
                    Roles.Workspace.Guest
                  ).andWhereNot(Streams.col.visibility, ProjectRecordVisibility.Private)
                }
              )
            })
          })
        })
    } else {
      // expect explicit stream role
      query.whereNotNull(StreamAcl.col.role)
    }

    if (onlyWithActiveSsoSession) {
      query
        .leftJoin(
          'workspace_sso_providers',
          'workspace_sso_providers.workspaceId',
          Streams.col.workspaceId
        )
        .leftJoin('user_sso_sessions', function () {
          this.on('user_sso_sessions.userId', '=', StreamAcl.col.userId).andOn(
            'workspace_sso_providers.providerId',
            '=',
            'user_sso_sessions.providerId'
          )
        })
        .andWhere(function () {
          this.whereRaw(
            'workspace_sso_providers."providerId" is not null and user_sso_sessions."validUntil" > now()'
          ).orWhere('workspace_sso_providers.providerId', 'is', null)
        })
    }

    if (workspaceId?.length) {
      query.andWhere(Streams.col.workspaceId, workspaceId)
    } else if (personalOnly) {
      query.andWhere(Streams.col.workspaceId, null)
    }

    if (ownedOnly || withRoles?.length) {
      const roles: StreamRoles[] = [
        ...(withRoles || []),
        ...(ownedOnly ? [Roles.Stream.Owner] : [])
      ]
      query.whereIn(StreamAcl.col.role, roles)
    }

    if (forOtherUser) {
      // TODO: How did this work before discoverability?
      query.andWhere(Streams.col.visibility, ProjectRecordVisibility.Public)
    }

    if (searchQuery) {
      query.andWhere(function () {
        this.where(Streams.col.name, 'ILIKE', `%${searchQuery}%`)
          .orWhere(Streams.col.description, 'ILIKE', `%${searchQuery}%`)
          .orWhere(Streams.col.id, 'ILIKE', `%${searchQuery}%`) //potentially useless?
      })
    }

    if (streamIdWhitelist?.length) {
      query.whereIn(Streams.col.id, streamIdWhitelist)
    }

    return query
  }

function addSortByProjectRoleCondition(query: Knex.QueryBuilder) {
  return query.orderByRaw(
    `CASE WHEN stream_acl."role" = '${Roles.Stream.Owner}' THEN 1 WHEN stream_acl."role" = '${Roles.Stream.Contributor}' THEN 2 WHEN stream_acl."role" = '${Roles.Stream.Reviewer}' THEN 3 end asc`
  )
}

/**
 * Get streams the user is a collaborator on
 */
export const getUserStreamsPageFactory =
  (deps: { db: Knex }): GetUserStreamsPage =>
  async (params: UserStreamsQueryParams) => {
    const { limit, cursor } = params
    const finalLimit = clamp(limit || 25, 1, 50)

    const query = getUserStreamsQueryBaseFactory(deps)(params)
    query.select(STREAM_WITH_OPTIONAL_ROLE_COLUMNS)

    type CursorType = { updatedAt: string; id: string }

    const decodedCursor = decodeCompositeCursor<CursorType>(
      cursor,
      (c) => isObjectLike(c) && has(c, 'id') && has(c, 'updatedAt')
    )
    if (decodedCursor) {
      // filter by date, and if there's duplicate dates, filter by id too
      query.andWhereRaw('(??, ??) < (?, ?)', [
        Streams.col.updatedAt,
        Streams.col.id,
        decodedCursor.updatedAt,
        decodedCursor.id
      ])
    }

    if (params.sortBy && params.sortBy?.length > 0) {
      for (const key of params.sortBy) {
        if (key === 'role') {
          addSortByProjectRoleCondition(query)
          continue
        }
        query.orderBy(key, 'asc')
      }
    }
    query
      .orderBy(Streams.col.updatedAt, 'desc')
      .orderBy(Streams.col.id, 'desc')
      .limit(finalLimit)

    const rows = (await query) as StreamWithOptionalRole[]
    const newCursorRow = rows.at(-1)
    const newCursor = newCursorRow
      ? encodeCompositeCursor<CursorType>({
          updatedAt: newCursorRow.updatedAt.toISOString(),
          id: newCursorRow.id
        })
      : null

    return {
      streams: rows,
      cursor: newCursor
    }
  }

/**
 * Get the total amount of streams the user is a collaborator on
 */
export const getUserStreamsCountFactory =
  (deps: { db: Knex }): GetUserStreamsCount =>
  async (params: UserStreamsQueryCountParams) => {
    const query = getUserStreamsQueryBaseFactory(deps)(params)
    const countQuery = query.count<{ count: string }[]>()

    const [res] = await countQuery
    return parseInt(res.count)
  }

export const createStreamFactory =
  (deps: { db: Knex }): StoreStream =>
  async (input, options) => {
    const { name, description } = input
    const { ownerId, trx } = options || {}

    let visibility: ProjectRecordVisibility
    if (isProjectCreateInput(input)) {
      visibility = mapGqlToDbProjectVisibility(
        input.visibility || (input.workspaceId ? 'WORKSPACE' : 'PRIVATE')
      )
    } else {
      visibility =
        input.isPublic !== false
          ? ProjectRecordVisibility.Public
          : ProjectRecordVisibility.Private
    }

    const workspaceId = 'workspaceId' in input ? input.workspaceId : null
    const regionKey = 'regionKey' in input ? input.regionKey || null : null

    const id = generateId()
    const stream = {
      id,
      name: name || generateProjectName(),
      description: description || '',
      visibility,
      updatedAt: knex.fn.now(),
      workspaceId: workspaceId || null,
      regionKey
    }

    // Create the stream & set up permissions
    const streamQuery = tables.streams(deps.db).insert(stream, '*')
    if (trx) streamQuery.transacting(trx)

    const insertResults = await streamQuery
    const newStream = insertResults[0] as StreamRecord

    if (ownerId) {
      const streamAclQuery = tables.streamAcl(deps.db).insert({
        userId: ownerId,
        resourceId: id,
        role: Roles.Stream.Owner
      })
      if (trx) streamAclQuery.transacting(trx)
      await streamAclQuery
    }

    return newStream
  }

export const getUserStreamCountsFactory =
  (deps: { db: Knex }): GetUserStreamCounts =>
  async (params: {
    userIds: string[]
    /**
     * If true, will only count public & discoverable streams
     */
    publicOnly?: boolean
  }) => {
    const { userIds, publicOnly = false } = params
    if (!userIds.length) return {}

    const q = tables
      .streamAcl(deps.db)
      .select<{ userId: string; count: string }[]>([
        StreamAcl.col.userId,
        knex.raw('COUNT(*)')
      ])
      .whereIn(StreamAcl.col.userId, userIds)
      .groupBy(StreamAcl.col.userId)

    if (publicOnly) {
      q.join(Streams.name, Streams.col.id, StreamAcl.col.resourceId).andWhere((q1) => {
        q1.where(Streams.col.visibility, ProjectRecordVisibility.Public)
      })
    }

    const results = await q
    return mapValues(keyBy(results, 'userId'), (r) => parseInt(r.count))
  }

export const deleteStreamFactory =
  (deps: { db: Knex }): DeleteStreamRecord =>
  async (streamId: string) => {
    // Delete stream commits (not automatically cascaded)
    await deps.db.raw(
      `
      DELETE FROM commits WHERE id IN (
        SELECT sc."commitId" FROM streams s
        INNER JOIN stream_commits sc ON s.id = sc."streamId"
        WHERE s.id = ?
      )
      `,
      [streamId]
    )
    return await tables.streams(deps.db).where(Streams.col.id, streamId).del()
  }

export const getStreamsSourceAppsFactory =
  (deps: { db: Knex }): GetStreamsSourceApps =>
  async (streamIds: string[]) => {
    if (!streamIds?.length) return {}

    const q = tables
      .streams(deps.db)
      .select<{ id: string; sourceApplication: string }[]>([
        Streams.col.id,
        Commits.col.sourceApplication
      ])
      .whereIn(Streams.col.id, streamIds)
      .whereNotNull(Commits.col.sourceApplication)
      .innerJoin(StreamCommits.name, StreamCommits.col.streamId, Streams.col.id)
      .innerJoin(Commits.name, StreamCommits.col.commitId, Commits.col.id)

    const results = await q
    const mappedToSets = reduce(
      results,
      (result, item) => {
        const set = result[item.id] || new Set<string>()
        if (item.sourceApplication?.length) set.add(item.sourceApplication)
        result[item.id] = set

        return result
      },
      {} as Record<string, Set<string>>
    )
    return mapValues(mappedToSets, (v) => [...v.values()])
  }

const isProjectUpdateInput = (
  i: StreamUpdateInput | ProjectUpdateInput
): i is ProjectUpdateInput => has(i, 'visibility')

export const updateStreamFactory =
  (deps: { db: Knex }): UpdateStreamRecord =>
  async (update: StreamUpdateInput | ProjectUpdateInput) => {
    const { id: streamId } = update

    if (!update.name) update.name = null // to prevent saving name ''
    const validUpdate: Partial<StreamRecord> & Record<string, unknown> = omitBy(
      update,
      (v) => isNull(v) || isUndefined(v)
    )

    if (isProjectUpdateInput(update)) {
      if (has(update, 'visibility')) {
        validUpdate.visibility = mapGqlToDbProjectVisibility(
          update.visibility || 'PRIVATE'
        )
      }
    } else {
      if (has(update, 'isPublic')) {
        validUpdate.visibility = update.isPublic
          ? ProjectRecordVisibility.Public
          : ProjectRecordVisibility.Private
      }
    }

    if (
      has(validUpdate, 'visibility') &&
      validUpdate.visibility !== ProjectRecordVisibility.Public
    ) {
      validUpdate.allowPublicComments = false
    } else if (
      has(validUpdate, 'allowPublicComments') &&
      validUpdate.allowPublicComments
    ) {
      validUpdate.isPublic = true
    }

    // Remove non-existant fields
    delete validUpdate['isDiscoverable']
    delete validUpdate['isPublic']

    if (!Object.keys(validUpdate).length) return null

    const [updatedStream] = await tables
      .streams(deps.db)
      .returning('*')
      .where({ id: streamId })
      .update<StreamRecord[]>({
        ...validUpdate,
        updatedAt: knex.fn.now()
      })

    return updatedStream
  }

/** @deprecated Use `updateStreamFactory` */
export const updateProjectFactory =
  ({ db }: { db: Knex }): UpdateProject =>
  async ({ projectUpdate }) => {
    const [updatedStream] = await tables
      .streams(db)
      .returning('*')
      .where({ id: projectUpdate.id })
      .update<StreamRecord[]>({
        ...omit(projectUpdate, ['id']),
        updatedAt: knex.fn.now()
      })

    if (!updatedStream) {
      throw new StreamUpdateError('Stream was not updated.')
    }

    return updatedStream
  }

export const markBranchStreamUpdatedFactory =
  (deps: { db: Knex }): MarkBranchStreamUpdated =>
  async (branchId: string) => {
    const q = tables
      .streams(deps.db)
      .whereIn(Streams.col.id, (w) => {
        w.select(Branches.col.streamId)
          .from(Branches.name)
          .where(Branches.col.id, branchId)
      })
      .update(Streams.withoutTablePrefix.col.updatedAt, new Date())
    const updates = await q
    return updates > 0
  }

export const markCommitStreamUpdatedFactory =
  (deps: { db: Knex }): MarkCommitStreamUpdated =>
  async (commitId: string) => {
    const q = tables
      .streams(deps.db)
      .whereIn(Streams.col.id, (w) => {
        w.select(StreamCommits.col.streamId)
          .from(StreamCommits.name)
          .where(StreamCommits.col.commitId, commitId)
      })
      .update(Streams.withoutTablePrefix.col.updatedAt, new Date())
    const updates = await q
    return updates > 0
  }

export const upsertProjectRoleFactory =
  ({ db }: { db: Knex }): UpsertProjectRole =>
  async (
    { projectId, userId, role },
    { trackProjectUpdate } = { trackProjectUpdate: true }
  ) => {
    const res = await grantStreamPermissionsFactory({ db })(
      {
        streamId: projectId,
        userId,
        role
      },
      { trackProjectUpdate }
    )
    return res! // TODO: stream theoretically can be optional, return type needs fixing
  }

export const grantStreamPermissionsFactory =
  (deps: { db: Knex }): GrantStreamPermissions =>
  async (
    params: {
      streamId: string
      userId: string
      role: StreamRoles
    },
    options: { trackProjectUpdate?: boolean } = { trackProjectUpdate: true }
  ) => {
    const { streamId, userId, role } = params

    // assert we are not removing last admin from project
    const existingRole = await tables
      .streamAcl(deps.db)
      .where({
        [StreamAcl.col.resourceId]: streamId,
        [StreamAcl.col.userId]: userId
      })
      .first()

    if (existingRole?.role === Roles.Stream.Owner && role !== Roles.Stream.Owner) {
      const [countObj] = await tables
        .streamAcl(deps.db)
        .where({
          resourceId: streamId,
          role: Roles.Stream.Owner
        })
        .count()
      if (parseInt(countObj.count as string) === 1)
        throw new StreamAccessUpdateError(
          'A project needs at least one project owner',
          {
            info: { streamId, userId }
          }
        )
    }

    // upserts the existing role (sets a new one!)
    const query =
      tables
        .streamAcl(deps.db)
        .insert({ userId, resourceId: streamId, role })
        .toString() +
      ' on conflict on constraint stream_acl_pkey do update set role=excluded.role'

    await deps.db.raw(query)

    const streamsQuery = tables.streams(deps.db)
    if (options.trackProjectUpdate) {
      // update stream updated at
      streamsQuery.update({ updatedAt: knex.fn.now() }, '*')
    }

    const streams = await streamsQuery.where({ id: streamId })
    return streams[0] as StreamRecord
  }

/**
 * Convenience wrapper around grantStreamPermissions, renaming streams -> projects
 */
export const grantProjectPermissionsFactory = (
  deps: Parameters<typeof grantStreamPermissionsFactory>[0]
): GrantProjectPermissions => {
  const grant = grantStreamPermissionsFactory(deps)
  return async (params) => await grant({ ...params, streamId: params.projectId })
}

export const deleteProjectRoleFactory =
  ({ db }: { db: Knex }): DeleteProjectRole =>
  async ({ projectId, userId }) => {
    return await revokeStreamPermissionsFactory({ db })({
      streamId: projectId,
      userId
    })
  }

export const revokeStreamPermissionsFactory =
  (deps: { db: Knex }): RevokeStreamPermissions =>
  async (params, options) => {
    const { streamId, userId } = params
    const { trackProjectUpdate = true } = options || {}

    const existingPermission = await tables
      .streamAcl(deps.db)
      .where({
        [StreamAcl.col.resourceId]: streamId,
        [StreamAcl.col.userId]: userId
      })
      .first()
    if (!existingPermission) {
      // User already doesn't have permissions
      return await tables
        .streams(deps.db)
        .where({ [Streams.col.id]: streamId })
        .first()
    }

    const [streamAclEntriesCount] = await tables
      .streamAcl(deps.db)
      .where({ resourceId: streamId })
      .count<{ count: string }[]>()

    if (parseInt(streamAclEntriesCount.count) === 1)
      throw new StreamAccessUpdateError('A project needs at least one project owner', {
        info: { streamId, userId }
      })

    const aclEntry = existingPermission
    if (aclEntry?.role === Roles.Stream.Owner) {
      const [countObj] = await tables
        .streamAcl(deps.db)
        .where({
          resourceId: streamId,
          role: Roles.Stream.Owner
        })
        .count()
      if (parseInt(countObj.count as string) === 1)
        throw new StreamAccessUpdateError(
          'A project needs at least one project owner',
          {
            info: { streamId, userId }
          }
        )
      else {
        await tables.streamAcl(deps.db).where({ resourceId: streamId, userId }).del()
      }
    } else {
      const delCount = await tables
        .streamAcl(deps.db)
        .where({ resourceId: streamId, userId })
        .del()

      if (delCount === 0)
        throw new StreamAccessUpdateError('Could not revoke permissions for user', {
          info: { streamId, userId }
        })
    }

    // update stream updated at, if enabled
    const streamQ = tables.streams(deps.db).where({ id: streamId })

    if (trackProjectUpdate) {
      streamQ.update({ updatedAt: knex.fn.now() }, '*')
    }

    const [stream] = await streamQ
    return stream
  }

/**
 * Mark stream as the onboarding base stream from which user onboarding streams will be cloned
 */
export const markOnboardingBaseStreamFactory =
  (deps: { db: Knex }): MarkOnboardingBaseStream =>
  async (streamId: string, version: string) => {
    const stream = await getStreamFactory(deps)({ streamId })
    if (!stream) {
      throw new StreamNotFoundError(`Stream ${streamId} not found`)
    }
    await updateStreamFactory(deps)({
      id: streamId,
      name: 'Onboarding Stream Local Source - Do Not Delete'
    })
    const meta = metaHelpers(Streams, deps.db)
    await meta.set(streamId, Streams.meta.metaKey.onboardingBaseStream, version)
  }

/**
 * Get onboarding base stream, if any
 */
export const getOnboardingBaseStreamFactory =
  (deps: { db: Knex }): GetOnboardingBaseStream =>
  async (version: string) => {
    const q = tables
      .streams(deps.db)
      .select<StreamRecord[]>(Streams.cols)
      .innerJoin(Streams.meta.name, Streams.meta.col.streamId, Streams.col.id)
      .where(Streams.meta.col.key, Streams.meta.metaKey.onboardingBaseStream)
      .andWhereRaw(`${Streams.meta.col.value}::text = ?`, JSON.stringify(version))
      .first()

    return await q
  }

/**
 * @deprecated Use getStreams() from the repository directly
 */
export const legacyGetStreamsFactory =
  (deps: { db: Knex }): LegacyGetStreams =>
  async ({
    cursor,
    limit,
    orderBy,
    visibility,
    searchQuery,
    streamIdWhitelist,
    workspaceIdWhitelist,
    offset,
    publicOnly,
    userId
  }) => {
    const query = tables.streams(deps.db)

    if (searchQuery) {
      const whereFunc: Knex.QueryCallback = function () {
        this.where('streams.name', 'ILIKE', `%${searchQuery}%`).orWhere(
          'streams.description',
          'ILIKE',
          `%${searchQuery}%`
        )
      }
      query.where(whereFunc)
    }

    if (publicOnly) {
      visibility = 'public'
    }

    if (visibility && visibility !== 'all') {
      if (
        ![
          ProjectRecordVisibility.Private,
          ProjectRecordVisibility.Public,
          ProjectRecordVisibility.Workspace
        ].includes(visibility)
      )
        throw new LogicError(
          'Stream visibility should be either private, public, workspace or all'
        )
      const publicFunc: Knex.QueryCallback = function () {
        this.where({ visibility })
      }
      query.andWhere(publicFunc)
    }

    if (streamIdWhitelist?.length) {
      query.whereIn('id', streamIdWhitelist)
    }

    if (workspaceIdWhitelist?.length) {
      query.whereIn('workspaceId', workspaceIdWhitelist)
    }

    if (userId) {
      query.select<StreamWithOptionalRole[]>([
        ...Object.values(Streams.col),
        // Getting first role from grouped results
        knex.raw(`(array_agg("stream_acl"."role"))[1] as role`)
      ])
      query.leftJoin(StreamAcl.name, function () {
        this.on(StreamAcl.col.resourceId, Streams.col.id).andOnVal(
          StreamAcl.col.userId,
          userId
        )
      })
      query.groupBy(Streams.col.id)
    }

    const countQ = deps.db.from(query.clone().as('t1')).count()
    const [res] = await countQ
    const count = parseInt(res.count + '')

    if (!count) return { streams: [], totalCount: 0, cursorDate: null }

    orderBy = orderBy || 'updatedAt,desc'

    const [columnName, order] = orderBy.split(',')

    if (cursor) query.where(columnName, order === 'desc' ? '<' : '>', cursor)

    query.orderBy(`${columnName}`, order).limit(limit)
    if (offset) {
      query.offset(offset)
    }

    const rows = await query

    const cursorDate = rows.length
      ? rows.slice(-1)[0][columnName as keyof StreamRecord]
      : null
    return {
      streams: rows,
      totalCount: count,
      cursorDate: cursorDate as Nullable<Date>
    }
  }

export const getUserDeletableStreamsFactory =
  (deps: { db: Knex }): GetUserDeletableStreams =>
  async (id) => {
    const streams = (await deps.db.raw(
      `
      -- Get the stream ids with only this user as owner
      SELECT "resourceId" as id
      FROM (
        -- Compute (streamId, ownerCount) table for streams on which the user is owner
        SELECT acl."resourceId", count(*) as cnt
        FROM stream_acl acl
        INNER JOIN
          (
          -- Get streams ids on which the user is owner
          SELECT "resourceId" FROM stream_acl
          WHERE role = '${Roles.Stream.Owner}' AND "userId" = ?
          ) AS us ON acl."resourceId" = us."resourceId"
        WHERE acl.role = '${Roles.Stream.Owner}'
        GROUP BY (acl."resourceId")
      ) AS soc
      WHERE cnt = 1
      `,
      [id]
    )) as { rows: { id: string }[] }

    return streams.rows.map((s) => s.id)
  }

/**
 * Get count of projects user explicitly or implicitly (through workspaces) has access to
 */
export const getImplicitUserProjectsCountFactory =
  (deps: { db: Knex }): GetImplicitUserProjectsCountFactory =>
  async (params) => {
    const q = tables
      .streams(deps.db)
      .select<{ count: string }[]>(knex.raw('COUNT(??) as count', [Streams.col.id]))
      .leftJoin(StreamAcl.name, (j) => {
        j.on(StreamAcl.col.resourceId, Streams.col.id).andOnVal(
          StreamAcl.col.userId,
          params.userId
        )
      })
      .leftJoin(WorkspaceAcl.name, (j) => {
        j.on(WorkspaceAcl.col.workspaceId, Streams.col.workspaceId).andOnVal(
          WorkspaceAcl.col.userId,
          params.userId
        )
      })
      .where((w) => {
        w.whereNotNull(StreamAcl.col.userId).orWhereNotNull(WorkspaceAcl.col.userId)
      })

    const [{ count }] = await q
    return parseInt(count)
  }

/**
 * Batch the explicit projects givent by the workspace, the user or both
 */
export const getExplicitProjects =
  (deps: { db: Knex }): GetExplicitProjects =>
  async ({ limit, cursor, filter: { userId, workspaceId } }) => {
    if (!userId && !workspaceId) throw new LogicError('A filter must be provided')

    const cursorTarget = Streams.col.id
    const q = tables
      .streams(deps.db)
      .select<StreamWithOptionalRole[]>([
        ...Object.values(Streams.col),
        ...(userId ? [StreamAcl.col.role] : [])
      ])
      .limit(limit)
      .orderBy(cursorTarget, 'desc')

    if (userId) {
      q.join(StreamAcl.name, (j) => {
        j.on(StreamAcl.col.resourceId, Streams.col.id).andOnVal(
          StreamAcl.col.userId,
          userId
        )
      })
    }

    if (cursor) {
      q.where(cursorTarget, '<', decodeCursor(cursor))
    }

    if (workspaceId) {
      q.where(Streams.col.workspaceId, workspaceId)
    }

    const rows = await q

    return {
      items: rows,
      cursor: rows.length ? encodeCursor(rows[rows.length - 1].id) : null
    }
  }
