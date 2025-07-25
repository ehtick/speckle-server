import type {
  GetActiveUserQuery,
  GetActiveUserQueryVariables,
  GetAdminUsersQuery,
  GetAdminUsersQueryVariables,
  GetOtherUserQuery,
  GetOtherUserQueryVariables,
  GetPendingEmailVerificationStatusQuery,
  GetPendingEmailVerificationStatusQueryVariables,
  RequestVerificationMutation,
  RequestVerificationMutationVariables
} from '@/modules/core/graph/generated/graphql'
import type { ExecuteOperationServer } from '@/test/graphqlHelper'
import { executeOperation } from '@/test/graphqlHelper'
import gql from 'graphql-tag'

const baseUserFieldsFragment = gql`
  fragment BaseUserFields on User {
    id
    email
    name
    bio
    company
    avatar
    verified
    role
  }
`

const baseLimitedUserFieldsFragment = gql`
  fragment BaseLimitedUserFields on LimitedUser {
    id
    name
    bio
    company
    avatar
    verified
  }
`

const getActiveUserQuery = gql`
  query GetActiveUser {
    activeUser {
      ...BaseUserFields
    }
  }

  ${baseUserFieldsFragment}
`

export const activeUserUpdateMutation = gql`
  mutation activeUserUpdateMutation($user: UserUpdateInput!) {
    activeUserMutations {
      update(user: $user) {
        name
        bio
        company
        avatar
      }
    }
  }
`

export const getActiveUserWithWorkspaceJoinRequestsQuery = gql`
  query GetActiveUserWithWorkspaceJoinRequests {
    activeUser {
      ...BaseUserFields
      workspaceJoinRequests {
        totalCount
        cursor
        items {
          workspace {
            id
            name
          }
          user {
            id
            name
          }
          status
        }
      }
    }
  }

  ${baseUserFieldsFragment}
`

const getOtherUserQuery = gql`
  query GetOtherUser($id: String!) {
    otherUser(id: $id) {
      ...BaseLimitedUserFields
    }
  }

  ${baseLimitedUserFieldsFragment}
`

const adminUsersQuery = gql`
  query GetAdminUsers($limit: Int! = 25, $offset: Int! = 0, $query: String = null) {
    adminUsers(limit: $limit, offset: $offset, query: $query) {
      totalCount
      items {
        id
        registeredUser {
          id
          email
          name
        }
        invitedUser {
          id
          email
          invitedBy {
            id
            name
          }
        }
      }
    }
  }
`

/**
 * @deprecated Leaving this behind while we still have the old user() query. This should
 * be deleted afterwards
 */
const getPendingEmailVerificationStatusQuery = gql`
  query GetPendingEmailVerificationStatus($id: String) {
    user(id: $id) {
      hasPendingVerification
    }
  }
`

const requestVerificationMutation = gql`
  mutation RequestVerification {
    requestVerification
  }
`

export const getUserActiveResources = gql`
  query UserActiveResources {
    activeUser {
      activeWorkspace {
        id
        name
      }
    }
  }
`

export const setUserActiveWorkspaceMutation = gql`
  mutation SetUserActiveWorkspace($slug: String) {
    activeUserMutations {
      setActiveWorkspace(slug: $slug) {
        id
      }
    }
  }
`

export const getActiveUser = (apollo: ExecuteOperationServer) =>
  executeOperation<GetActiveUserQuery, GetActiveUserQueryVariables>(
    apollo,
    getActiveUserQuery
  )

export const getOtherUser = (
  apollo: ExecuteOperationServer,
  variables: GetOtherUserQueryVariables
) =>
  executeOperation<GetOtherUserQuery, GetOtherUserQueryVariables>(
    apollo,
    getOtherUserQuery,
    variables
  )

export async function getAdminUsersList(
  apollo: ExecuteOperationServer,
  variables: GetAdminUsersQueryVariables
) {
  return await executeOperation<GetAdminUsersQuery, GetAdminUsersQueryVariables>(
    apollo,
    adminUsersQuery,
    variables
  )
}

export const getPendingEmailVerificationStatus = (
  apollo: ExecuteOperationServer,
  variables: GetPendingEmailVerificationStatusQueryVariables
) =>
  executeOperation<
    GetPendingEmailVerificationStatusQuery,
    GetPendingEmailVerificationStatusQueryVariables
  >(apollo, getPendingEmailVerificationStatusQuery, variables)

export const requestVerification = (
  apollo: ExecuteOperationServer,
  variables?: RequestVerificationMutationVariables
) =>
  executeOperation<RequestVerificationMutation, RequestVerificationMutationVariables>(
    apollo,
    requestVerificationMutation,
    variables
  )
