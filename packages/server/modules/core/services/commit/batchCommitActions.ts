import type {
  GetStreamBranchByName,
  StoreBranch
} from '@/modules/core/domain/branches/operations'
import { VersionEvents } from '@/modules/core/domain/commits/events'
import type {
  DeleteCommits,
  GetCommits,
  MoveCommitsToBranch,
  ValidateAndBatchDeleteCommits,
  ValidateAndBatchMoveCommits
} from '@/modules/core/domain/commits/operations'
import type { GetStreams } from '@/modules/core/domain/streams/operations'
import {
  CommitInvalidAccessError,
  CommitBatchUpdateError
} from '@/modules/core/errors/commit'
import type {
  CommitsDeleteInput,
  CommitsMoveInput,
  DeleteVersionsInput,
  MoveVersionsInput
} from '@/modules/core/graph/generated/graphql'
import { Roles } from '@/modules/core/helpers/mainConstants'
import { ensureError } from '@/modules/shared/helpers/errorHelper'
import type { EventBusEmit } from '@/modules/shared/services/eventBus'
import { difference, groupBy, has, keyBy } from 'lodash-es'

type OldBatchInput = CommitsMoveInput | CommitsDeleteInput
type CommitBatchInput = OldBatchInput | MoveVersionsInput | DeleteVersionsInput

const isOldBatchInput = (i: CommitBatchInput): i is OldBatchInput => has(i, 'commitIds')

type ValidateBatchBaseRulesDeps = {
  getCommits: GetCommits
  getStreams: GetStreams
}

/**
 * Do base validation that's going to be appropriate for all batch actions and return
 * the DB entities that were tested
 */
const validateBatchBaseRulesFactory =
  (deps: ValidateBatchBaseRulesDeps) =>
  async (params: CommitBatchInput, userId: string) => {
    const commitIds = isOldBatchInput(params) ? params.commitIds : params.versionIds

    if (!userId) {
      throw new CommitInvalidAccessError(
        'User must be authenticate to operate with commits'
      )
    }
    if (!commitIds?.length) {
      throw new CommitBatchUpdateError('No commits specified')
    }

    const commits = await deps.getCommits(commitIds)
    const foundCommitIds = commits.map((c) => c.id)
    if (
      commitIds.length !== foundCommitIds.length ||
      difference(commitIds, foundCommitIds).length > 0
    ) {
      throw new CommitBatchUpdateError('At least one of the commits does not exist')
    }

    const streamGroups = groupBy(commits, (c) => c.streamId)
    const streamIds = Object.keys(streamGroups)
    const streams = await deps.getStreams(streamIds, { userId })

    if (
      streamIds.length !== streams.length ||
      difference(
        streamIds,
        streams.map((s) => s.id)
      ).length > 0
    ) {
      throw new CommitBatchUpdateError("At least one commit stream wasn't found")
    }

    const streamsById = keyBy(streams, (s) => s.id)
    const commitsWithStreams = commits.map((c) => ({
      commit: c,
      stream: streamsById[c.streamId]
    }))

    for (const { commit, stream } of commitsWithStreams) {
      if (stream.role !== Roles.Stream.Owner && commit.author !== userId) {
        throw new CommitInvalidAccessError(
          'To operate on these commits you must either own them or their streams'
        )
      }
    }

    return { commitsWithStreams, commits, streams }
  }

type ValidateCommitsMoveDeps = ValidateBatchBaseRulesDeps & {
  getStreamBranchByName: GetStreamBranchByName
}

/**
 * Validate batch move params
 */
const validateCommitsMoveFactory =
  (deps: ValidateCommitsMoveDeps) =>
  async (params: CommitsMoveInput | MoveVersionsInput, userId: string) => {
    const targetBranch = isOldBatchInput(params)
      ? params.targetBranch
      : params.targetModelName
    const { streams, commitsWithStreams } = await validateBatchBaseRulesFactory(deps)(
      params,
      userId
    )

    if (streams.length > 1) {
      throw new CommitBatchUpdateError('Commits belong to different streams')
    }

    const stream = streams[0]
    const branch = await deps.getStreamBranchByName(stream.id, targetBranch)

    if (
      !branch &&
      !(<string[]>[Roles.Stream.Contributor, Roles.Stream.Owner]).includes(
        stream.role || ''
      )
    ) {
      throw new CommitBatchUpdateError(
        'Non-existant target branch referenced and active user does not have the rights to create a new one'
      )
    }

    return { stream, branch, commitsWithStreams }
  }

/**
 * Validate batch delete params
 */
const validateCommitsDeleteFactory =
  (deps: ValidateBatchBaseRulesDeps) =>
  async (params: CommitsDeleteInput | DeleteVersionsInput, userId: string) => {
    const validateBatchBaseRules = validateBatchBaseRulesFactory(deps)
    return await validateBatchBaseRules(params, userId)
  }

/**
 * Move a batch of commits belonging to the same stream to another branch
 */
export const batchMoveCommitsFactory =
  (
    deps: ValidateCommitsMoveDeps & {
      createBranch: StoreBranch
      moveCommitsToBranch: MoveCommitsToBranch
      emitEvent: EventBusEmit
    }
  ): ValidateAndBatchMoveCommits =>
  async (params: CommitsMoveInput | MoveVersionsInput, userId: string) => {
    const { commitIds, targetBranch } = isOldBatchInput(params)
      ? params
      : { commitIds: params.versionIds, targetBranch: params.targetModelName }

    const { branch, stream, commitsWithStreams } = await validateCommitsMoveFactory(
      deps
    )(params, userId)

    try {
      const finalBranch =
        branch ||
        (await deps.createBranch({
          name: targetBranch,
          streamId: stream.id,
          authorId: userId,
          description: null
        }))

      await deps.moveCommitsToBranch(commitIds, finalBranch.id)
      await Promise.all(
        commitsWithStreams.map(async ({ commit, stream }) => {
          await deps.emitEvent({
            eventName: VersionEvents.MovedModel,
            payload: {
              versionId: commit.id,
              projectId: stream.id,
              userId,
              originalModelId: commit.branchId,
              newModelId: finalBranch.id,
              version: commit
            }
          })
        })
      )
      return finalBranch
    } catch (e) {
      const err = ensureError(e)
      throw new CommitBatchUpdateError('Batch commit move failed', { cause: err })
    }
  }

/**
 * Delete a batch of commits
 */
export const batchDeleteCommitsFactory =
  (
    deps: ValidateBatchBaseRulesDeps & {
      deleteCommits: DeleteCommits
      emitEvent: EventBusEmit
    }
  ): ValidateAndBatchDeleteCommits =>
  async (params: CommitsDeleteInput | DeleteVersionsInput, userId: string) => {
    const commitIds = isOldBatchInput(params) ? params.commitIds : params.versionIds

    const { commitsWithStreams } = await validateCommitsDeleteFactory(deps)(
      params,
      userId
    )

    try {
      await deps.deleteCommits(commitIds)
      await Promise.all(
        commitsWithStreams.map(async ({ commit, stream }) => {
          await Promise.all([
            deps.emitEvent({
              eventName: VersionEvents.Deleted,
              payload: {
                projectId: stream.id,
                modelId: commit.branchId,
                versionId: commit.id,
                userId,
                version: commit
              }
            })
          ])
        })
      )
    } catch (e) {
      const err = ensureError(e)
      throw new CommitBatchUpdateError('Batch commit delete failed', { cause: err })
    }
  }
