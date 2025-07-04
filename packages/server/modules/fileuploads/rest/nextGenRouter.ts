import { Router } from 'express'
import { authMiddlewareCreator } from '@/modules/shared/middleware'
import { db } from '@/db/knex'
import { streamWritePermissionsPipelineFactory } from '@/modules/shared/authz'
import { getStreamFactory } from '@/modules/core/repositories/streams'
import { getProjectDbClient } from '@/modules/multiregion/utils/dbSelector'
import { fileImportResultPayload } from '@speckle/shared/workers/fileimport'
import { onFileImportResultFactory } from '@/modules/fileuploads/services/resultHandler'
import {
  getFileInfoFactoryV2,
  saveUploadFileFactoryV2,
  updateFileUploadFactory
} from '@/modules/fileuploads/repositories/fileUploads'
import { validateRequest } from 'zod-express'
import { z } from 'zod'
import { processNewFileStreamFactory } from '@/modules/blobstorage/services/streams'
import { UnauthorizedError } from '@/modules/shared/errors'
import { getBranchesByIdsFactory } from '@/modules/core/repositories/branches'
import { insertNewUploadAndNotifyFactoryV2 } from '@/modules/fileuploads/services/management'
import { UploadResult } from '@/modules/blobstorage/domain/types'
import { createBusboy } from '@/modules/blobstorage/rest/busboy'
import { UploadRequestErrorMessage } from '@/modules/fileuploads/helpers/rest'
import { ensureError } from '@speckle/shared'
import { createAppTokenFactory } from '@/modules/core/services/tokens'
import {
  storeApiTokenFactory,
  storeTokenResourceAccessDefinitionsFactory,
  storeTokenScopesFactory,
  storeUserServerAppTokenFactory
} from '@/modules/core/repositories/tokens'
import { pushJobToFileImporterFactory } from '@/modules/fileuploads/services/createFileImport'
import { getFeatureFlags, getServerOrigin } from '@/modules/shared/helpers/envHelper'
import { ModelNotFoundError } from '@/modules/core/errors/model'
import { getEventBus } from '@/modules/shared/services/eventBus'
import type { FileImportQueue } from '@/modules/fileuploads/domain/types'
import type { ObserveResult } from '@/modules/fileuploads/observability/metrics'

const { FF_LARGE_FILE_IMPORTS_ENABLED } = getFeatureFlags()

export const nextGenFileImporterRouterFactory = (params: {
  queues: FileImportQueue[]
  observeResult: ObserveResult | undefined
}): Router => {
  const processNewFileStream = processNewFileStreamFactory()
  const app = Router()

  if (!FF_LARGE_FILE_IMPORTS_ENABLED) {
    app.post(
      '/api/projects/:streamId/models/:modelId/fileimporter/jobs',
      authMiddlewareCreator(
        streamWritePermissionsPipelineFactory({
          getStream: getStreamFactory({ db })
        })
      ),
      validateRequest({
        params: z.object({
          // needs to be streamId, due to the auth context building
          streamId: z.string(),
          modelId: z.string()
        })
      }),
      async (req, res) => {
        const projectId = req.params.streamId
        const modelId = req.params.modelId
        const userId = req.context.userId

        if (!userId) throw new UnauthorizedError('User not authorized')

        const logger = req.log.child({
          projectId,
          modelId,
          userId
        })

        const projectDb = await getProjectDbClient({ projectId })
        const getModelsByIds = getBranchesByIdsFactory({ db: projectDb })
        const [model] = await getModelsByIds([modelId], { streamId: projectId })
        if (!model) throw new ModelNotFoundError(undefined, { statusCode: 401 })

        const pushJobToFileImporter = pushJobToFileImporterFactory({
          getServerOrigin,
          createAppToken: createAppTokenFactory({
            storeApiToken: storeApiTokenFactory({ db }),
            storeTokenScopes: storeTokenScopesFactory({ db }),
            storeTokenResourceAccessDefinitions:
              storeTokenResourceAccessDefinitionsFactory({
                db
              }),
            storeUserServerAppToken: storeUserServerAppTokenFactory({ db })
          })
        })

        const insertNewUploadAndNotify = insertNewUploadAndNotifyFactoryV2({
          queues: params.queues,
          pushJobToFileImporter,
          saveUploadFile: saveUploadFileFactoryV2({ db: projectDb }),
          emit: getEventBus().emit
        })

        const onError = () => {
          res.contentType('application/json')
          res.status(400).end(UploadRequestErrorMessage)
        }

        const onFinishAllFileUploads = async (uploadResults: UploadResult[]) => {
          if (!uploadResults.length) {
            logger.error('File import failed to upload')
            onError()
            return
          }

          try {
            await Promise.all(
              uploadResults.map((upload) =>
                insertNewUploadAndNotify({
                  projectId,
                  userId,
                  modelId,
                  modelName: model.name,
                  fileName: upload.fileName,
                  fileType: upload.fileName?.split('.').pop() || '', //FIXME
                  fileSize: upload.fileSize,
                  fileId: upload.blobId
                })
              )
            )
            res.status(201).send({ uploadResults })
          } catch (err) {
            logger.error(ensureError(err), 'File import post upload error')
            onError()
          }
        }

        const busboy = createBusboy(req)
        const newFileStreamProcessor = await processNewFileStream({
          busboy,
          streamId: projectId,
          userId,
          logger,
          onFinishAllFileUploads,
          onError
        })

        req.pipe(newFileStreamProcessor)
      }
    )
  }

  app.post(
    '/api/projects/:streamId/fileimporter/jobs/:jobId/results',
    authMiddlewareCreator(
      streamWritePermissionsPipelineFactory({
        getStream: getStreamFactory({ db })
      })
    ),
    validateRequest({
      params: z.object({
        streamId: z.string(),
        jobId: z.string()
      }),
      body: fileImportResultPayload
    }),
    async (req, res) => {
      const userId = req.context.userId
      const projectId = req.params.streamId
      const jobId = req.params.jobId
      const logger = req.log.child({
        projectId,
        streamId: projectId, //legacy
        userId,
        jobId
      })

      const jobResult = req.body

      const projectDb = await getProjectDbClient({ projectId })

      const onFileImportResult = onFileImportResultFactory({
        logger: logger.child({ fileUploadStatus: jobResult.status }),
        updateFileUpload: updateFileUploadFactory({ db: projectDb }),
        getFileInfo: getFileInfoFactoryV2({ db: projectDb }),
        observeResult: params.observeResult,
        eventEmit: getEventBus().emit
      })

      await onFileImportResult({
        jobId,
        jobResult
      })

      res.status(200).send({
        message: 'Job result processed successfully'
      })
      return
    }
  )
  return app
}
