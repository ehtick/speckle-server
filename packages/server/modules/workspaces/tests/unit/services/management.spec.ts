import {
  Workspace,
  WorkspaceAcl,
  WorkspaceDomain,
  WorkspaceWithDomains
} from '@/modules/workspacesCore/domain/types'
import {
  addDomainToWorkspaceFactory,
  createWorkspaceFactory,
  deleteWorkspaceRoleFactory,
  updateWorkspaceFactory,
  updateWorkspaceRoleFactory
} from '@/modules/workspaces/services/management'
import { Roles } from '@speckle/shared'
import { expect } from 'chai'
import cryptoRandomString from 'crypto-random-string'
import { WorkspaceEvents } from '@/modules/workspacesCore/domain/events'
import { StreamAclRecord, StreamRecord } from '@/modules/core/helpers/types'
import { expectToThrow } from '@/test/assertionHelper'
import { createRandomPassword } from '@/modules/core/helpers/testHelpers'
import {
  WorkspaceAdminRequiredError,
  WorkspaceDomainBlockedError,
  WorkspaceNotFoundError,
  WorkspaceNoVerifiedDomainsError,
  WorkspaceProtectedError,
  WorkspaceUnverifiedDomainError
} from '@/modules/workspaces/errors/workspace'
import { UserEmail } from '@/modules/core/domain/userEmails/types'
import { merge, omit } from 'lodash'
import { GetWorkspaceWithDomains } from '@/modules/workspaces/domain/operations'
import { FindVerifiedEmailsByUserId } from '@/modules/core/domain/userEmails/operations'
import { EventNames } from '@/modules/shared/services/eventBus'
import { mapWorkspaceRoleToInitialProjectRole } from '@/modules/workspaces/domain/logic'

type WorkspaceTestContext = {
  storedWorkspaces: Omit<Workspace, 'domains'>[]
  storedRoles: WorkspaceAcl[]
  eventData: {
    isCalled: boolean
    eventName: string
    payload: unknown
  }
}

const buildCreateWorkspaceWithTestContext = (
  dependencyOverrides: Partial<Parameters<typeof createWorkspaceFactory>[0]> = {}
) => {
  const context: WorkspaceTestContext = {
    storedWorkspaces: [],
    storedRoles: [],
    eventData: {
      isCalled: false,
      eventName: '',
      payload: {}
    }
  }

  const deps: Parameters<typeof createWorkspaceFactory>[0] = {
    upsertWorkspace: async ({
      workspace
    }: {
      workspace: Omit<Workspace, 'domains'>
    }) => {
      context.storedWorkspaces.push(workspace)
    },
    upsertWorkspaceRole: async (workspaceAcl: WorkspaceAcl) => {
      context.storedRoles.push(workspaceAcl)
    },
    emitWorkspaceEvent: async ({ eventName, payload }) => {
      context.eventData.isCalled = true
      context.eventData.eventName = eventName
      context.eventData.payload = payload
      return []
    },
    ...dependencyOverrides
  }

  const createWorkspace = createWorkspaceFactory(deps)

  return { context, createWorkspace }
}

const getCreateWorkspaceInput = () => {
  return {
    userId: cryptoRandomString({ length: 10 }),
    workspaceInput: {
      description: 'foobar',
      logo: null,
      name: cryptoRandomString({ length: 6 }),
      defaultLogoIndex: 0
    }
  }
}

describe('Workspace services', () => {
  describe('createWorkspaceFactory creates a function, that', () => {
    it('stores the workspace', async () => {
      const { context, createWorkspace } = buildCreateWorkspaceWithTestContext()

      const { userId, workspaceInput } = getCreateWorkspaceInput()
      const workspace = await createWorkspace({
        userId,
        workspaceInput,
        userResourceAccessLimits: null
      })

      expect(context.storedWorkspaces.length).to.equal(1)
      expect(context.storedWorkspaces[0]).to.deep.equal(omit(workspace, 'domains'))
    })
    it('makes the workspace creator becomes a workspace:admin', async () => {
      const { context, createWorkspace } = buildCreateWorkspaceWithTestContext()

      const { userId, workspaceInput } = getCreateWorkspaceInput()
      const workspace = await createWorkspace({
        userId,
        workspaceInput,
        userResourceAccessLimits: null
      })

      expect(context.storedRoles.length).to.equal(1)
      expect(context.storedRoles[0].userId).to.equal(userId)
      expect(context.storedRoles[0].workspaceId).to.equal(workspace.id)
      expect(context.storedRoles[0].role).to.equal(Roles.Workspace.Admin)
    })
    it('emits a workspace created event', async () => {
      const { context, createWorkspace } = buildCreateWorkspaceWithTestContext()

      const { userId, workspaceInput } = getCreateWorkspaceInput()
      const workspace = await createWorkspace({
        userId,
        workspaceInput,
        userResourceAccessLimits: null
      })

      expect(context.eventData.isCalled).to.equal(true)
      expect(context.eventData.eventName).to.equal(WorkspaceEvents.Created)
      expect(context.eventData.payload).to.deep.equal({
        ...workspace,
        createdByUserId: userId
      })
    })
  })
  describe('updateWorkspaceFactory creates a function, that', () => {
    const createTestWorkspaceWithDomainsData = (
      input: Partial<WorkspaceWithDomains> = {}
    ): WorkspaceWithDomains => {
      const workspaceId = cryptoRandomString({ length: 10 })
      const workspace: WorkspaceWithDomains = {
        id: workspaceId,
        name: cryptoRandomString({ length: 10 }),
        description: cryptoRandomString({ length: 20 }),
        createdAt: new Date(),
        updatedAt: new Date(),
        logo: null,
        defaultLogoIndex: 0,
        discoverabilityEnabled: false,
        domainBasedMembershipProtectionEnabled: false,
        domains: []
      }
      return merge(workspace, input)
    }
    it('throws WorkspaceNotFoundError if the workspace is not found', async () => {
      const err = await expectToThrow(async () => {
        await updateWorkspaceFactory({
          getWorkspace: async () => null,
          emitWorkspaceEvent: async () => {
            expect.fail()
          },
          upsertWorkspace: async () => {
            expect.fail()
          }
        })({
          workspaceId: cryptoRandomString({ length: 10 }),
          workspaceInput: {}
        })
      })
      expect(err.message).to.be.equal(new WorkspaceNotFoundError().message)
    })
    it('throws from image validator if the workspace logo is invalid', async () => {
      const workspace = createTestWorkspaceWithDomainsData()
      const err = await expectToThrow(async () => {
        await updateWorkspaceFactory({
          getWorkspace: async () => workspace,
          emitWorkspaceEvent: async () => {
            expect.fail()
          },
          upsertWorkspace: async () => {
            expect.fail()
          }
        })({
          workspaceId: workspace.id,
          workspaceInput: {
            logo: 'a broken logo'
          }
        })
      })
      expect(err.message).to.be.equal('Provided logo is malformed')
    })
    it('validates description length', async () => {
      const workspace = createTestWorkspaceWithDomainsData()
      const err = await expectToThrow(async () => {
        await updateWorkspaceFactory({
          getWorkspace: async () => workspace,
          emitWorkspaceEvent: async () => {
            expect.fail()
          },
          upsertWorkspace: async () => {
            expect.fail()
          }
        })({
          workspaceId: workspace.id,
          workspaceInput: {
            logo: 'a broken logo'
          }
        })
      })
      expect(err.message).to.be.equal('Provided logo is malformed')
    })
    it('does not allow turning on discoverability if the workspace has no verified domains', async () => {
      const workspace = createTestWorkspaceWithDomainsData()
      const err = await expectToThrow(async () => {
        await updateWorkspaceFactory({
          getWorkspace: async () => workspace,
          emitWorkspaceEvent: async () => {
            expect.fail()
          },
          upsertWorkspace: async () => {
            expect.fail()
          }
        })({
          workspaceId: workspace.id,
          workspaceInput: {
            discoverabilityEnabled: true
          }
        })
      })
      expect(err.message).to.be.equal(new WorkspaceNoVerifiedDomainsError().message)
    })

    it('does not allow turning on domainBasedMembershipProtection if the workspace has no verified domains', async () => {
      const workspace = createTestWorkspaceWithDomainsData()
      const err = await expectToThrow(async () => {
        await updateWorkspaceFactory({
          getWorkspace: async () => workspace,
          emitWorkspaceEvent: async () => {
            expect.fail()
          },
          upsertWorkspace: async () => {
            expect.fail()
          }
        })({
          workspaceId: workspace.id,
          workspaceInput: {
            domainBasedMembershipProtectionEnabled: true
          }
        })
      })
      expect(err.message).to.be.equal(new WorkspaceNoVerifiedDomainsError().message)
    })

    it('does not allow setting the workspace name to an empty string', async () => {
      const workspace = createTestWorkspaceWithDomainsData()

      let newWorkspaceName
      await updateWorkspaceFactory({
        getWorkspace: async () => workspace,
        emitWorkspaceEvent: async () => {
          return []
        },
        upsertWorkspace: async ({ workspace }) => {
          newWorkspaceName = workspace.name
        }
      })({
        workspaceId: workspace.id,
        workspaceInput: { name: '' }
      })
      expect(newWorkspaceName).to.be.equal(workspace.name)
    })
    it('updates the workspace and emits the correct event payload', async () => {
      const workspaceId = cryptoRandomString({ length: 10 })
      const workspace = createTestWorkspaceWithDomainsData({
        id: workspaceId,
        domains: [
          {
            createdAt: new Date(),
            createdByUserId: cryptoRandomString({ length: 10 }),
            domain: 'example.com',
            updatedAt: new Date(),
            id: cryptoRandomString({ length: 10 }),
            verified: true,
            workspaceId
          }
        ]
      })

      let updatedWorkspace

      const workspaceInput = {
        name: cryptoRandomString({ length: 10 }),
        discoverabilityEnabled: true
      }

      await updateWorkspaceFactory({
        getWorkspace: async () => workspace,
        emitWorkspaceEvent: async () => {
          return []
        },
        upsertWorkspace: async ({ workspace }) => {
          updatedWorkspace = workspace
        }
      })({
        workspaceId,
        workspaceInput
      })
      expect(updatedWorkspace!.name).to.be.equal(workspaceInput.name)
      expect(updatedWorkspace!.discoverabilityEnabled).to.be.equal(
        workspaceInput.discoverabilityEnabled
      )
    })
  })
})

type WorkspaceRoleTestContext = {
  workspaceId: string
  workspaceRoles: WorkspaceAcl[]
  workspaceProjects: StreamRecord[]
  workspaceProjectRoles: StreamAclRecord[]
  eventData: {
    isCalled: boolean
    eventName: string
    payload: unknown
  }
  workspace: Partial<Workspace & { domains: Partial<WorkspaceDomain[]> }>
}

const getDefaultWorkspaceRoleTestContext = (): WorkspaceRoleTestContext => {
  const workspaceId = cryptoRandomString({ length: 10 })
  return {
    workspaceId,
    workspaceRoles: [],
    workspaceProjects: [],
    workspaceProjectRoles: [],
    eventData: {
      isCalled: false,
      eventName: '',
      payload: {}
    },
    workspace: {
      id: workspaceId,
      domains: []
    }
  }
}

const buildDeleteWorkspaceRoleAndTestContext = (
  contextOverrides: Partial<WorkspaceRoleTestContext> = {},
  dependencyOverrides: Partial<Parameters<typeof deleteWorkspaceRoleFactory>[0]> = {}
) => {
  const context: WorkspaceRoleTestContext = {
    ...getDefaultWorkspaceRoleTestContext(),
    ...contextOverrides
  }

  const deps: Parameters<typeof deleteWorkspaceRoleFactory>[0] = {
    getWorkspaceRoles: async () => context.workspaceRoles,
    deleteWorkspaceRole: async (role) => {
      const isMatch = (acl: WorkspaceAcl): boolean => {
        return acl.workspaceId === role.workspaceId && acl.userId === role.userId
      }

      const deletedRoleIndex = context.workspaceRoles.findIndex(isMatch)

      if (deletedRoleIndex < 0) {
        return null
      }

      const deletedRole = structuredClone(context.workspaceRoles[deletedRoleIndex])

      context.workspaceRoles = context.workspaceRoles.filter((acl) => !isMatch(acl))

      return deletedRole
    },
    emitWorkspaceEvent: async ({ eventName, payload }) => {
      context.eventData.isCalled = true
      context.eventData.eventName = eventName
      context.eventData.payload = payload

      return []
    },
    async *queryAllWorkspaceProjects() {
      yield context.workspaceProjects
    },
    deleteProjectRole: async ({ projectId, userId }) => {
      context.workspaceProjectRoles = context.workspaceProjectRoles.filter(
        (role) => role.resourceId !== projectId && role.userId !== userId
      )
      return {} as StreamRecord
    },
    ...dependencyOverrides
  }

  const deleteWorkspaceRole = deleteWorkspaceRoleFactory(deps)

  return { deleteWorkspaceRole, context }
}

const buildUpdateWorkspaceRoleAndTestContext = (
  contextOverrides: Partial<WorkspaceRoleTestContext> = {},
  dependencyOverrides: Partial<Parameters<typeof updateWorkspaceRoleFactory>[0]> = {}
) => {
  const context = {
    ...getDefaultWorkspaceRoleTestContext(),
    ...contextOverrides
  }

  const deps: Parameters<typeof updateWorkspaceRoleFactory>[0] = {
    getWorkspaceRoles: async () => context.workspaceRoles,
    getWorkspaceWithDomains: async () =>
      context.workspace as unknown as Workspace & { domains: WorkspaceDomain[] },
    findVerifiedEmailsByUserId: async () => [],
    upsertWorkspaceRole: async (role) => {
      context.workspaceRoles = context.workspaceRoles.filter(
        (acl) => acl.userId !== role.userId
      )
      context.workspaceRoles.push(role)
    },
    emitWorkspaceEvent: async ({ eventName, payload }) => {
      context.eventData.isCalled = true
      context.eventData.eventName = eventName
      context.eventData.payload = payload

      return []
    },
    async *queryAllWorkspaceProjects() {
      yield context.workspaceProjects
    },
    getDefaultWorkspaceProjectRoleMapping: mapWorkspaceRoleToInitialProjectRole,
    upsertProjectRole: async (role) => {
      const streamAcl: StreamAclRecord = {
        userId: role.userId,
        role: role.role,
        resourceId: role.projectId
      }

      context.workspaceProjectRoles = context.workspaceProjectRoles.filter(
        (acl) => acl.userId !== role.userId
      )
      context.workspaceProjectRoles.push(streamAcl)

      return {} as StreamRecord
    },
    deleteProjectRole: async ({ userId }) => {
      context.workspaceProjectRoles = context.workspaceProjectRoles.filter(
        (acl) => acl.userId !== userId
      )

      return {} as StreamRecord
    },
    ...dependencyOverrides
  }

  const updateWorkspaceRole = updateWorkspaceRoleFactory(deps)

  return { updateWorkspaceRole, context }
}

describe('Workspace role services', () => {
  describe('deleteWorkspaceRoleFactory creates a function, that', () => {
    it('deletes the workspace role', async () => {
      const userId = cryptoRandomString({ length: 10 })
      const workspaceId = cryptoRandomString({ length: 10 })
      const role: WorkspaceAcl = {
        userId,
        workspaceId,
        role: Roles.Workspace.Member,
        createdAt: new Date()
      }

      const { deleteWorkspaceRole, context } = buildDeleteWorkspaceRoleAndTestContext({
        workspaceId,
        workspaceRoles: [role]
      })

      const deletedRole = await deleteWorkspaceRole({ userId, workspaceId })

      expect(context.workspaceRoles.length).to.equal(0)
      expect(deletedRole).to.deep.equal(role)
    })
    it('emits a role-deleted event', async () => {
      const userId = cryptoRandomString({ length: 10 })
      const workspaceId = cryptoRandomString({ length: 10 })
      const role: WorkspaceAcl = {
        userId,
        workspaceId,
        role: Roles.Workspace.Member,
        createdAt: new Date()
      }

      const { deleteWorkspaceRole, context } = buildDeleteWorkspaceRoleAndTestContext({
        workspaceId,
        workspaceRoles: [role]
      })

      await deleteWorkspaceRole({ userId, workspaceId })

      expect(context.eventData.isCalled).to.be.true
      expect(context.eventData.eventName).to.equal(WorkspaceEvents.RoleDeleted)
      expect(context.eventData.payload).to.deep.equal(role)
    })
    it('throws if attempting to delete the last admin from a workspace', async () => {
      const userId = cryptoRandomString({ length: 10 })
      const workspaceId = cryptoRandomString({ length: 10 })
      const role: WorkspaceAcl = {
        userId,
        workspaceId,
        role: Roles.Workspace.Admin,
        createdAt: new Date()
      }

      const { deleteWorkspaceRole } = buildDeleteWorkspaceRoleAndTestContext({
        workspaceId,
        workspaceRoles: [role]
      })

      await expectToThrow(() => deleteWorkspaceRole({ userId, workspaceId }))
    })
    it('deletes workspace project roles', async () => {
      const userId = cryptoRandomString({ length: 10 })
      const workspaceId = cryptoRandomString({ length: 10 })
      const projectId = cryptoRandomString({ length: 10 })

      const { deleteWorkspaceRole, context } = buildDeleteWorkspaceRoleAndTestContext({
        workspaceId,
        workspaceRoles: [
          {
            userId,
            workspaceId,
            role: Roles.Workspace.Member,
            createdAt: new Date()
          }
        ],
        workspaceProjects: [{ id: projectId } as StreamRecord],
        workspaceProjectRoles: [
          { userId, role: Roles.Stream.Contributor, resourceId: projectId }
        ]
      })

      await deleteWorkspaceRole({ userId, workspaceId })

      expect(context.workspaceProjectRoles.length).to.equal(0)
    })
  })

  describe('updateWorkspaceRoleFactory creates a function, that', () => {
    it('sets the workspace role', async () => {
      const userId = cryptoRandomString({ length: 10 })
      const workspaceId = cryptoRandomString({ length: 10 })
      const role = {
        userId,
        workspaceId,
        role: Roles.Workspace.Member
      }

      const { updateWorkspaceRole, context } = buildUpdateWorkspaceRoleAndTestContext({
        workspaceId
      })

      await updateWorkspaceRole(role)

      const updatedRole = context.workspaceRoles[0]

      expect(context.workspaceRoles.length).to.equal(1)
      expect(updatedRole.userId).to.equal(role.userId)
      expect(updatedRole.role).to.equal(role.role)
    })
    it('emits a role-updated event', async () => {
      const userId = cryptoRandomString({ length: 10 })
      const workspaceId = cryptoRandomString({ length: 10 })
      const role: Pick<WorkspaceAcl, 'userId' | 'workspaceId' | 'role'> = {
        userId,
        workspaceId,
        role: Roles.Workspace.Member
      }

      const { updateWorkspaceRole, context } = buildUpdateWorkspaceRoleAndTestContext({
        workspaceId
      })

      await updateWorkspaceRole(role)

      expect(context.eventData.isCalled).to.be.true
      expect(context.eventData.eventName).to.equal(WorkspaceEvents.RoleUpdated)
      expect(context.eventData.payload).to.deep.equal(role)
    })
    it('throws if attempting to remove the last admin in a workspace', async () => {
      const userId = cryptoRandomString({ length: 10 })
      const workspaceId = cryptoRandomString({ length: 10 })
      const role: WorkspaceAcl = {
        userId,
        workspaceId,
        role: Roles.Workspace.Admin,
        createdAt: new Date()
      }

      const { updateWorkspaceRole } = buildUpdateWorkspaceRoleAndTestContext({
        workspaceId,
        workspaceRoles: [role]
      })

      await expectToThrow(() =>
        updateWorkspaceRole({ ...role, role: Roles.Workspace.Member })
      )
    })
    it('throws if attempting to set user role to more than GUEST and workspace domain protection is enabled and user has not an email matching a workspace domain', async () => {
      const adminId = cryptoRandomString({ length: 10 })
      const guestId = cryptoRandomString({ length: 10 })
      const workspaceId = cryptoRandomString({ length: 10 })
      const roleAdmin: WorkspaceAcl = {
        userId: adminId,
        workspaceId,
        role: Roles.Workspace.Admin,
        createdAt: new Date()
      }
      const roleGuest: WorkspaceAcl = {
        userId: guestId,
        workspaceId,
        role: Roles.Workspace.Guest,
        createdAt: new Date()
      }

      const workspace = {
        id: workspaceId,
        domainBasedMembershipProtectionEnabled: true,
        domains: [
          {
            verified: true,
            domain: 'example.org'
          }
        ]
      }

      const { updateWorkspaceRole } = buildUpdateWorkspaceRoleAndTestContext(
        {
          workspaceId,
          workspaceRoles: [roleAdmin, roleGuest]
        },
        {
          getWorkspaceWithDomains: (() =>
            workspace) as unknown as GetWorkspaceWithDomains,
          findVerifiedEmailsByUserId: (() => [
            {
              email: 'notcorrect@nonexample.org'
            }
          ]) as unknown as FindVerifiedEmailsByUserId
        }
      )

      const err = await expectToThrow(() =>
        updateWorkspaceRole({
          workspaceId,
          userId: guestId,
          role: Roles.Workspace.Member
        })
      )
      expect(err.message).to.eq(new WorkspaceProtectedError().message)
    })
    it('sets roles on workspace projects when user added to workspace as admin', async () => {
      const userId = cryptoRandomString({ length: 10 })
      const workspaceId = cryptoRandomString({ length: 10 })
      const projectId = cryptoRandomString({ length: 10 })

      const workspaceRole: WorkspaceAcl = {
        userId,
        workspaceId,
        role: Roles.Workspace.Admin,
        createdAt: new Date()
      }

      const { updateWorkspaceRole, context } = buildUpdateWorkspaceRoleAndTestContext({
        workspaceId,
        workspaceProjects: [{ id: projectId } as StreamRecord]
      })

      await updateWorkspaceRole(workspaceRole)

      expect(context.workspaceProjectRoles.length).to.equal(1)
      expect(context.workspaceProjectRoles[0].userId).to.equal(userId)
      expect(context.workspaceProjectRoles[0].resourceId).to.equal(projectId)
    })
    it('sets roles on workspace projects when user added to workspace as member', async () => {
      const userId = cryptoRandomString({ length: 10 })
      const workspaceId = cryptoRandomString({ length: 10 })
      const projectId = cryptoRandomString({ length: 10 })

      const workspaceRole: WorkspaceAcl = {
        userId,
        workspaceId,
        role: Roles.Workspace.Member,
        createdAt: new Date()
      }

      const { updateWorkspaceRole, context } = buildUpdateWorkspaceRoleAndTestContext({
        workspaceId,
        workspaceProjects: [{ id: projectId } as StreamRecord]
      })

      await updateWorkspaceRole(workspaceRole)

      expect(context.workspaceProjectRoles.length).to.equal(1)
      expect(context.workspaceProjectRoles[0].userId).to.equal(userId)
      expect(context.workspaceProjectRoles[0].resourceId).to.equal(projectId)
    })
    it('does not set roles on workspace projects when user added to workspace as guest', async () => {
      const userId = cryptoRandomString({ length: 10 })
      const workspaceId = cryptoRandomString({ length: 10 })
      const projectId = cryptoRandomString({ length: 10 })

      const workspaceRole: WorkspaceAcl = {
        userId,
        workspaceId,
        role: Roles.Workspace.Guest,
        createdAt: new Date()
      }

      const { updateWorkspaceRole, context } = buildUpdateWorkspaceRoleAndTestContext({
        workspaceId,
        workspaceProjects: [{ id: projectId } as StreamRecord]
      })

      await updateWorkspaceRole(workspaceRole)

      expect(context.workspaceProjectRoles.find((role) => role.userId === userId)).to
        .not.exist
    })
  })

  describe('Workspace domains', () => {
    describe('addDomainToWorkspaceFactory returns a function that,', () => {
      it('throws a ForbiddenDomainError if the domain is not allowed to be registered', async () => {
        const userId = createRandomPassword()
        const workspaceId = createRandomPassword()
        const domain = 'gmail.com'

        const err = await expectToThrow(
          async () =>
            await addDomainToWorkspaceFactory({
              findEmailsByUserId: async () => [],
              getWorkspace: async () => {
                expect.fail()
              },
              getDomains: async () => {
                expect.fail()
              },
              storeWorkspaceDomain: async () => {
                return
              },
              upsertWorkspace: async () => {
                expect.fail()
              },
              emitWorkspaceEvent: async () => {
                expect.fail()
              }
            })({ userId, workspaceId, domain })
        )

        expect(err.message).to.eq(new WorkspaceDomainBlockedError().message)
      })
      it('should throw and error if user has no email with specified domain', async () => {
        const userId = createRandomPassword()
        const workspaceId = createRandomPassword()
        const domain = 'example.org'

        const err = await expectToThrow(
          async () =>
            await addDomainToWorkspaceFactory({
              findEmailsByUserId: async () => [],
              getWorkspace: async () => {
                expect.fail()
              },
              getDomains: async () => {
                expect.fail()
              },
              storeWorkspaceDomain: async () => {
                return
              },
              upsertWorkspace: async () => {
                expect.fail()
              },
              emitWorkspaceEvent: async () => {
                expect.fail()
              }
            })({ userId, workspaceId, domain })
        )

        expect(err.message).to.eq(new WorkspaceUnverifiedDomainError().message)
      })
      it('should throw and error if the workspace is not found', async () => {
        const userId = createRandomPassword()
        const workspaceId = createRandomPassword()
        const domain = 'example.org'

        const err = await expectToThrow(
          async () =>
            await addDomainToWorkspaceFactory({
              findEmailsByUserId: async () =>
                [{ email: `foo@${domain}`, verified: true }] as UserEmail[],
              getWorkspace: async () => {
                return null
              },
              getDomains: async () => {
                expect.fail()
              },
              storeWorkspaceDomain: async () => {
                return
              },
              upsertWorkspace: async () => {
                expect.fail()
              },
              emitWorkspaceEvent: async () => {
                expect.fail()
              }
            })({ userId, workspaceId, domain })
        )

        expect(err.message).to.eq(new WorkspaceAdminRequiredError().message)
      })
      it('throws a WorkspaceUnverifiedDomainError if the users domain matching email is not verified', async () => {
        const userId = createRandomPassword()
        const workspaceId = createRandomPassword()
        const domain = 'example.org'

        const err = await expectToThrow(
          async () =>
            await addDomainToWorkspaceFactory({
              findEmailsByUserId: async () =>
                [{ email: `foo@${domain}`, verified: false }] as UserEmail[],
              getWorkspace: async () => {
                expect.fail()
              },
              getDomains: async () => {
                expect.fail()
              },
              storeWorkspaceDomain: async () => {
                return
              },
              upsertWorkspace: async () => {
                expect.fail()
              },
              emitWorkspaceEvent: async () => {
                expect.fail()
              }
            })({ userId, workspaceId, domain })
        )

        expect(err.message).to.eq(new WorkspaceUnverifiedDomainError().message)
      })
      it('throws a WorkspaceAdminRequiredError if the user does not have a workspace role', async () => {
        const userId = createRandomPassword()
        const workspaceId = createRandomPassword()
        const domain = 'example.org'

        const err = await expectToThrow(
          async () =>
            await addDomainToWorkspaceFactory({
              findEmailsByUserId: async () =>
                [{ email: `foo@${domain}`, verified: true }] as UserEmail[],
              getWorkspace: async () => {
                return null
              },
              getDomains: async () => {
                expect.fail()
              },
              storeWorkspaceDomain: async () => {
                return
              },
              upsertWorkspace: async () => {
                expect.fail()
              },
              emitWorkspaceEvent: async () => {
                expect.fail()
              }
            })({ userId, workspaceId, domain })
        )

        expect(err.message).to.eq(new WorkspaceAdminRequiredError().message)
      })
      it('throws a WorkspaceAdminRequiredError if the user is not an admin of the workspace', async () => {
        const userId = createRandomPassword()
        const workspaceId = createRandomPassword()
        const domain = 'example.org'

        const err = await expectToThrow(
          async () =>
            await addDomainToWorkspaceFactory({
              findEmailsByUserId: async () =>
                [{ email: `foo@${domain}`, verified: true }] as UserEmail[],
              getWorkspace: async () => {
                return {
                  role: Roles.Workspace.Guest,
                  userId,
                  id: workspaceId,
                  name: cryptoRandomString({ length: 10 }),
                  logo: null,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  description: null,
                  discoverabilityEnabled: false,
                  domainBasedMembershipProtectionEnabled: false,
                  defaultLogoIndex: 0
                }
              },
              getDomains: async () => {
                expect.fail()
              },
              storeWorkspaceDomain: async () => {
                return
              },
              upsertWorkspace: async () => {
                expect.fail()
              },
              emitWorkspaceEvent: async () => {
                expect.fail()
              }
            })({ userId, workspaceId, domain })
        )

        expect(err.message).to.eq(new WorkspaceAdminRequiredError().message)
      })
      it('does NOT store the verified workspace domain if its already stored', async () => {
        const userId = createRandomPassword()
        const workspaceId = createRandomPassword()
        const domain = 'example.org'

        const domainRequest = {
          userId,
          workspaceId,
          domain
        }

        const storedDomains: WorkspaceDomain | undefined = undefined

        const workspace: Workspace = {
          id: workspaceId,
          name: cryptoRandomString({ length: 10 }),
          logo: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          description: null,
          discoverabilityEnabled: false,
          domainBasedMembershipProtectionEnabled: false,
          defaultLogoIndex: 0
        }

        await addDomainToWorkspaceFactory({
          findEmailsByUserId: async () =>
            [{ email: `foo@${domain}`, verified: true }] as UserEmail[],
          getWorkspace: async () => {
            return {
              role: Roles.Workspace.Admin,
              userId,
              ...workspace
            }
          },

          getDomains: async () => {
            return [{ domain }] as WorkspaceDomain[]
          },
          upsertWorkspace: async () => {
            expect.fail()
          },
          emitWorkspaceEvent: async () => {
            expect.fail()
          },
          storeWorkspaceDomain: async () => {
            expect.fail()
          }
        })(domainRequest)

        expect(storedDomains).to.be.undefined
      })
      it('stores the verified workspace domain, toggles workspace discoverability for first domain, emits update event', async () => {
        const userId = createRandomPassword()
        const workspaceId = createRandomPassword()
        const domain = 'example.org'

        const domainRequest = {
          userId,
          workspaceId,
          domain
        }

        let storedDomains: WorkspaceDomain | undefined = undefined
        let storedWorkspace: Omit<Workspace, 'domains'> | undefined = undefined
        let omittedEventName: EventNames | undefined = undefined

        const workspace: Workspace = {
          id: workspaceId,
          name: cryptoRandomString({ length: 10 }),
          logo: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          description: null,
          discoverabilityEnabled: false,
          domainBasedMembershipProtectionEnabled: false,
          defaultLogoIndex: 0
        }

        await addDomainToWorkspaceFactory({
          findEmailsByUserId: async () =>
            [{ email: `foo@${domain}`, verified: true }] as UserEmail[],
          getWorkspace: async () => {
            return {
              role: Roles.Workspace.Admin,
              userId,
              ...workspace
            }
          },

          getDomains: async () => {
            return []
          },
          upsertWorkspace: async ({ workspace }) => {
            storedWorkspace = workspace
          },
          emitWorkspaceEvent: async ({ eventName }) => {
            omittedEventName = eventName
            return []
          },
          storeWorkspaceDomain: async ({ workspaceDomain }) => {
            storedDomains = workspaceDomain
          }
        })(domainRequest)

        expect(storedDomains).to.not.be.undefined
        expect(storedDomains!.createdByUserId).to.be.equal(userId)
        expect(storedDomains!.domain).to.be.equal(domain)
        expect(storedDomains!.workspaceId).to.be.equal(workspaceId)
        expect(storedDomains!.verified).to.be.true

        expect(storedWorkspace!.discoverabilityEnabled).to.be.true

        expect(omittedEventName).to.be.equal(WorkspaceEvents.Updated)
      })
      it('stores the second verified domain, does NOT toggle workspace discoverability for subsequent domains', async () => {
        const userId = createRandomPassword()
        const workspaceId = createRandomPassword()
        const domain = 'example.org'
        const domain2 = 'example2.org'

        const domainRequest = {
          userId,
          workspaceId,
          domain
        }

        const workspaceWithoutDomains = {
          id: workspaceId,
          name: cryptoRandomString({ length: 10 }),
          logo: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          description: null,
          discoverabilityEnabled: false,
          domainBasedMembershipProtectionEnabled: false,
          domains: [],
          defaultLogoIndex: 0
        }

        let workspaceData: Workspace = {
          ...workspaceWithoutDomains
        }
        const insertedDomains: WorkspaceDomain[] = []
        let storedDomains: WorkspaceDomain[] = []

        const addDomainToWorkspace = addDomainToWorkspaceFactory({
          findEmailsByUserId: async () =>
            [
              { email: `foo@${domain}`, verified: true },
              { email: `foo@${domain2}`, verified: true }
            ] as UserEmail[],
          getWorkspace: async () => {
            return {
              role: Roles.Workspace.Admin,
              userId,
              ...workspaceData
            }
          },
          getDomains: async () => storedDomains,
          upsertWorkspace: async ({ workspace }) => {
            workspaceData = { ...workspaceData, ...workspace }
          },
          emitWorkspaceEvent: async () => {
            return []
          },
          storeWorkspaceDomain: async ({ workspaceDomain }) => {
            insertedDomains.push(workspaceDomain)
          }
        })
        await addDomainToWorkspace(domainRequest)

        expect(insertedDomains).to.have.lengthOf(1)
        expect(workspaceData.discoverabilityEnabled).to.be.true

        // dirty hack, im post fact storing the domain on the test object
        storedDomains = insertedDomains

        //faking user interaction disabling discoverability
        workspaceData.discoverabilityEnabled = false
        await addDomainToWorkspace({ ...domainRequest, domain: domain2 })

        expect(workspaceData.discoverabilityEnabled).to.be.false
      })
    })
  })
})
