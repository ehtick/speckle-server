import type { StreamAccessRequestRecord } from '@/modules/accessrequests/repositories'
import type { StreamAccessRequest } from '@/modules/core/graph/generated/graphql'

export type StreamAccessRequestGraphQLReturn = Omit<
  StreamAccessRequest,
  'requester' | 'stream'
>

export type ProjectAccessRequestGraphQLReturn = StreamAccessRequestRecord
