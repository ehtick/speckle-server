import gql from 'graphql-tag'

export const basicProjectFieldsFragment = gql`
  fragment BasicProjectFields on Project {
    id
    name
    description
    visibility
    allowPublicComments
    role
    createdAt
    updatedAt
  }
`

export const adminProjectListQuery = gql`
  query AdminProjectList(
    $query: String
    $orderBy: String
    $visibility: String
    $limit: Int! = 25
    $cursor: String = null
  ) {
    admin {
      projectList(
        query: $query
        orderBy: $orderBy
        visibility: $visibility
        limit: $limit
        cursor: $cursor
      ) {
        cursor
        totalCount
        items {
          ...BasicProjectFields
        }
      }
    }
  }

  ${basicProjectFieldsFragment}
`

export const getProjectObjectQuery = gql`
  query GetProjectObject($projectId: String!, $objectId: String!) {
    project(id: $projectId) {
      object(id: $objectId) {
        id
        createdAt
      }
    }
  }
`

export const getProjectQuery = gql`
  query GetProject($id: String!) {
    project(id: $id) {
      id
      name
      workspaceId
      role
      ...BasicProjectFields
    }
  }

  ${basicProjectFieldsFragment}
`

export const createProjectMutation = gql`
  mutation CreateProject($input: ProjectCreateInput!) {
    projectMutations {
      create(input: $input) {
        ...BasicProjectFields
      }
    }
  }

  ${basicProjectFieldsFragment}
`

export const batchDeleteProjectsMutation = gql`
  mutation BatchDeleteProjects($ids: [String!]!) {
    projectMutations {
      batchDelete(ids: $ids)
    }
  }
`

export const updateProjectMutation = gql`
  mutation UpdateProject($input: ProjectUpdateInput!) {
    projectMutations {
      update(update: $input) {
        ...BasicProjectFields
      }
    }
  }

  ${basicProjectFieldsFragment}
`

export const updateProjectRoleMutation = gql`
  mutation UpdateProjectRole($input: ProjectUpdateRoleInput!) {
    projectMutations {
      updateRole(input: $input) {
        ...BasicProjectFields
      }
    }
  }

  ${basicProjectFieldsFragment}
`

export const getProjectCollaboratorsQuery = gql`
  query GetProjectCollaborators($projectId: String!) {
    project(id: $projectId) {
      id
      team {
        id
        role
      }
    }
  }
`

export const getProjectVersionsQuery = gql`
  query GetProjectVersions($projectId: String!) {
    project(id: $projectId) {
      versions {
        items {
          id
          referencedObject
        }
      }
    }
  }
`
