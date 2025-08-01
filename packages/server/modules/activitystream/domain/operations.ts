import type {
  Activity,
  ActivitySummary,
  CommentCreatedActivityInput,
  ReplyCreatedActivityInput,
  ResourceEventsToPayloadMap,
  ResourceType,
  StreamActionType
} from '@/modules/activitystream/domain/types'
import type {
  StreamActivityRecord,
  StreamScopeActivity
} from '@/modules/activitystream/helpers/types'
import type { CommentRecord } from '@/modules/comments/helpers/types'
import type {
  BranchDeleteInput,
  BranchUpdateInput,
  CommitCreateInput,
  CommitUpdateInput,
  DeleteModelInput,
  MutationCommentArchiveArgs,
  ProjectUpdateInput,
  StreamUpdateInput,
  UpdateModelInput,
  UpdateVersionInput
} from '@/modules/core/graph/generated/graphql'
import type {
  BranchRecord,
  CommitRecord,
  StreamAclRecord,
  StreamRecord
} from '@/modules/core/helpers/types'
import type { Nullable } from '@speckle/shared'

export type GetUserStreamActivity = (
  streamId: string,
  start: Date,
  end: Date,
  filteredUser: string | null
) => Promise<StreamScopeActivity[]>

export type GetActiveUserStreams = (
  start: Date,
  end: Date
) => Promise<
  {
    userId: string
    streamIds: string[]
  }[]
>

export type GetStreamActivity = (args: {
  streamId: string
  actionType: StreamActionType
  after?: Date
  before?: Date
  cursor?: Date
  limit?: number
}) => Promise<{ items: StreamActivityRecord[]; cursor: string | null }>

export type GetActivityCountByStreamId = ({
  streamId,
  actionType,
  before,
  after
}: {
  streamId: string
  actionType?: StreamActionType
  after?: Date
  before?: Date
}) => Promise<number>

export type GetActivityCountByUserId = ({
  userId,
  actionType,
  before,
  after
}: {
  userId: string
  actionType?: StreamActionType
  after?: Date
  before?: Date
}) => Promise<number>

export type GetTimelineCount = ({
  userId,
  before,
  after
}: {
  userId: string
  after?: Date
  before?: Date
}) => Promise<number>

export type GetActivityCountByResourceId = ({
  resourceId,
  actionType,
  before,
  after
}: {
  resourceId: string
  actionType?: StreamActionType
  after?: Date
  before?: Date
}) => Promise<number>

export type GetUserTimeline = ({
  userId,
  before,
  after,
  cursor,
  limit
}: {
  userId: string
  after?: Date
  before?: Date
  cursor?: Date
  limit?: number
}) => Promise<{
  cursor: string | null
  items: (StreamActivityRecord & StreamAclRecord)[]
}>

export type GetResourceActivity = ({
  resourceType,
  resourceId,
  actionType,
  before,
  after,
  cursor,
  limit
}: {
  resourceType: ResourceType
  resourceId: string
  actionType: StreamActionType
  after?: Date
  before?: Date
  cursor?: Date
  limit?: number
}) => Promise<{
  cursor: string | null
  items: StreamActivityRecord[]
}>

export type GetUserActivity = ({
  userId,
  actionType,
  before,
  after,
  cursor,
  limit
}: {
  userId: string
  actionType?: StreamActionType
  after?: Date
  before?: Date
  cursor?: Date
  limit?: number
}) => Promise<{
  cursor: string | null
  items: StreamActivityRecord[]
}>

export type SaveStreamActivity = (
  args: Omit<StreamActivityRecord, 'time'>
) => Promise<void>

export type CreateActivitySummary = (args: {
  userId: string
  streamIds: string[]
  start: Date
  end: Date
}) => Promise<ActivitySummary | null>

export type AddStreamCommentMentionActivity = (params: {
  streamId: string
  mentionAuthorId: string
  mentionTargetId: string
  commentId: string
  threadId: string
}) => Promise<void>

export type AddStreamDeletedActivity = (params: {
  streamId: string
  deleterId: string
  workspaceId: Nullable<string>
}) => Promise<void>

export type AddStreamUpdatedActivity = (params: {
  streamId: string
  updaterId: string
  oldStream: StreamRecord
  newStream: StreamRecord
  update: ProjectUpdateInput | StreamUpdateInput
}) => Promise<void>

export type AddStreamAccessRequestedActivity = (params: {
  streamId: string
  requesterId: string
}) => Promise<void>

export type AddStreamAccessRequestDeclinedActivity = (params: {
  streamId: string
  requesterId: string
  declinerId: string
}) => Promise<void>

export type AddCommitCreatedActivity = (params: {
  commitId: string
  streamId: string
  userId: string
  input: CommitCreateInput
  branchName: string
  modelId: string
  commit: CommitRecord
}) => Promise<void>

export type AddCommitUpdatedActivity = (params: {
  commitId: string
  streamId: string
  userId: string
  originalCommit: CommitRecord
  update: CommitUpdateInput | UpdateVersionInput
  newCommit: CommitRecord
  branchId: string
}) => Promise<void>

export type AddCommitMovedActivity = (params: {
  commitId: string
  streamId: string
  userId: string
  originalBranchId: string
  newBranchId: string
  commit: CommitRecord
}) => Promise<void>

export type AddCommitDeletedActivity = (params: {
  commitId: string
  streamId: string
  userId: string
  commit: CommitRecord
  branchId: string
}) => Promise<void>

export type AddThreadCreatedActivity = (params: {
  input: CommentCreatedActivityInput
  comment: CommentRecord
}) => Promise<void>

export type AddCommentArchivedActivity = (params: {
  userId: string
  input: MutationCommentArchiveArgs
  comment: CommentRecord
}) => Promise<void>

export type AddReplyAddedActivity = (params: {
  input: ReplyCreatedActivityInput
  reply: CommentRecord
}) => Promise<void>

export type AddBranchCreatedActivity = (params: {
  branch: BranchRecord
}) => Promise<void>

export type AddBranchUpdatedActivity = (params: {
  update: BranchUpdateInput | UpdateModelInput
  userId: string
  oldBranch: BranchRecord
  newBranch: BranchRecord
}) => Promise<void>

export type AddBranchDeletedActivity = (params: {
  input: BranchDeleteInput | DeleteModelInput
  userId: string
  branchName: string
}) => Promise<void>

export type SaveActivity = <
  T extends keyof ResourceEventsToPayloadMap,
  R extends keyof ResourceEventsToPayloadMap[T]
>(
  args: Omit<Activity<T, R>, 'createdAt' | 'id'>
) => Promise<Activity<T, R>>

type GetActivitiesArgs = Partial<{
  workspaceId: string
  projectId: string
  eventType: string
  userId: string
}>

export type GetActivities = (filters: GetActivitiesArgs) => Promise<Activity[]>
