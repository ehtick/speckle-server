<template>
  <div>
    <Portal to="navigation">
      <template v-if="project.workspace && isWorkspacesEnabled">
        <HeaderNavLink
          :to="workspacesRoute"
          name="Workspaces"
          :separator="false"
        ></HeaderNavLink>
        <HeaderNavLink
          :to="workspaceRoute(project.workspace.id)"
          :name="project.workspace.name"
        ></HeaderNavLink>
      </template>
      <HeaderNavLink
        v-else
        :to="projectsRoute"
        name="Projects"
        :separator="false"
      ></HeaderNavLink>

      <HeaderNavLink
        :to="projectRoute(project.id)"
        :name="project.name"
      ></HeaderNavLink>
    </Portal>

    <div class="flex gap-x-3">
      <NuxtLink
        v-if="project.workspace && isWorkspacesEnabled"
        :to="workspaceRoute(project.workspace.id)"
      >
        <WorkspaceAvatar
          :logo="project.workspace.logo"
          :default-logo-index="project.workspace.defaultLogoIndex"
          size="sm"
          class="mt-0.5"
        />
      </NuxtLink>
      <CommonTitleDescription
        :title="project.name"
        :description="project.description"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { graphql } from '~~/lib/common/generated/gql'
import type { ProjectPageProjectHeaderFragment } from '~~/lib/common/generated/gql/graphql'
import { projectRoute, projectsRoute } from '~~/lib/common/helpers/route'
import { workspaceRoute, workspacesRoute } from '~/lib/common/helpers/route'

graphql(`
  fragment ProjectPageProjectHeader on Project {
    id
    role
    name
    description
    visibility
    allowPublicComments
    workspace {
      id
      name
      ...WorkspaceAvatar_Workspace
    }
  }
`)

const isWorkspacesEnabled = useIsWorkspacesEnabled()

defineProps<{
  project: ProjectPageProjectHeaderFragment
}>()
</script>
