<template>
  <div>
    <Menu as="div" class="flex items-center">
      <MenuButton :id="menuButtonId" v-slot="{ open: userOpen }">
        <span class="sr-only">Open workspace menu</span>
        <div class="flex items-center gap-2 p-0.5 pr-1.5 hover:bg-highlight-2 rounded">
          <template v-if="activeWorkspaceSlug || isProjectsActive">
            <div class="relative">
              <WorkspaceAvatar :name="displayName" :logo="displayLogo" />
              <div
                v-if="hasDiscoverableWorkspaces"
                class="absolute -top-[4px] -right-[4px] size-3 border-[2px] border-foundation-page bg-primary rounded-full"
              />
            </div>
            <p class="text-body-xs text-foreground truncate max-w-40">
              {{ displayName }}
            </p>
          </template>
          <HeaderLogoBlock v-else no-link />
          <ChevronDownIcon
            :class="userOpen ? 'rotate-180' : ''"
            class="h-3 w-3 flex-shrink-0"
          />
        </div>
      </MenuButton>
      <Transition
        enter-active-class="transition ease-out duration-200"
        enter-from-class="transform opacity-0 scale-95"
        enter-to-class="transform opacity-100 scale-100"
        leave-active-class="transition ease-in duration-75"
        leave-from-class="transform opacity-100 scale-100"
        leave-to-class="transform opacity-0 scale-95"
      >
        <MenuItems
          class="absolute left-4 top-14 w-64 origin-top-right bg-foundation outline outline-1 outline-primary-muted rounded-md shadow-lg overflow-hidden divide-y divide-outline-2"
        >
          <div
            v-if="activeWorkspaceSlug || isProjectsActive"
            class="p-2 pb-3 flex flex-col gap-y-4"
          >
            <div class="flex gap-x-2 items-center">
              <MenuItem>
                <NuxtLink
                  :to="
                    activeWorkspaceSlug
                      ? workspaceRoute(activeWorkspaceSlug)
                      : projectsRoute
                  "
                >
                  <WorkspaceAvatar
                    :name="displayName"
                    :logo="displayLogo"
                    size="lg"
                    class="flex-shrink-0"
                  />
                </NuxtLink>
              </MenuItem>
              <div class="flex flex-col space-between min-w-0">
                <p class="text-body-xs text-foreground truncate">
                  {{ displayName }}
                </p>
                <p
                  v-if="activeWorkspace"
                  class="text-body-2xs text-foreground-2 capitalize truncate"
                >
                  {{ activeWorkspace?.plan?.name }} ·
                  {{ activeWorkspace?.team?.totalCount }} member{{
                    activeWorkspace?.team?.totalCount > 1 ? 's' : ''
                  }}
                </p>
                <p v-else class="text-body-2xs text-foreground-2 truncate">
                  2 projects to move
                </p>
              </div>
            </div>
            <div v-if="activeWorkspaceSlug" class="flex gap-x-2">
              <MenuItem>
                <FormButton
                  color="outline"
                  full-width
                  size="sm"
                  @click="goToSettingsRoute"
                >
                  Settings
                </FormButton>
              </MenuItem>
              <MenuItem>
                <FormButton
                  full-width
                  color="outline"
                  size="sm"
                  :disabled="activeWorkspace?.role !== Roles.Workspace.Admin"
                  @click="showInviteDialog = true"
                >
                  Invite members
                </FormButton>
              </MenuItem>
            </div>
          </div>
          <div class="p-2 pt-1 max-h-96 overflow-y-auto simple-scrollbar">
            <LayoutSidebarMenuGroup
              title="Workspaces"
              :icon-click="isGuest ? undefined : handlePlusClick"
              icon-text="Create workspace"
            >
              <div v-if="hasWorkspaces" class="w-full">
                <template v-for="item in workspaces" :key="`menu-item-${item.id}`">
                  <DashboardSidebarWorkspaceItem
                    :is-active="item.slug === activeWorkspaceSlug"
                    :name="item.name"
                    :logo="item.logo"
                    @on-click="onWorkspaceSelect(item.slug)"
                  />
                </template>
                <DashboardSidebarWorkspaceItem
                  :is-active="route.path === projectsRoute"
                  name="Personal projects"
                  tag="LEGACY"
                  @on-click="onProjectsSelect"
                />
              </div>
            </LayoutSidebarMenuGroup>
          </div>
          <MenuItem v-if="hasDiscoverableWorkspacesOrJoinRequests">
            <div class="p-2">
              <NuxtLink
                class="flex justify-between items-center cursor-pointer hover:bg-highlight-1 py-1 px-2 rounded"
                @click="showDiscoverableWorkspacesModal = true"
              >
                <p class="text-body-xs text-foreground">Join existing workspaces</p>
                <CommonBadge v-if="hasDiscoverableWorkspaces" rounded>
                  {{ discoverableWorkspacesCount }}
                </CommonBadge>
              </NuxtLink>
            </div>
          </MenuItem>
        </MenuItems>
      </Transition>
    </Menu>

    <InviteDialogWorkspace
      v-model:open="showInviteDialog"
      :workspace="activeWorkspace"
    />

    <WorkspaceDiscoverableWorkspacesModal
      v-model:open="showDiscoverableWorkspacesModal"
    />
  </div>
</template>
<script setup lang="ts">
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/vue'
import { ChevronDownIcon } from '@heroicons/vue/24/outline'
import { useActiveUser } from '~~/lib/auth/composables/activeUser'
import {
  workspaceCreateRoute,
  workspaceRoute,
  settingsWorkspaceRoutes,
  projectsRoute
} from '~/lib/common/helpers/route'
import { useMixpanel } from '~~/lib/core/composables/mp'
import { useUserWorkspaces } from '~/lib/user/composables/workspaces'
import { useDiscoverableWorkspaces } from '~/lib/workspaces/composables/discoverableWorkspaces'
import { graphql } from '~/lib/common/generated/gql'
import { useNavigation } from '~~/lib/navigation/composables/navigation'
import { Roles } from '@speckle/shared'

graphql(`
  fragment HeaderWorkspaceSwitcher_Workspace on Workspace {
    ...InviteDialogWorkspace_Workspace
    id
    name
    logo
    role
    plan {
      name
    }
    team {
      totalCount
    }
  }
`)

const { isGuest } = useActiveUser()
const menuButtonId = useId()
const mixpanel = useMixpanel()
const {
  activeWorkspaceSlug,
  isProjectsActive,
  mutateActiveWorkspaceSlug,
  mutateIsProjectsActive,
  workspaceData
} = useNavigation()

const showInviteDialog = ref(false)
const showDiscoverableWorkspacesModal = ref(false)

const activeWorkspace = computed(() => {
  return workspaceData.value
})

const displayName = computed(() => activeWorkspace.value?.name || 'Personal projects')

const displayLogo = computed(() => {
  if (isProjectsActive.value) return null
  return activeWorkspace.value?.logo
})

const route = useRoute()
const { workspaces, hasWorkspaces } = useUserWorkspaces()
const {
  hasDiscoverableWorkspaces,
  discoverableWorkspacesCount,
  hasDiscoverableWorkspacesOrJoinRequests
} = useDiscoverableWorkspaces()

const onWorkspaceSelect = (slug: string) => {
  navigateTo(workspaceRoute(slug))
  mutateActiveWorkspaceSlug(slug)
}

const onProjectsSelect = () => {
  mutateIsProjectsActive(true)
  navigateTo(projectsRoute)
}

const goToSettingsRoute = () => {
  if (!activeWorkspaceSlug.value) return
  navigateTo(settingsWorkspaceRoutes.general.route(activeWorkspaceSlug.value))
}

const handlePlusClick = () => {
  navigateTo(workspaceCreateRoute())
  mixpanel.track('Create Workspace Button Clicked', {
    source: 'navigation'
  })
}
</script>
