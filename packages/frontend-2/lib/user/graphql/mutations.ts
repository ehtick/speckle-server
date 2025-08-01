import { graphql } from '~~/lib/common/generated/gql'

export const updateUserMutation = graphql(`
  mutation UpdateUser($input: UserUpdateInput!) {
    activeUserMutations {
      update(user: $input) {
        id
        name
        bio
        company
        avatar
      }
    }
  }
`)

export const updateNotificationPreferencesMutation = graphql(`
  mutation UpdateNotificationPreferences($input: JSONObject!) {
    userNotificationPreferencesUpdate(preferences: $input)
  }
`)

export const deleteAccountMutation = graphql(`
  mutation DeleteAccount($input: UserDeleteInput!) {
    userDelete(userConfirmation: $input)
  }
`)

export const verifyEmailMutation = graphql(`
  mutation verifyEmail($input: VerifyUserEmailInput!) {
    activeUserMutations {
      emailMutations {
        verify(input: $input)
      }
    }
  }
`)

export const setActiveWorkspaceMutation = graphql(`
  mutation SetActiveWorkspace($slug: String, $id: String) {
    activeUserMutations {
      setActiveWorkspace(slug: $slug, id: $id) {
        ...WorkspaceSwitcherActiveWorkspace_LimitedWorkspace
      }
    }
  }
`)
