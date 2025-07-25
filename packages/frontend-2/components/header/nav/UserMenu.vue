<template>
  <div>
    <Menu as="div" class="flex items-center">
      <MenuButton :id="menuButtonId" v-slot="{ open: userOpen }">
        <span class="sr-only">Open user menu</span>
        <div class="flex items-center gap-1 p-0.5 hover:bg-highlight-2 rounded">
          <UserAvatar hide-tooltip :user="activeUser" />
          <ChevronDownIcon :class="userOpen ? 'rotate-180' : ''" class="h-3 w-3" />
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
          class="absolute right-4 top-14 w-56 origin-top-right bg-foundation outline outline-1 outline-primary-muted rounded-md shadow-lg overflow-hidden"
        >
          <div class="pt-1">
            <MenuItem v-if="activeUser" v-slot="{ active }">
              <NuxtLink
                :to="settingsUserRoutes.profile"
                :class="[
                  active ? 'bg-highlight-1' : '',
                  'text-body-xs flex px-2 py-1 text-foreground cursor-pointer transition mx-1 rounded'
                ]"
              >
                Settings
              </NuxtLink>
            </MenuItem>
            <MenuItem v-if="isAdmin" v-slot="{ active }">
              <NuxtLink
                :to="settingsServerRoutes.general"
                :class="[
                  active ? 'bg-highlight-1' : '',
                  'text-body-xs flex px-2 py-1 text-foreground cursor-pointer transition mx-1 rounded'
                ]"
              >
                Server settings
              </NuxtLink>
            </MenuItem>
            <MenuItem v-slot="{ active }">
              <NuxtLink
                :class="[
                  active ? 'bg-highlight-1' : '',
                  'text-body-xs flex px-2 py-1 text-foreground cursor-pointer transition mx-1 rounded'
                ]"
                @click="toggleTheme"
              >
                {{ isDarkTheme ? 'Light mode' : 'Dark mode' }}
              </NuxtLink>
            </MenuItem>
            <MenuItem v-if="activeUser && !isGuest" v-slot="{ active }">
              <NuxtLink
                :class="[
                  active ? 'bg-highlight-1' : '',
                  'text-body-xs flex px-2 py-1 text-foreground cursor-pointer transition mx-1 rounded'
                ]"
                @click="toggleInviteDialog"
              >
                Invite to Speckle
              </NuxtLink>
            </MenuItem>
          </div>
          <div class="border-t border-outline-3 py-1 mt-1">
            <MenuItem v-if="activeUser" v-slot="{ active }">
              <NuxtLink
                :class="[
                  active ? 'bg-highlight-1' : '',
                  'text-body-xs flex px-2 py-1 text-foreground cursor-pointer transition mx-1 rounded'
                ]"
                @click="logout"
              >
                Log out
              </NuxtLink>
            </MenuItem>
            <MenuItem v-if="!activeUser && loginUrl" v-slot="{ active }">
              <NuxtLink
                :class="[
                  active ? 'bg-highlight-1' : '',
                  'flex px-2 py-1 text-body-xs text-foreground cursor-pointer transition mx-1 rounded'
                ]"
                :to="loginUrl"
              >
                Log in
              </NuxtLink>
            </MenuItem>

            <div
              class="border-t border-outline-3 py-1 mt-1 text-xs text-foreground-2 px-3 gap-1 flex flex-col"
            >
              <MenuItem v-if="version">
                <div>Version {{ version }}</div>
              </MenuItem>
              <MenuItem>
                <NuxtLink
                  class="cursor-pointer text-foreground-2 hover:text-foreground"
                  @click="copySupportReference"
                >
                  Copy support reference
                </NuxtLink>
              </MenuItem>
            </div>
          </div>
        </MenuItems>
      </Transition>
    </Menu>
    <InviteDialogServer v-model:open="showInviteDialog" />
  </div>
</template>
<script setup lang="ts">
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/vue'
import { ChevronDownIcon } from '@heroicons/vue/24/outline'
import { Roles } from '@speckle/shared'
import { useActiveUser } from '~~/lib/auth/composables/activeUser'
import { useAuthManager } from '~~/lib/auth/composables/auth'
import { useTheme } from '~~/lib/core/composables/theme'
import { settingsUserRoutes, settingsServerRoutes } from '~/lib/common/helpers/route'
import type { RouteLocationRaw } from 'vue-router'
import { useServerInfo } from '~/lib/core/composables/server'
import { useGenerateErrorReference } from '~/lib/core/composables/error'

defineProps<{
  loginUrl?: RouteLocationRaw
}>()

const { logout } = useAuthManager()
const { activeUser, isGuest } = useActiveUser()
const { isDarkTheme, toggleTheme } = useTheme()
const { serverInfo } = useServerInfo()
const menuButtonId = useId()
const { copyReference } = useGenerateErrorReference()

const showInviteDialog = ref(false)

const version = computed(() => serverInfo.value?.version)
const isAdmin = computed(() => activeUser.value?.role === Roles.Server.Admin)

const toggleInviteDialog = () => {
  showInviteDialog.value = true
}

const copySupportReference = async () => {
  await copyReference()
}
</script>
