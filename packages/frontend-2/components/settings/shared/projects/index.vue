<template>
  <div>
    <div class="flex flex-col-reverse md:justify-between md:flex-row md:gap-x-4">
      <div class="relative w-full md:max-w-md mt-6 md:mt-0">
        <FormTextInput
          name="search"
          :custom-icon="MagnifyingGlassIcon"
          color="foundation"
          search
          placeholder="Search projects"
          v-bind="bind"
          v-on="on"
        />
      </div>
      <FormButton @click="openNewProject = true">Create</FormButton>
    </div>

    <LayoutTable
      class="mt-6 md:mt-8"
      :columns="[
        { id: 'name', header: 'Name', classes: 'col-span-3 truncate' },
        { id: 'type', header: 'Type', classes: 'col-span-1' },
        { id: 'created', header: 'Created', classes: 'col-span-2' },
        { id: 'modified', header: 'Modified', classes: 'col-span-2' },
        { id: 'models', header: 'Models', classes: 'col-span-1' },
        { id: 'versions', header: 'Versions', classes: 'col-span-1' },
        { id: 'contributors', header: 'Contributors', classes: 'col-span-2' }
      ]"
      :items="projects"
      :buttons="[{ icon: TrashIcon, label: 'Delete', action: openProjectDeleteDialog }]"
      :on-row-click="handleProjectClick"
    >
      <template #name="{ item }">
        {{ isProject(item) ? item.name : '' }}
      </template>

      <template #type="{ item }">
        <div class="capitalize">
          {{ isProject(item) ? item.visibility.toLowerCase() : '' }}
        </div>
      </template>

      <template #created="{ item }">
        <div class="text-xs">
          {{ formattedFullDate(item.createdAt) }}
        </div>
      </template>

      <template #modified="{ item }">
        <div class="text-xs">
          {{ formattedFullDate(item.updatedAt) }}
        </div>
      </template>

      <template #models="{ item }">
        <div class="text-xs">
          {{ isProject(item) ? item.models.totalCount : '' }}
        </div>
      </template>

      <template #versions="{ item }">
        <div class="text-xs">
          {{ isProject(item) ? item.versions.totalCount : '' }}
        </div>
      </template>

      <template #contributors="{ item }">
        <div v-if="isProject(item)" class="py-1">
          <UserAvatarGroup :users="item.team.map((t) => t.user)" :max-count="3" />
        </div>
      </template>
    </LayoutTable>

    <SettingsSharedProjectsDeleteDialog
      v-model:open="showProjectDeleteDialog"
      :project="projectToModify"
    />

    <ProjectsAddDialog v-model:open="openNewProject" :workspace-id="workspaceId" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { ItemType, ProjectItem } from '~~/lib/server-management/helpers/types'
import type { SettingsSharedProjects_ProjectFragment } from '~~/lib/common/generated/gql/graphql'
import { MagnifyingGlassIcon, TrashIcon } from '@heroicons/vue/24/outline'
import { isProject } from '~~/lib/server-management/helpers/utils'
import { useDebouncedTextInput } from '@speckle/ui-components'
import { graphql } from '~/lib/common/generated/gql'

graphql(`
  fragment SettingsSharedProjects_Project on Project {
    id
    name
    visibility
    createdAt
    updatedAt
    models {
      totalCount
    }
    versions {
      totalCount
    }
    team {
      id
      user {
        name
        id
        avatar
      }
    }
  }
`)

defineProps<{
  projects?: SettingsSharedProjects_ProjectFragment[]
  workspaceId?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const search = defineModel<string>('search')
const { on, bind } = useDebouncedTextInput({ model: search })
const router = useRouter()

const projectToModify = ref<ProjectItem | null>(null)
const showProjectDeleteDialog = ref(false)
const openNewProject = ref(false)

const openProjectDeleteDialog = (item: ItemType) => {
  if (isProject(item)) {
    projectToModify.value = item
    showProjectDeleteDialog.value = true
  }
}

const handleProjectClick = (item: ItemType) => {
  router.push(`/projects/${item.id}`)
  emit('close')
}
</script>
