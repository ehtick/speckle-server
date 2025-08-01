import type {
  CreateFunctionBody,
  createFunction,
  getFunctionFactory,
  regenerateFunctionToken,
  updateFunction as updateExecEngineFunction
} from '@/modules/automate/clients/executionEngine'
import { ExecutionEngineFunctionTemplateId } from '@/modules/automate/clients/executionEngine'
import {
  AutomateFunctionCreationError,
  AutomateFunctionUpdateError
} from '@/modules/automate/errors/management'

import type {
  BasicGitRepositoryMetadata,
  UpdateAutomateFunctionInput,
  CreateAutomateFunctionInput
} from '@/modules/core/graph/generated/graphql'
import { AutomateFunctionTemplateLanguage } from '@/modules/core/graph/generated/graphql'
import type {
  MaybeNullOrUndefined,
  Nullable,
  Optional,
  SourceAppName
} from '@speckle/shared'
import { removeNullOrUndefinedKeys } from '@speckle/shared'
import type {
  AutomateFunctionGraphQLReturn,
  AutomateFunctionReleaseGraphQLReturn
} from '@/modules/automate/helpers/graphTypes'
import type {
  FunctionReleaseSchemaType,
  FunctionSchemaType
} from '@/modules/automate/helpers/executionEngine'
import type { Request, Response } from 'express'
import { UnauthorizedError } from '@/modules/shared/errors'
import type { AuthCodePayload } from '@/modules/automate/services/authCode'
import { AuthCodePayloadAction } from '@/modules/automate/services/authCode'
import {
  getServerOrigin,
  isDevEnv,
  speckleAutomateUrl
} from '@/modules/shared/helpers/envHelper'
import { getFunctionsMarketplaceUrl } from '@/modules/core/helpers/routeHelper'
import type { Logger } from '@/observability/logging'
import type { CreateStoredAuthCode } from '@/modules/automate/domain/operations'
import type { GetUser } from '@/modules/core/domain/users/operations'
import { noop } from 'lodash-es'
import { UnknownFunctionTemplateError } from '@/modules/automate/errors/functions'
import { UserInputError } from '@/modules/core/errors/userinput'

const mapGqlTemplateIdToExecEngineTemplateId = (
  id: AutomateFunctionTemplateLanguage
): ExecutionEngineFunctionTemplateId => {
  switch (id) {
    case AutomateFunctionTemplateLanguage.Python:
      return ExecutionEngineFunctionTemplateId.Python
    case AutomateFunctionTemplateLanguage.DotNet:
      return ExecutionEngineFunctionTemplateId.DotNet
    case AutomateFunctionTemplateLanguage.Typescript:
      return ExecutionEngineFunctionTemplateId.TypeScript
    default:
      throw new UnknownFunctionTemplateError('Unknown template id')
  }
}

const repoUrlToBasicGitRepositoryMetadata = (
  url: string
): BasicGitRepositoryMetadata => {
  const repoUrl = new URL(url)
  const pathParts = repoUrl.pathname.split('/').filter(Boolean)
  if (pathParts.length < 2) {
    throw new UserInputError('Invalid GitHub repository URL')
  }

  const [owner, name] = pathParts
  return { owner, name, id: repoUrl.toString(), url: repoUrl.toString() }
}

const cleanFunctionLogo = (logo: MaybeNullOrUndefined<string>): Nullable<string> => {
  if (!logo?.length) return null
  if (logo.startsWith('data:')) return logo
  if (logo.startsWith('http:')) return logo
  if (logo.startsWith('https:')) return logo
  return null
}

export const convertFunctionToGraphQLReturn = (
  fn: FunctionSchemaType
): AutomateFunctionGraphQLReturn => {
  const functionCreator: FunctionSchemaType['functionCreator'] =
    fn.functionCreatorSpeckleUserId && fn.functionCreatorSpeckleServerOrigin
      ? {
          speckleUserId: fn.functionCreatorSpeckleUserId,
          speckleServerOrigin: fn.functionCreatorSpeckleServerOrigin
        }
      : fn.functionCreator

  const ret: AutomateFunctionGraphQLReturn = {
    id: fn.functionId,
    name: fn.functionName,
    repo: repoUrlToBasicGitRepositoryMetadata(fn.repoUrl),
    isFeatured: fn.isFeatured,
    description: fn.description,
    logo: cleanFunctionLogo(fn.logo),
    tags: fn.tags,
    supportedSourceApps: fn.supportedSourceApps,
    functionCreator,
    workspaceIds: fn.workspaceIds ?? []
  }

  return ret
}

export const convertFunctionReleaseToGraphQLReturn = (
  fnRelease: FunctionReleaseSchemaType & { functionId: string }
): AutomateFunctionReleaseGraphQLReturn => {
  const ret: AutomateFunctionReleaseGraphQLReturn = {
    id: fnRelease.functionVersionId,
    versionTag: fnRelease.versionTag,
    createdAt: new Date(fnRelease.createdAt),
    inputSchema: fnRelease.inputSchema,
    commitId: fnRelease.commitId,
    functionId: fnRelease.functionId
  }

  return ret
}

export type CreateFunctionDeps = {
  createStoredAuthCode: CreateStoredAuthCode
  createExecutionEngineFn: typeof createFunction
  getUser: GetUser
  logger: Logger
}

export const createFunctionFromTemplateFactory =
  (deps: CreateFunctionDeps) =>
  async (params: { input: CreateAutomateFunctionInput; userId: string }) => {
    const { input, userId } = params
    const { createExecutionEngineFn, getUser, createStoredAuthCode, logger } = deps

    // Validate user
    const user = await getUser(userId)
    if (!user) {
      throw new AutomateFunctionCreationError('Speckle user not found')
    }

    const authCode = await createStoredAuthCode({
      userId: user.id,
      action: AuthCodePayloadAction.CreateFunction
    })
    const body: CreateFunctionBody<AuthCodePayload> = {
      ...input,
      speckleServerAuthenticationPayload: authCode,
      functionName: input.name,
      template: mapGqlTemplateIdToExecEngineTemplateId(input.template),
      supportedSourceApps: input.supportedSourceApps as SourceAppName[],
      logo: cleanFunctionLogo(input.logo),
      org: input.org || null
    }

    const created = await createExecutionEngineFn({ body })

    if (isDevEnv() && created) {
      logger.info({ created }, `[dev] Created function #${created.functionId}`)
    }

    // Don't want to pull the function w/ another req, so we'll just return the input
    const gqlReturn: AutomateFunctionGraphQLReturn = {
      id: created.functionId,
      name: body.functionName,
      repo: {
        id: created.repo.htmlUrl,
        url: created.repo.htmlUrl,
        name: created.repo.name,
        owner: created.repo.owner
      },
      isFeatured: false,
      description: body.description,
      logo: body.logo,
      tags: body.tags,
      supportedSourceApps: body.supportedSourceApps,
      functionCreator: {
        speckleServerOrigin: getServerOrigin(),
        speckleUserId: user.id
      },
      workspaceIds: []
    }

    return {
      createResponse: created,
      graphqlReturn: gqlReturn
    }
  }

export type UpdateFunctionDeps = {
  updateFunction: typeof updateExecEngineFunction
  getFunction: ReturnType<typeof getFunctionFactory>
  createStoredAuthCode: CreateStoredAuthCode
}

export const updateFunctionFactory =
  (deps: UpdateFunctionDeps) =>
  async (params: { input: UpdateAutomateFunctionInput; userId: string }) => {
    const { getFunction, updateFunction, createStoredAuthCode } = deps
    const { input, userId } = params

    const existingFn = await getFunction({ functionId: input.id })
    if (!existingFn) {
      throw new AutomateFunctionUpdateError('Function not found')
    }

    // Fix up logo, if any
    if (input.logo) {
      input.logo = cleanFunctionLogo(input.logo)
    }

    // Filter out empty (null) values from input
    const updates = removeNullOrUndefinedKeys(input)

    // Skip if there's nothing left
    if (Object.keys(updates).length === 0) {
      return existingFn
    }

    const authCode = await createStoredAuthCode({
      userId,
      action: AuthCodePayloadAction.UpdateFunction
    })

    const apiResult = await updateFunction({
      functionId: updates.id,
      body: {
        ...updates,
        functionName: updates.name,
        supportedSourceApps: updates.supportedSourceApps as Optional<SourceAppName[]>,
        speckleServerAuthenticationPayload: authCode
      }
    })

    return convertFunctionToGraphQLReturn(apiResult)
  }

export type StartAutomateFunctionCreatorAuthDeps = {
  createStoredAuthCode: CreateStoredAuthCode
}

export const startAutomateFunctionCreatorAuthFactory =
  (deps: StartAutomateFunctionCreatorAuthDeps) =>
  async (params: { req: Request; res: Response }) => {
    const { createStoredAuthCode } = deps
    const { req, res } = params

    const userId = req.context.userId
    if (!userId) {
      throw new UnauthorizedError()
    }

    const authCode = await createStoredAuthCode({
      userId,
      action: AuthCodePayloadAction.BecomeFunctionAuthor
    })
    const redirectUrl = new URL(
      '/api/v2/functions/auth/githubapp/authorize',
      speckleAutomateUrl()
    )
    redirectUrl.searchParams.set(
      'speckleServerAuthenticationPayload',
      JSON.stringify({ ...authCode, origin: getServerOrigin() })
    )

    return res.redirect(redirectUrl.toString())
  }

export const handleAutomateFunctionCreatorAuthCallbackFactory =
  () => async (params: { req: Request; res: Response }) => {
    const { req, res } = params
    const {
      ghAuth = 'unknown',
      ghAuthDesc = 'GitHub Authentication unexpectedly failed'
    } = req.query as Record<string, string>

    const isSuccess = ghAuth === 'success'
    const redirectUrl = getFunctionsMarketplaceUrl(req.session.workspaceSlug)
    redirectUrl.searchParams.set('ghAuth', isSuccess ? 'success' : ghAuth)
    redirectUrl.searchParams.set('ghAuthDesc', isSuccess ? '' : ghAuthDesc)

    req.session?.destroy?.(noop)

    return res.redirect(redirectUrl.toString())
  }

export const regenerateFunctionTokenFactory =
  (deps: {
    regenerateFunctionToken: typeof regenerateFunctionToken
    getFunction: ReturnType<typeof getFunctionFactory>
    createStoredAuthCode: CreateStoredAuthCode
  }) =>
  async (params: { functionId: string; userId: string }) => {
    const { functionId, userId } = params

    const existingFunction = await deps.getFunction({ functionId })
    if (!existingFunction) {
      throw new AutomateFunctionUpdateError('Function not found')
    }

    const authCode = await deps.createStoredAuthCode({
      userId,
      action: AuthCodePayloadAction.GenerateFunctionToken
    })

    const res = await deps.regenerateFunctionToken({
      functionId,
      authCode
    })

    return res.token
  }
