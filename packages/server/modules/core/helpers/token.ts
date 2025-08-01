import type {
  TokenResourceIdentifier,
  TokenResourceIdentifierType
} from '@/modules/core/domain/tokens/types'
import { TokenCreateError } from '@/modules/core/errors/user'
import type { TokenResourceAccessRecord } from '@/modules/core/helpers/types'
import type { UserRole } from '@/modules/shared/domain/rolesAndScopes/types'
import { ForbiddenError } from '@/modules/shared/errors'
import type {
  MaybeNullOrUndefined,
  Nullable,
  Optional,
  ServerScope
} from '@speckle/shared'
import { AllScopes, Scopes } from '@speckle/shared'
import { differenceBy } from 'lodash-es'

export enum RoleResourceTargets {
  Streams = 'streams',
  Server = 'server',
  Workspaces = 'workspaces',
  Projects = 'projects'
}

export type ContextResourceAccessRules = MaybeNullOrUndefined<TokenResourceIdentifier[]>

export const resourceAccessRuleToIdentifier = (
  rule: TokenResourceAccessRecord
): TokenResourceIdentifier => {
  return {
    id: rule.resourceId,
    type: rule.resourceType
  }
}

export const roleResourceTypeToTokenResourceType = (
  type: RoleResourceTargets | UserRole['resourceTarget']
): Nullable<TokenResourceIdentifierType> => {
  switch (type) {
    case RoleResourceTargets.Streams:
    case RoleResourceTargets.Projects:
      return 'project'
    case RoleResourceTargets.Workspaces:
      return 'workspace'
    default:
      return null
  }
}

export const isResourceAllowed = (params: {
  resourceId: string
  resourceType: TokenResourceIdentifierType
  resourceAccessRules?: MaybeNullOrUndefined<TokenResourceIdentifier[]>
}) => {
  const { resourceId, resourceType, resourceAccessRules } = params
  const relevantRules = resourceAccessRules?.filter((r) => r.type === resourceType)
  return !relevantRules?.length || relevantRules.some((r) => r.id === resourceId)
}

export const throwIfResourceAccessNotAllowed = (params: {
  resourceId: string
  resourceType: TokenResourceIdentifierType
  resourceAccessRules: MaybeNullOrUndefined<TokenResourceIdentifier[]>
}) => {
  if (!isResourceAllowed(params)) {
    throw new ForbiddenError('You are not authorized to access this resource.')
  }
}

export const throwIfNewResourceNotAllowed = (params: {
  resourceType: TokenResourceIdentifierType
  resourceAccessRules: MaybeNullOrUndefined<TokenResourceIdentifier[]>
}) => {
  if (!isNewResourceAllowed(params)) {
    throw new ForbiddenError(
      `You are not authorized to create a new ${params.resourceType} resource.`
    )
  }
}

export const isNewResourceAllowed = (params: {
  resourceType: TokenResourceIdentifierType
  resourceAccessRules?: MaybeNullOrUndefined<TokenResourceIdentifier[]>
}) => {
  const { resourceType, resourceAccessRules } = params
  const relevantRules = resourceAccessRules?.filter((r) => r.type === resourceType)
  return !relevantRules?.length
}

export const toProjectIdWhitelist = (
  resourceAccessRules: ContextResourceAccessRules
): Optional<string[]> => {
  const projectRules = resourceAccessRules?.filter((r) => r.type === 'project')
  return projectRules?.map((r) => r.id)
}

const canCreateToken = (params: {
  scopes: {
    user: string[]
    token: string[]
  }
  limitedResources?: {
    user: MaybeNullOrUndefined<TokenResourceIdentifier[]>
    token: MaybeNullOrUndefined<TokenResourceIdentifier[]>
  }
}) => {
  const { scopes, limitedResources } = params
  const hasAllScopes = scopes.token.every((scope) => scopes.user.includes(scope))
  if (!hasAllScopes) {
    throw new TokenCreateError(
      "You can't create a token with scopes that you don't have"
    )
  }

  const userLimitedResources = limitedResources?.user
  const tokenLimitedResources = limitedResources?.token

  let throwAboutInvalidResources = false
  if (userLimitedResources?.length || tokenLimitedResources?.length) {
    if (userLimitedResources?.length && !tokenLimitedResources?.length) {
      throwAboutInvalidResources = true
    } else if (userLimitedResources?.length) {
      const disallowedResources = differenceBy(
        tokenLimitedResources || [],
        userLimitedResources || [],
        (r) => `${r.type}:${r.id}`
      )

      if (disallowedResources.length) {
        throwAboutInvalidResources = true
      }
    }
  }

  if (throwAboutInvalidResources) {
    throw new TokenCreateError(
      `You can't create a token with access to resources that you don't currently have access to`
    )
  }

  return true
}

export const canCreatePAT = (params: {
  scopes: {
    user: string[]
    token: string[]
  }
}) => {
  const { scopes } = params
  if (scopes.token.includes(Scopes.Tokens.Write)) {
    throw new TokenCreateError(
      "You can't create a personal access token with the tokens:write scope"
    )
  }

  return canCreateToken(params)
}

export const canCreateAppToken = (params: {
  scopes: {
    user: string[]
    token: string[]
  }
  appId: {
    user: string
    token: string
  }
  limitedResources: {
    user: MaybeNullOrUndefined<TokenResourceIdentifier[]>
    token: MaybeNullOrUndefined<TokenResourceIdentifier[]>
  }
}) => {
  const { appId } = params
  if (appId.user !== appId.token || !appId.token?.length || !appId.user?.length) {
    throw new TokenCreateError(
      'An app token can only create a new token for the same app'
    )
  }

  return canCreateToken(params)
}

export const isValidScope = (scope: string): scope is ServerScope =>
  (AllScopes as string[]).includes(scope)
