import { graphql } from '~~/lib/common/generated/gql'

export const authLoginPanelQuery = graphql(`
  query AuthLoginPanel {
    serverInfo {
      authStrategies {
        id
      }
      ...AuthStategiesServerInfoFragment
    }
  }
`)

export const authRegisterPanelQuery = graphql(`
  query AuthRegisterPanel($token: String) {
    serverInfo {
      inviteOnly
      authStrategies {
        id
      }
      ...AuthStategiesServerInfoFragment
      ...ServerTermsOfServicePrivacyPolicyFragment
    }
    serverInviteByToken(token: $token) {
      id
      email
    }
  }
`)

export const authLoginPanelWorkspaceInviteQuery = graphql(`
  query AuthLoginPanelWorkspaceInvite($token: String) {
    workspaceInvite(token: $token) {
      id
      email
      ...AuthWorkspaceInviteHeader_PendingWorkspaceCollaborator
      ...AuthLoginWithEmailBlock_PendingWorkspaceCollaborator
    }
  }
`)

export const authorizableAppMetadataQuery = graphql(`
  query AuthorizableAppMetadata($id: String!) {
    app(id: $id) {
      id
      name
      description
      trustByDefault
      redirectUrl
      scopes {
        name
        description
      }
      author {
        name
        id
        avatar
      }
    }
  }
`)

export const activeUserWorkspaceExistenceCheckQuery = graphql(`
  query ActiveUserWorkspaceExistenceCheck($filter: UserProjectsFilter) {
    activeUser {
      id
      verified
      isOnboardingFinished
      versions(limit: 0) {
        totalCount
      }
      projects(filter: $filter) {
        totalCount
      }
      workspaces(limit: 0) {
        totalCount
        items {
          id
          slug
          creationState {
            completed
          }
        }
      }
      discoverableWorkspaces {
        id
      }
      workspaceJoinRequests(limit: 0) {
        totalCount
      }
    }
  }
`)

export const activeUserActiveWorkspaceCheckQuery = graphql(`
  query ActiveUserActiveWorkspaceCheck {
    activeUser {
      id
      activeWorkspace {
        id
        role
        slug
      }
      workspaces(limit: 1) {
        items {
          id
          slug
        }
      }
    }
  }
`)

export const projectWorkspaceAccessCheckQuery = graphql(`
  query projectWorkspaceAccessCheck($projectId: String!) {
    project(id: $projectId) {
      id
      role
      workspace {
        id
        slug
        role
      }
    }
  }
`)
