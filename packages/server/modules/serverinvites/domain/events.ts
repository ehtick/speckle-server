import { ServerInviteRecord } from '@/modules/serverinvites/domain/types'

export const serverinvitesEventNamespace = 'serverinvites' as const

const prefix = `${serverinvitesEventNamespace}.` as const

export const ServerInvitesEvents = {
  Created: `${prefix}created`,
  Finalized: `${prefix}finalized`,
  Canceled: `${prefix}canceled`
} as const

export type ServerInvitesEventsPayloads = {
  [ServerInvitesEvents.Created]: {
    invite: ServerInviteRecord
  }
  [ServerInvitesEvents.Finalized]: {
    invite: ServerInviteRecord
    finalizerUserId: string
    accept: boolean
  }
  [ServerInvitesEvents.Canceled]: {
    invite: ServerInviteRecord
    cancelerUserId: string
  }
}
