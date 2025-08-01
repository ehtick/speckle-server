import type { CommandModule } from 'yargs'
import { downloadCommitFactory } from '@/modules/cross-server-sync/services/commit'
import { cliLogger as logger } from '@/observability/logging'
import {
  getStreamCollaboratorsFactory,
  getStreamFactory,
  markCommitStreamUpdatedFactory
} from '@/modules/core/repositories/streams'
import {
  getBranchByIdFactory,
  getBranchLatestCommitsFactory,
  getStreamBranchByNameFactory,
  getStreamBranchesByNameFactory,
  markCommitBranchUpdatedFactory
} from '@/modules/core/repositories/branches'
import {
  getObjectFactory,
  getStreamObjectsFactory,
  storeSingleObjectIfNotFoundFactory
} from '@/modules/core/repositories/objects'
import {
  createCommentReplyAndNotifyFactory,
  createCommentThreadAndNotifyFactory
} from '@/modules/comments/services/management'
import {
  getViewerResourceGroupsFactory,
  getViewerResourceItemsUngroupedFactory,
  getViewerResourcesForCommentFactory,
  getViewerResourcesForCommentsFactory,
  getViewerResourcesFromLegacyIdentifiersFactory
} from '@/modules/core/services/commit/viewerResources'
import {
  createCommitFactory,
  getAllBranchCommitsFactory,
  getCommitsAndTheirBranchIdsFactory,
  getSpecificBranchCommitsFactory,
  insertBranchCommitsFactory,
  insertStreamCommitsFactory
} from '@/modules/core/repositories/commits'
import {
  getCommentFactory,
  getCommentsResourcesFactory,
  insertCommentLinksFactory,
  insertCommentsFactory,
  markCommentUpdatedFactory,
  markCommentViewedFactory
} from '@/modules/comments/repositories/comments'
import { validateInputAttachmentsFactory } from '@/modules/comments/services/commentTextService'
import { getBlobsFactory } from '@/modules/blobstorage/repositories'
import { createCommitByBranchIdFactory } from '@/modules/core/services/commit/management'
import { getUserFactory } from '@/modules/core/repositories/users'
import { createObjectFactory } from '@/modules/core/services/objects/management'
import { getProjectDbClient } from '@/modules/multiregion/utils/dbSelector'
import { db } from '@/db/knex'
import { getEventBus } from '@/modules/shared/services/eventBus'

const command: CommandModule<
  unknown,
  {
    commitUrl: string
    targetStreamId: string
    branchName: string
    token?: string
    commentAuthorId?: string
  }
> = {
  command: 'commit <commitUrl> <targetStreamId> [branchName] [commentAuthorId]',
  describe: 'Download a commit from an external Speckle server instance',
  builder: {
    commitUrl: {
      describe:
        'Commit URL (e.g. https://app.speckle.systems/streams/f0532359ac/commits/98678e2a3d or https://latest.speckle.systems/projects/92b620fb17/models/76fd8a01c8)',
      type: 'string'
    },
    targetStreamId: {
      describe: 'ID of the local stream that should receive the commit',
      type: 'string'
    },
    branchName: {
      describe: 'Stream branch that should receive the commit',
      type: 'string',
      default: 'main'
    },
    token: {
      describe: 'Target server auth token, in case the stream is private',
      type: 'string'
    },
    commentAuthorId: {
      describe:
        'The local user ID that should be used as the author of comments. If not specified, comments wont be pulled',
      type: 'string',
      default: ''
    }
  },
  handler: async (argv) => {
    const projectId = argv.targetStreamId
    // everything should happen in the project db right?
    const projectDb = await getProjectDbClient({ projectId })

    const markCommitStreamUpdated = markCommitStreamUpdatedFactory({ db: projectDb })
    const getStream = getStreamFactory({ db: projectDb })
    const getObject = getObjectFactory({ db: projectDb })
    const getStreamObjects = getStreamObjectsFactory({ db: projectDb })
    const markCommentViewed = markCommentViewedFactory({ db: projectDb })
    const validateInputAttachments = validateInputAttachmentsFactory({
      getBlobs: getBlobsFactory({ db: projectDb })
    })
    const getBranchLatestCommits = getBranchLatestCommitsFactory({ db: projectDb })
    const insertComments = insertCommentsFactory({ db: projectDb })
    const insertCommentLinks = insertCommentLinksFactory({ db: projectDb })
    const getViewerResourceItemsUngrouped = getViewerResourceItemsUngroupedFactory({
      getViewerResourceGroups: getViewerResourceGroupsFactory({
        getStreamObjects,
        getBranchLatestCommits,
        getStreamBranchesByName: getStreamBranchesByNameFactory({ db: projectDb }),
        getSpecificBranchCommits: getSpecificBranchCommitsFactory({ db: projectDb }),
        getAllBranchCommits: getAllBranchCommitsFactory({ db: projectDb })
      })
    })
    const getViewerResourcesFromLegacyIdentifiers =
      getViewerResourcesFromLegacyIdentifiersFactory({
        getViewerResourcesForComments: getViewerResourcesForCommentsFactory({
          getCommentsResources: getCommentsResourcesFactory({ db: projectDb }),
          getViewerResourcesFromLegacyIdentifiers: (...args) =>
            getViewerResourcesFromLegacyIdentifiers(...args) // recursive dep
        }),
        getCommitsAndTheirBranchIds: getCommitsAndTheirBranchIdsFactory({
          db: projectDb
        }),
        getStreamObjects
      })
    const createCommentThreadAndNotify = createCommentThreadAndNotifyFactory({
      getViewerResourceItemsUngrouped,
      validateInputAttachments,
      insertComments,
      insertCommentLinks,
      markCommentViewed,
      emitEvent: getEventBus().emit
    })

    const createCommentReplyAndNotify = createCommentReplyAndNotifyFactory({
      getComment: getCommentFactory({ db: projectDb }),
      validateInputAttachments,
      insertComments,
      insertCommentLinks,
      markCommentUpdated: markCommentUpdatedFactory({ db: projectDb }),
      emitEvent: getEventBus().emit,
      getViewerResourcesForComment: getViewerResourcesForCommentFactory({
        getCommentsResources: getCommentsResourcesFactory({ db: projectDb }),
        getViewerResourcesFromLegacyIdentifiers
      })
    })

    const createCommitByBranchId = createCommitByBranchIdFactory({
      createCommit: createCommitFactory({ db: projectDb }),
      getObject,
      getBranchById: getBranchByIdFactory({ db: projectDb }),
      insertStreamCommits: insertStreamCommitsFactory({ db: projectDb }),
      insertBranchCommits: insertBranchCommitsFactory({ db: projectDb }),
      markCommitStreamUpdated,
      markCommitBranchUpdated: markCommitBranchUpdatedFactory({ db: projectDb }),
      emitEvent: getEventBus().emit
    })

    const createObject = createObjectFactory({
      storeSingleObjectIfNotFoundFactory: storeSingleObjectIfNotFoundFactory({
        db: projectDb
      })
    })
    const getUser = getUserFactory({ db })
    const getStreamCollaborators = getStreamCollaboratorsFactory({ db })
    const downloadCommit = downloadCommitFactory({
      getStream,
      getStreamBranchByName: getStreamBranchByNameFactory({ db: projectDb }),
      getStreamCollaborators,
      getUser,
      createCommitByBranchId,
      createObject,
      getObject,
      createCommentThreadAndNotify,
      createCommentReplyAndNotify
    })

    await downloadCommit(argv, { logger })
  }
}

export = command
