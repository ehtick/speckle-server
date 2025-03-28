<template>
  <div>
    <SettingsWorkspacesMembersTableHeader
      v-model:search="search"
      search-placeholder="Search guests..."
      :workspace="workspace"
      show-invite-button
    />
    <LayoutTable
      class="mt-6 md:mt-8"
      :columns="[
        { id: 'name', header: 'Name', classes: 'col-span-3' },
        { id: 'company', header: 'Company', classes: 'col-span-3' },
        { id: 'projects', header: 'Projects', classes: 'col-span-2' },
        { id: 'actions', header: '', classes: 'col-span-4 flex justify-end' }
      ]"
      :items="guests"
      :loading="searchResultLoading"
      :empty-message="
        search.length
          ? `No guests found for '${search}'`
          : 'This workspace has no guests'
      "
    >
      <template #name="{ item }">
        <div class="flex items-center gap-2">
          <UserAvatar hide-tooltip :user="item.user" />
          <span class="truncate text-body-xs text-foreground">
            {{ item.user.name }}
          </span>
        </div>
      </template>
      <template #company="{ item }">
        <span class="text-body-xs text-foreground">
          {{ item.user.company ? item.user.company : '-' }}
        </span>
      </template>
      <template #projects="{ item }">
        <span class="text-body-xs text-foreground-2">
          <CommonBadge color-classes="bg-foundation-2 text-foreground-2" rounded>
            {{ item.projectRoles.length }} project{{
              item.projectRoles.length !== 1 ? 's' : ''
            }}
          </CommonBadge>
        </span>
      </template>
      <template #actions="{ item }">
        <LayoutMenu
          v-if="isWorkspaceAdmin"
          v-model:open="showActionsMenu[item.id]"
          :items="actionItems"
          size="lg"
          mount-menu-on-body
          :menu-position="HorizontalDirection.Left"
          @chosen="({ item: actionItem }) => onActionChosen(actionItem, item)"
        >
          <FormButton
            :color="showActionsMenu[item.id] ? 'outline' : 'subtle'"
            hide-text
            :icon-right="showActionsMenu[item.id] ? XMarkIcon : EllipsisHorizontalIcon"
            @click="toggleMenu(item.id)"
          />
        </LayoutMenu>
        <span v-else />
      </template>
    </LayoutTable>

    <SettingsSharedDeleteUserDialog
      v-model:open="showDeleteUserRoleDialog"
      title="Remove guest"
      :name="userToModify?.user.name ?? ''"
      :workspace="workspace"
      @remove-user="onRemoveUser"
    />

    <SettingsWorkspacesMembersGuestsPermissionsDialog
      v-if="userToModify"
      v-model:open="showGuestsPermissionsDialog"
      :user="userToModify"
      :workspace-id="workspace?.id"
    />

    <SettingsWorkspacesMembersChangeRoleDialog
      v-model:open="showChangeUserRoleDialog"
      :workspace-domain-policy-compliant="
        userToModify?.user.workspaceDomainPolicyCompliant
      "
      :current-role="Roles.Workspace.Guest"
      :workspace="workspace"
      @update-role="onUpdateRole"
    />
  </div>
</template>

<script setup lang="ts">
import type {
  SettingsWorkspacesMembersGuestsTable_WorkspaceFragment,
  WorkspaceCollaborator
} from '~/lib/common/generated/gql/graphql'
import { graphql } from '~/lib/common/generated/gql'
import { Roles, type WorkspaceRoles, type MaybeNullOrUndefined } from '@speckle/shared'
import { settingsWorkspacesMembersSearchQuery } from '~~/lib/settings/graphql/queries'
import { useQuery } from '@vue/apollo-composable'
import { useWorkspaceUpdateRole } from '~/lib/workspaces/composables/management'
import { HorizontalDirection } from '~~/lib/common/composables/window'
import type { LayoutMenuItem } from '~~/lib/layout/helpers/components'
import { EllipsisHorizontalIcon, XMarkIcon } from '@heroicons/vue/24/outline'

graphql(`
  fragment SettingsWorkspacesMembersGuestsTable_WorkspaceCollaborator on WorkspaceCollaborator {
    id
    role
    user {
      id
      avatar
      name
      company
    }
    projectRoles {
      role
      project {
        id
        name
      }
    }
  }
`)

graphql(`
  fragment SettingsWorkspacesMembersGuestsTable_Workspace on Workspace {
    id
    ...SettingsWorkspacesMembersTableHeader_Workspace
    ...SettingsSharedDeleteUserDialog_Workspace
    ...SettingsWorkspacesMembersChangeRoleDialog_Workspace
    team(limit: 250) {
      items {
        id
        ...SettingsWorkspacesMembersGuestsTable_WorkspaceCollaborator
      }
    }
  }
`)

enum ActionTypes {
  ChangeProjectPermissions = 'change-project-permissions',
  RemoveMember = 'remove-member',
  ChangeRole = 'change-role'
}

const props = defineProps<{
  workspace: MaybeNullOrUndefined<SettingsWorkspacesMembersGuestsTable_WorkspaceFragment>
  workspaceSlug: string
}>()

const updateUserRole = useWorkspaceUpdateRole()

const search = ref('')
const showActionsMenu = ref<Record<string, boolean>>({})
const showDeleteUserRoleDialog = ref(false)
const showGuestsPermissionsDialog = ref(false)
const userIdToModify = ref<string | null>(null)
const showChangeUserRoleDialog = ref(false)

const userToModify = computed(
  () => guests.value.find((guest) => guest.id === userIdToModify.value) || null
)

const { result: searchResult, loading: searchResultLoading } = useQuery(
  settingsWorkspacesMembersSearchQuery,
  () => ({
    filter: {
      search: search.value,
      roles: [Roles.Workspace.Guest]
    },
    slug: props.workspaceSlug
  }),
  () => ({
    enabled: !!search.value.length
  })
)

const guests = computed(() => {
  const guestArray = search.value.length
    ? searchResult.value?.workspaceBySlug?.team.items
    : props.workspace?.team.items

  return (guestArray || []).filter(
    (item): item is WorkspaceCollaborator => item.role === Roles.Workspace.Guest
  )
})

const isWorkspaceAdmin = computed(() => props.workspace?.role === Roles.Workspace.Admin)

const actionItems = computed(() => {
  const items: LayoutMenuItem[][] = [
    [{ title: 'Remove guest...', id: ActionTypes.RemoveMember }]
  ]

  if (isWorkspaceAdmin.value) {
    items.unshift([{ title: 'Change role...', id: ActionTypes.ChangeRole }])
  }

  if (guests.value.find((guest) => guest.projectRoles.length)) {
    items.unshift([
      {
        title: 'Change project permissions...',
        id: ActionTypes.ChangeProjectPermissions
      }
    ])
  }

  return items
})

const onActionChosen = (actionItem: LayoutMenuItem, user: WorkspaceCollaborator) => {
  userIdToModify.value = user.id

  if (actionItem.id === ActionTypes.ChangeProjectPermissions) {
    showGuestsPermissionsDialog.value = true
  }
  if (actionItem.id === ActionTypes.ChangeRole) {
    showChangeUserRoleDialog.value = true
  }
  if (actionItem.id === ActionTypes.RemoveMember) {
    showDeleteUserRoleDialog.value = true
  }
}

const onRemoveUser = async () => {
  if (!userIdToModify.value || !props.workspace?.id) return

  await updateUserRole({
    userId: userIdToModify.value,
    role: null,
    workspaceId: props.workspace.id
  })
}

const toggleMenu = (itemId: string) => {
  showActionsMenu.value[itemId] = !showActionsMenu.value[itemId]
}

const onUpdateRole = async (newRoleValue: WorkspaceRoles) => {
  if (!userToModify.value || !newRoleValue || !props.workspace?.id) return

  await updateUserRole({
    userId: userToModify.value.id,
    role: newRoleValue,
    workspaceId: props.workspace.id
  })
}
</script>
