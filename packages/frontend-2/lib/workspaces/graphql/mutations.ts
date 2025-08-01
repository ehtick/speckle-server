import { graphql } from '~~/lib/common/generated/gql'

export const workspaceUpdateRoleMutation = graphql(`
  mutation UpdateRole($input: WorkspaceRoleUpdateInput!) {
    workspaceMutations {
      updateRole(input: $input) {
        team {
          items {
            id
            role
          }
        }
      }
    }
  }
`)

export const workspacesUpdateSeatTypeMutation = graphql(`
  mutation WorkspacesUpdateSeatType($input: WorkspaceUpdateSeatTypeInput!) {
    workspaceMutations {
      updateSeatType(input: $input) {
        team {
          items {
            id
            seatType
          }
        }
      }
    }
  }
`)

export const inviteToWorkspaceMutation = graphql(`
  mutation InviteToWorkspace(
    $workspaceId: String!
    $input: [WorkspaceInviteCreateInput!]!
  ) {
    workspaceMutations {
      invites {
        batchCreate(workspaceId: $workspaceId, input: $input) {
          id
          invitedTeam {
            ...SettingsWorkspacesMembersInvitesTable_PendingWorkspaceCollaborator
          }
        }
      }
    }
  }
`)

export const createWorkspaceMutation = graphql(`
  mutation CreateWorkspace($input: WorkspaceCreateInput!) {
    workspaceMutations {
      create(input: $input) {
        id
        ...SettingsSidebar_Workspace
      }
    }
  }
`)

export const processWorkspaceInviteMutation = graphql(`
  mutation ProcessWorkspaceInvite($input: WorkspaceInviteUseInput!) {
    workspaceMutations {
      invites {
        use(input: $input)
      }
    }
  }
`)

export const setDefaultRegionMutation = graphql(`
  mutation SetDefaultWorkspaceRegion($workspaceId: String!, $regionKey: String!) {
    workspaceMutations {
      setDefaultRegion(workspaceId: $workspaceId, regionKey: $regionKey) {
        id
        defaultRegion {
          id
          ...SettingsWorkspacesRegionsSelect_ServerRegionItem
        }
      }
    }
  }
`)

export const deleteWorkspaceSsoProviderMutation = graphql(`
  mutation DeleteWorkspaceSsoProvider($workspaceId: String!) {
    workspaceMutations {
      deleteSsoProvider(workspaceId: $workspaceId)
    }
  }
`)

export const updateWorkspaceCreationStateMutation = graphql(`
  mutation SetWorkspaceCreationState($input: WorkspaceCreationStateInput!) {
    workspaceMutations {
      updateCreationState(input: $input)
    }
  }
`)

export const workspaceUpdateDomainProtectionMutation = graphql(`
  mutation WorkspaceUpdateDomainProtectionMutation($input: WorkspaceUpdateInput!) {
    workspaceMutations {
      update(input: $input) {
        id
        domainBasedMembershipProtectionEnabled
      }
    }
  }
`)

export const workspaceUpdateDiscoverabilityMutation = graphql(`
  mutation WorkspaceUpdateDiscoverabilityMutation($input: WorkspaceUpdateInput!) {
    workspaceMutations {
      update(input: $input) {
        id
        discoverabilityEnabled
      }
    }
  }
`)

export const approveWorkspaceJoinRequestMutation = graphql(`
  mutation ApproveWorkspaceJoinRequest($input: ApproveWorkspaceJoinRequestInput!) {
    workspaceJoinRequestMutations {
      approve(input: $input)
    }
  }
`)

export const denyWorkspaceJoinRequestMutation = graphql(`
  mutation DenyWorkspaceJoinRequest($input: DenyWorkspaceJoinRequestInput!) {
    workspaceJoinRequestMutations {
      deny(input: $input)
    }
  }
`)

export const requestToJoinWorkspaceMutation = graphql(`
  mutation RequestToJoinWorkspace($input: WorkspaceRequestToJoinInput!) {
    workspaceMutations {
      requestToJoin(input: $input)
    }
  }
`)

export const dismissDiscoverableWorkspaceMutation = graphql(`
  mutation DismissDiscoverableWorkspace($input: WorkspaceDismissInput!) {
    workspaceMutations {
      dismiss(input: $input)
    }
  }
`)

export const workspaceUpdateAutoJoinMutation = graphql(`
  mutation WorkspaceUpdateAutoJoinMutation($input: WorkspaceUpdateInput!) {
    workspaceMutations {
      update(input: $input) {
        id
        discoverabilityAutoJoinEnabled
      }
    }
  }
`)

export const workspaceUpdateDefaultSeatTypeMutation = graphql(`
  mutation WorkspaceUpdateDefaultSeatTypeMutation($input: WorkspaceUpdateInput!) {
    workspaceMutations {
      update(input: $input) {
        id
        defaultSeatType
      }
    }
  }
`)

export const workspaceUpdateExclusiveMutation = graphql(`
  mutation WorkspaceUpdateExclusiveMutation($input: WorkspaceUpdateInput!) {
    workspaceMutations {
      update(input: $input) {
        id
        isExclusive
      }
    }
  }
`)
