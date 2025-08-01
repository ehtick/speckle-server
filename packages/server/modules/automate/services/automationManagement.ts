import type {
  InsertableAutomationRevision,
  InsertableAutomationRevisionFunction,
  InsertableAutomationRevisionTrigger
} from '@/modules/automate/repositories/automations'
import { getServerOrigin } from '@/modules/shared/helpers/envHelper'
import cryptoRandomString from 'crypto-random-string'
import type {
  createAutomation as clientCreateAutomation,
  getFunctionReleaseFactory,
  getFunctionReleasesFactory
} from '@/modules/automate/clients/executionEngine'
import {
  Automate,
  Roles,
  ensureError,
  removeNullOrUndefinedKeys
} from '@speckle/shared'
import { AuthCodePayloadAction } from '@/modules/automate/services/authCode'
import type {
  ProjectAutomationCreateInput,
  ProjectAutomationRevisionCreateInput,
  ProjectAutomationUpdateInput
} from '@/modules/core/graph/generated/graphql'
import type { ContextResourceAccessRules } from '@/modules/core/helpers/token'
import {
  AutomationFunctionInputEncryptionError,
  AutomationRevisionCreationError,
  AutomationUpdateError,
  JsonSchemaInputValidationError
} from '@/modules/automate/errors/management'
import type { AutomationRunStatus } from '@/modules/automate/helpers/types'
import {
  AutomationRunStatuses,
  VersionCreationTriggerType
} from '@/modules/automate/helpers/types'
import { keyBy, uniq } from 'lodash-es'
import { resolveStatusFromFunctionRunStatuses } from '@/modules/automate/services/runsManagement'
import type { TriggeredAutomationsStatusGraphQLReturn } from '@/modules/automate/helpers/graphTypes'
import type { FunctionInputDecryptor } from '@/modules/automate/services/encryption'
import { LibsodiumEncryptionError } from '@/modules/shared/errors/encryption'
import { validateInputAgainstFunctionSchema } from '@/modules/automate/utils/inputSchemaValidator'
import { validateAutomationName } from '@/modules/automate/utils/automationConfigurationValidator'
import type {
  CreateAutomation,
  CreateStoredAuthCode,
  MarkAutomationDeleted,
  GetAutomation,
  GetEncryptionKeyPair,
  GetLatestVersionAutomationRuns,
  StoreAutomation,
  StoreAutomationRevision,
  StoreAutomationToken,
  UpdateAutomation
} from '@/modules/automate/domain/operations'
import type { GetBranchesByIds } from '@/modules/core/domain/branches/operations'
import type { ValidateStreamAccess } from '@/modules/core/domain/streams/operations'
import type { EventBusEmit } from '@/modules/shared/services/eventBus'
import { AutomationEvents } from '@/modules/automate/domain/events'
import { UnformattableTriggerDefinitionSchemaError } from '@speckle/shared/automate'

export type CreateAutomationDeps = {
  createAuthCode: CreateStoredAuthCode
  automateCreateAutomation: typeof clientCreateAutomation
  storeAutomation: StoreAutomation
  storeAutomationToken: StoreAutomationToken
  eventEmit: EventBusEmit
}

export const createAutomationFactory =
  (deps: CreateAutomationDeps): CreateAutomation =>
  async (params: {
    input: ProjectAutomationCreateInput
    projectId: string
    userId: string
    userResourceAccessRules?: ContextResourceAccessRules
  }) => {
    const {
      input: { name, enabled },
      projectId,
      userId
    } = params
    const {
      createAuthCode,
      automateCreateAutomation,
      storeAutomation,
      storeAutomationToken,
      eventEmit
    } = deps

    validateAutomationName(name)

    const authCode = await createAuthCode({
      userId,
      action: AuthCodePayloadAction.CreateAutomation
    })

    // trigger automation creation on automate
    const { automationId: executionEngineAutomationId, token } =
      await automateCreateAutomation({
        speckleServerUrl: getServerOrigin(),
        authCode
      })

    const automationId = cryptoRandomString({ length: 10 })

    const automationRecord = await storeAutomation({
      id: automationId,
      name,
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      enabled,
      projectId,
      executionEngineAutomationId,
      isTestAutomation: false,
      isDeleted: false
    })

    const automationTokenRecord = await storeAutomationToken({
      automationId,
      automateToken: token
    })

    await eventEmit({
      eventName: AutomationEvents.Created,
      payload: {
        automation: automationRecord
      }
    })

    return { automation: automationRecord, token: automationTokenRecord }
  }

export type CreateTestAutomationDeps = {
  getEncryptionKeyPair: GetEncryptionKeyPair
  storeAutomation: StoreAutomation
  storeAutomationRevision: StoreAutomationRevision
  validateStreamAccess: ValidateStreamAccess
  eventEmit: EventBusEmit
}

/**
 * Create a test automation and its first revision in one request.
 * TODO: Reduce code duplication w/ createAutomation
 */
export const createTestAutomationFactory =
  (deps: CreateTestAutomationDeps) =>
  async (params: {
    automationName: string
    projectId: string
    modelId: string
    userId: string
  }) => {
    const { automationName, projectId, modelId, userId } = params
    const {
      getEncryptionKeyPair,
      storeAutomation,
      storeAutomationRevision,
      eventEmit
    } = deps

    validateAutomationName(automationName)

    // Create and store the automation record
    const automationId = cryptoRandomString({ length: 10 })

    const automationRecord = await storeAutomation({
      id: automationId,
      name: automationName,
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      enabled: true,
      projectId,
      executionEngineAutomationId: null,
      isTestAutomation: true,
      isDeleted: false
    })

    await eventEmit({
      eventName: AutomationEvents.Created,
      payload: {
        automation: automationRecord
      }
    })

    // Create and store the automation revision
    const encryptionKeyPair = await getEncryptionKeyPair()

    const automationRevisionRecord = await storeAutomationRevision({
      functions: [],
      triggers: [
        {
          triggerType: VersionCreationTriggerType,
          triggeringId: modelId
        }
      ],
      automationId,
      userId,
      active: true,
      publicKey: encryptionKeyPair.publicKey
    })

    await eventEmit({
      eventName: AutomationEvents.CreatedRevision,
      payload: {
        automation: automationRecord,
        revision: automationRevisionRecord
      }
    })

    return automationRecord
  }

export const deleteAutomationFactory =
  (deps: { deleteAutomation: MarkAutomationDeleted }) =>
  async (params: { automationId: string }) => {
    const { automationId } = params
    return await deps.deleteAutomation({ automationId })
  }

export type ValidateAndUpdateAutomationDeps = {
  getAutomation: GetAutomation
  updateAutomation: UpdateAutomation
  eventEmit: EventBusEmit
}

export const validateAndUpdateAutomationFactory =
  (deps: ValidateAndUpdateAutomationDeps) =>
  async (params: {
    input: ProjectAutomationUpdateInput
    userId: string
    userResourceAccessRules?: ContextResourceAccessRules
    /**
     * If set, will validate that the automation belongs to that user
     */
    projectId?: string
  }) => {
    const { getAutomation, updateAutomation, eventEmit } = deps
    const { input, projectId } = params

    const existingAutomation = await getAutomation({
      automationId: input.id,
      projectId
    })
    if (!existingAutomation) {
      throw new AutomationUpdateError('Automation not found')
    }

    // Filter out empty (null) values from input
    const updates = removeNullOrUndefinedKeys(input)

    // Skip if there's nothing left
    if (Object.keys(updates).length === 0) {
      return existingAutomation
    }

    const res = await updateAutomation({
      ...updates,
      id: input.id
    })

    await eventEmit({
      eventName: AutomationEvents.Updated,
      payload: {
        automation: res
      }
    })

    return res
  }

type ValidateNewTriggerDefinitionsDeps = {
  getBranchesByIds: GetBranchesByIds
}

const validateNewTriggerDefinitions =
  (deps: ValidateNewTriggerDefinitionsDeps) =>
  async (params: {
    triggerDefinitions: InsertableAutomationRevisionTrigger[]
    projectId: string
  }) => {
    const { triggerDefinitions, projectId } = params
    const { getBranchesByIds } = deps

    if (!triggerDefinitions.length) {
      throw new AutomationRevisionCreationError(
        'At least one trigger definition is required'
      )
    }

    const invalidTriggers = triggerDefinitions.filter(
      (t) => t.triggerType !== VersionCreationTriggerType
    )
    if (invalidTriggers.length) {
      throw new AutomationRevisionCreationError(
        'Only version creation triggers are currently supported'
      )
    }

    // Validate version creation triggers
    const versionCreationTriggerDefinitions = triggerDefinitions
    const modelIds = uniq(versionCreationTriggerDefinitions.map((t) => t.triggeringId))
    const models = keyBy(
      await getBranchesByIds(modelIds, { streamId: projectId }),
      'id'
    )

    for (const modelId of modelIds) {
      const model = models[modelId]
      if (!model) {
        throw new AutomationRevisionCreationError(
          `Model with ID ${modelId} not found in project`
        )
      }
    }
  }

type ValidateNewRevisionFunctionsDeps = {
  getFunctionRelease: ReturnType<typeof getFunctionReleaseFactory>
}

const validateNewRevisionFunctions =
  (deps: ValidateNewRevisionFunctionsDeps) =>
  async (params: { functions: InsertableAutomationRevisionFunction[] }) => {
    const { functions } = params
    const { getFunctionRelease } = deps

    const updateId = (params: { functionId: string; functionReleaseId: string }) =>
      `${params.functionId}-${params.functionReleaseId}`

    // Validate functions exist
    const uniqueUpdates = keyBy(functions, updateId)
    const releases = keyBy(
      await Promise.all(
        Object.values(uniqueUpdates).map(async (fn) => ({
          // TODO: Replace w/ batch call, when/if possible
          ...(await getFunctionRelease(fn)),
          functionId: fn.functionId
        }))
      ),
      (r) =>
        updateId({
          functionReleaseId: r?.functionVersionId ?? '',
          functionId: r.functionId
        })
    )

    for (const [key, uniqueUpdate] of Object.entries(uniqueUpdates)) {
      if (!releases[key]) {
        throw new AutomationRevisionCreationError(
          `Function release for function ID ${uniqueUpdate.functionId} and function release id ${uniqueUpdate.functionReleaseId} not found`
        )
      }
    }
  }

export type CreateAutomationRevisionDeps = {
  getAutomation: GetAutomation
  storeAutomationRevision: StoreAutomationRevision
  getEncryptionKeyPair: GetEncryptionKeyPair
  getFunctionInputDecryptor: FunctionInputDecryptor
  getFunctionReleases: ReturnType<typeof getFunctionReleasesFactory>
  validateStreamAccess: ValidateStreamAccess
  eventEmit: EventBusEmit
} & ValidateNewTriggerDefinitionsDeps &
  ValidateNewRevisionFunctionsDeps

export const createAutomationRevisionFactory =
  (deps: CreateAutomationRevisionDeps) =>
  async (params: {
    input: ProjectAutomationRevisionCreateInput
    userId: string
    userResourceAccessRules?: ContextResourceAccessRules
    projectId?: string
  }) => {
    const { input, userId, userResourceAccessRules, projectId } = params
    const {
      storeAutomationRevision,
      getAutomation,
      getEncryptionKeyPair,
      getFunctionInputDecryptor,
      getFunctionReleases,
      validateStreamAccess,
      eventEmit
    } = deps

    const existingAutomation = await getAutomation({
      automationId: input.automationId,
      projectId
    })
    if (!existingAutomation) {
      throw new AutomationUpdateError('Automation not found')
    }

    await validateStreamAccess(
      userId,
      existingAutomation.projectId,
      Roles.Stream.Owner,
      userResourceAccessRules
    )

    let triggers: Automate.AutomateTypes.TriggerDefinitionsSchema
    try {
      triggers = Automate.AutomateTypes.formatTriggerDefinitionSchema(
        input.triggerDefinitions
      )
    } catch (e) {
      if (e instanceof UnformattableTriggerDefinitionSchemaError) {
        throw new AutomationRevisionCreationError(
          'One or more trigger definitions are not valid',
          { cause: ensureError(e, 'Unknown error when formatting trigger definition') }
        )
      }
      throw e
    }
    const triggerDefinitions = triggers.definitions.map((d) => {
      if (Automate.AutomateTypes.isVersionCreatedTriggerDefinition(d)) {
        const triggerDef: InsertableAutomationRevisionTrigger = {
          triggerType: VersionCreationTriggerType,
          triggeringId: d.modelId
        }

        return triggerDef
      }

      throw new AutomationRevisionCreationError('Unexpected trigger type')
    })
    await validateNewTriggerDefinitions(deps)({
      triggerDefinitions,
      projectId: projectId || existingAutomation.projectId
    })

    const encryptionKeys = await getEncryptionKeyPair()
    const decryptor = await getFunctionInputDecryptor({ keyPair: encryptionKeys })
    let functions: InsertableAutomationRevisionFunction[] = []
    try {
      const releases = await getFunctionReleases({
        ids: input.functions.map((f) => ({
          functionReleaseId: f.functionReleaseId,
          functionId: f.functionId
        }))
      })

      functions = await Promise.all(
        input.functions.map(async (f) => {
          const release = releases.find(
            (r) =>
              r.functionVersionId === f.functionReleaseId &&
              r.functionId === f.functionId
          )
          if (!release) {
            throw new AutomationRevisionCreationError(
              `Function release for function ID ${f.functionId} and function release ID ${f.functionReleaseId} not found`
            )
          }
          const schema = release.inputSchema

          // Validate parameters
          const decryptedParams = await decryptor.decryptInputs(f.parameters || null)
          if (decryptedParams && !schema) {
            throw new AutomationRevisionCreationError(
              'Function inputs provided for a function that does not have an input schema'
            )
          }

          validateInputAgainstFunctionSchema(schema, decryptedParams)

          // Didn't throw, let's continue
          const fn: InsertableAutomationRevisionFunction = {
            functionReleaseId: f.functionReleaseId,
            functionId: f.functionId,
            functionInputs: f.parameters || null
          }

          return fn
        })
      )
    } catch (e) {
      if (e instanceof AutomationFunctionInputEncryptionError) {
        throw new AutomationRevisionCreationError(
          'One or more function inputs are not proper input objects',
          { cause: e }
        )
      }

      if (e instanceof LibsodiumEncryptionError) {
        throw new AutomationRevisionCreationError(
          'Failed to decrypt one or more function inputs. Please ensure they have been properly encrypted',
          { cause: e }
        )
      }

      if (e instanceof JsonSchemaInputValidationError) {
        throw new AutomationRevisionCreationError(
          "One or more function inputs do not match their function's schema",
          { cause: e }
        )
      }

      throw e
    } finally {
      decryptor.dispose()
    }

    await validateNewRevisionFunctions(deps)({ functions })

    const revisionInput: InsertableAutomationRevision = {
      functions,
      triggers: triggerDefinitions,
      automationId: input.automationId,
      userId,
      active: true,
      publicKey: encryptionKeys.publicKey
    }
    const res = await storeAutomationRevision(revisionInput)

    await eventEmit({
      eventName: AutomationEvents.CreatedRevision,
      payload: {
        automation: existingAutomation,
        revision: res
      }
    })

    return res
  }

export type GetAutomationsStatusDeps = {
  getLatestVersionAutomationRuns: GetLatestVersionAutomationRuns
}

export const getAutomationsStatusFactory =
  (deps: GetAutomationsStatusDeps) =>
  async (params: {
    projectId: string
    modelId: string
    versionId: string
  }): Promise<TriggeredAutomationsStatusGraphQLReturn | null> => {
    const { projectId, modelId, versionId } = params
    const { getLatestVersionAutomationRuns } = deps

    const runs = await getLatestVersionAutomationRuns({
      projectId,
      modelId,
      versionId
    })
    if (!runs.length) return null

    // automation run has its own status field that should be up to date, but
    // lets calculate it again to be sure
    const runsWithUpdatedStatus = runs.map((r) => ({
      ...r,
      status: resolveStatusFromFunctionRunStatuses(
        r.functionRuns.map((fr) => fr.status)
      ),
      projectId: params.projectId
    }))

    const failedAutomations = runsWithUpdatedStatus.filter(
      (a) =>
        a.status === AutomationRunStatuses.failed ||
        a.status === AutomationRunStatuses.exception
    )

    const runningAutomations = runsWithUpdatedStatus.filter(
      (a) => a.status === AutomationRunStatuses.running
    )
    const initializingAutomations = runsWithUpdatedStatus.filter(
      (a) => a.status === AutomationRunStatuses.pending
    )

    let status: AutomationRunStatus = AutomationRunStatuses.succeeded
    let statusMessage = 'All automations have succeeded'

    if (failedAutomations.length) {
      status = AutomationRunStatuses.failed
      statusMessage = 'Some automations have failed:'
      for (const fa of failedAutomations) {
        for (const functionRunStatus of fa.functionRuns) {
          if (
            functionRunStatus.status === AutomationRunStatuses.failed ||
            functionRunStatus.status === AutomationRunStatuses.exception
          )
            statusMessage += `\n${functionRunStatus.statusMessage}`
        }
      }
    } else if (runningAutomations.length) {
      status = AutomationRunStatuses.running
      statusMessage = 'Some automations are running'
    } else if (initializingAutomations.length) {
      status = AutomationRunStatuses.pending
      statusMessage = 'Some automations are initializing'
    }

    return {
      id: versionId,
      status,
      statusMessage,
      automationRuns: runsWithUpdatedStatus
    }
  }
