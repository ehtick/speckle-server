<template>
  <div>
    <div
      class="flex flex-col space-y-2 lg:space-y-0 lg:flex-row lg:justify-between lg:items-center mb-4"
    >
      <div class="flex justify-between items-center flex-wrap sm:flex-nowrap">
        <h1 class="block h4 font-bold">Models</h1>
        <div class="flex items-center space-x-2 w-full mt-2 sm:w-auto sm:mt-0">
          <FormButton
            color="secondary"
            :to="allModelsRoute"
            class="grow inline-flex sm:grow-0 lg:hidden"
            @click="trackFederateAll"
          >
            View all in 3D
          </FormButton>
          <FormButton
            v-if="canContribute"
            class="grow inline-flex sm:grow-0 lg:hidden"
            :icon-left="PlusIcon"
            @click="showNewDialog = true"
          >
            New
          </FormButton>
        </div>
      </div>
      <div
        class="flex flex-col space-y-2 md:space-y-0 md:flex-row md:items-center md:space-x-2"
      >
        <FormTextInput
          v-model="localSearch"
          name="modelsearch"
          :show-label="false"
          placeholder="Search models..."
          color="foundation"
          wrapper-classes="grow lg:grow-0 lg:ml-2 lg:w-40 xl:w-60"
          :show-clear="localSearch !== ''"
          @change="($event) => updateSearchImmediately($event.value)"
          @update:model-value="updateDebouncedSearch"
        ></FormTextInput>
        <div
          class="flex flex-col space-y-2 sm:flex-row sm:items-center sm:space-x-2 sm:space-y-0"
        >
          <FormSelectUsers
            v-model="finalSelectedMembers"
            :users="team"
            multiple
            selector-placeholder="All members"
            label="Filter by members"
            class="grow shrink sm:w-[120px] md:w-44"
            clearable
            fixed-height
          />
          <div class="flex items-center space-x-2 grow">
            <FormSelectSourceApps
              v-model="finalSelectedApps"
              :items="availableSourceApps"
              multiple
              selector-placeholder="All sources"
              label="Filter by sources"
              class="grow shrink sm:w-[120px] md:w-44"
              clearable
              fixed-height
              :label-id="sourceAppsLabelId"
              :button-id="sourceAppsBtnId"
            />
            <LayoutGridListToggle v-model="finalGridOrList" class="shrink-0" />
          </div>
          <FormButton
            color="secondary"
            :to="allModelsRoute"
            class="hidden lg:inline-flex shrink-0"
            @click="trackFederateAll"
          >
            View all in 3D
          </FormButton>
          <FormButton
            v-if="canContribute"
            class="hidden lg:inline-flex shrink-0"
            :icon-left="PlusIcon"
            @click="showNewDialog = true"
          >
            New
          </FormButton>
        </div>
      </div>
    </div>
    <ProjectPageModelsNewDialog v-model:open="showNewDialog" :project-id="projectId" />
  </div>
</template>
<script setup lang="ts">
import { SourceApps, SpeckleViewer } from '@speckle/shared'
import type { SourceAppDefinition } from '@speckle/shared'
import { debounce } from 'lodash-es'
import { graphql } from '~~/lib/common/generated/gql'
import type {
  FormUsersSelectItemFragment,
  ProjectModelsPageHeader_ProjectFragment
} from '~~/lib/common/generated/gql/graphql'
import { modelRoute } from '~~/lib/common/helpers/route'
import type { GridListToggleValue } from '~~/lib/layout/helpers/components'
import { PlusIcon } from '@heroicons/vue/20/solid'
import { canModifyModels } from '~~/lib/projects/helpers/permissions'
import { useMixpanel } from '~~/lib/core/composables/mp'

const emit = defineEmits<{
  (e: 'update:selected-members', val: FormUsersSelectItemFragment[]): void
  (e: 'update:selected-apps', val: SourceAppDefinition[]): void
  (e: 'update:grid-or-list', val: GridListToggleValue): void
  (e: 'update:search', val: string): void
}>()

graphql(`
  fragment ProjectModelsPageHeader_Project on Project {
    id
    name
    sourceApps
    role
    team {
      id
      user {
        ...FormUsersSelectItem
      }
    }
  }
`)

const props = defineProps<{
  projectId: string
  project?: ProjectModelsPageHeader_ProjectFragment
  selectedMembers: FormUsersSelectItemFragment[]
  selectedApps: SourceAppDefinition[]
  search: string
  gridOrList: GridListToggleValue
  disabled?: boolean
}>()

const localSearch = ref('')
const sourceAppsLabelId = useId()
const sourceAppsBtnId = useId()

const mp = useMixpanel()
const trackFederateAll = () =>
  mp.track('Viewer Action', {
    type: 'action',
    name: 'federation',
    action: 'view-all',
    source: 'project page'
  })

const canContribute = computed(() =>
  props.project ? canModifyModels(props.project) : false
)
const showNewDialog = ref(false)

const debouncedSearch = computed({
  get: () => props.search,
  set: (newVal) => emit('update:search', newVal)
})
const finalSelectedMembers = computed({
  get: () => props.selectedMembers,
  set: (newVal) => emit('update:selected-members', newVal)
})
const finalSelectedApps = computed({
  get: () => props.selectedApps,
  set: (newVal) => emit('update:selected-apps', newVal)
})
const finalGridOrList = computed({
  get: () => props.gridOrList,
  set: (newVal) => emit('update:grid-or-list', newVal)
})

const availableSourceApps = computed((): SourceAppDefinition[] =>
  props.project
    ? SourceApps.filter((a) =>
        props.project!.sourceApps.find((pa) => pa.toLowerCase().includes(a.searchKey))
      )
    : []
)

const allModelsRoute = computed(() => {
  const resourceIdString = SpeckleViewer.ViewerRoute.resourceBuilder()
    .addAllModels()
    .toString()
  return modelRoute(props.projectId, resourceIdString)
})

const team = computed(() => props.project?.team.map((t) => t.user) || [])

const updateDebouncedSearch = debounce(() => {
  debouncedSearch.value = localSearch.value.trim()
}, 500)

const updateSearchImmediately = (val?: string) => {
  updateDebouncedSearch.cancel()
  debouncedSearch.value = (val ?? localSearch.value).trim()
}

watch(debouncedSearch, (newVal) => {
  if (newVal !== localSearch.value) {
    localSearch.value = newVal
  }
})
</script>
