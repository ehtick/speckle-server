<template>
  <div>
    <Menu as="div" class="flex items-center">
      <MenuButton :id="menuButtonId" v-slot="{ open: userOpen }">
        <span class="sr-only">Open user menu</span>
        <div class="flex items-center gap-1 p-0.5 hover:bg-highlight-2 rounded">
          <UserAvatar :user="activeUser" />
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
          <div class="border-b border-outline-3 py-1 mb-1">
            <MenuItem v-slot="{ active }">
              <NuxtLink
                :class="[
                  active ? 'bg-highlight-1' : '',
                  'text-body-xs flex px-2 py-1 text-primary cursor-pointer transition mx-1 rounded'
                ]"
                target="_blank"
                external
                :href="connectorsPageUrl"
              >
                Connector downloads
              </NuxtLink>
            </MenuItem>
          </div>
          <MenuItem v-if="activeUser" v-slot="{ active }">
            <NuxtLink
              :class="[
                active ? 'bg-highlight-1' : '',
                'text-body-xs flex px-2 py-1 text-foreground cursor-pointer transition mx-1 rounded'
              ]"
              @click="toggleSettingsDialog(settingsQueries.user.profile)"
            >
              Settings
            </NuxtLink>
          </MenuItem>
          <MenuItem v-if="isAdmin" v-slot="{ active }">
            <NuxtLink
              :class="[
                active ? 'bg-highlight-1' : '',
                'text-body-xs flex px-2 py-1 text-foreground cursor-pointer transition mx-1 rounded'
              ]"
              @click="toggleSettingsDialog(settingsQueries.server.general)"
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
          <MenuItem v-slot="{ active }">
            <NuxtLink
              :class="[
                active ? 'bg-highlight-1' : '',
                'text-body-xs flex px-2 py-1 text-foreground cursor-pointer transition mx-1 rounded'
              ]"
              target="_blank"
              to="https://docs.google.com/forms/d/e/1FAIpQLSeTOU8i0KwpgBG7ONimsh4YMqvLKZfSRhWEOz4W0MyjQ1lfAQ/viewform"
              external
            >
              Feedback
            </NuxtLink>
          </MenuItem>
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
            <div v-if="version" class="border-t border-outline-3 py-1 mt-1">
              <MenuItem>
                <div class="px-3 pt-1 text-tiny text-foreground-2">
                  Version {{ version }}
                </div>
              </MenuItem>
            </div>
          </div>
        </MenuItems>
      </Transition>
    </Menu>
    <SettingsServerUserInviteDialog v-model:open="showInviteDialog" />
    <SettingsDialog
      v-model:open="showSettingsDialog"
      v-model:target-menu-item="settingsDialogTarget"
    />
  </div>
</template>
<script setup lang="ts">
import { isString } from 'lodash'
import { useBreakpoints } from '@vueuse/core'
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/vue'
import { ChevronDownIcon } from '@heroicons/vue/24/outline'
import { Roles } from '@speckle/shared'
import { TailwindBreakpoints } from '~~/lib/common/helpers/tailwind'
import { useActiveUser } from '~~/lib/auth/composables/activeUser'
import { useAuthManager } from '~~/lib/auth/composables/auth'
import { useTheme } from '~~/lib/core/composables/theme'
import { connectorsPageUrl, settingsQueries } from '~/lib/common/helpers/route'
import type { RouteLocationRaw } from 'vue-router'
import { ToastNotificationType, useGlobalToast } from '~~/lib/common/composables/toast'
import { useServerInfo } from '~/lib/core/composables/server'

defineProps<{
  loginUrl?: RouteLocationRaw
}>()

const route = useRoute()
const { logout } = useAuthManager()
const { activeUser, isGuest } = useActiveUser()
const { isDarkTheme, toggleTheme } = useTheme()
const router = useRouter()
const { triggerNotification } = useGlobalToast()
const { serverInfo } = useServerInfo()

const showInviteDialog = ref(false)
const showSettingsDialog = ref(false)
const settingsDialogTarget = ref<string | null>(null)
const menuButtonId = useId()
const breakpoints = useBreakpoints(TailwindBreakpoints)
const isMobile = breakpoints.smaller('md')

const version = computed(() => serverInfo.value?.version)
const isAdmin = computed(() => activeUser.value?.role === Roles.Server.Admin)

const toggleInviteDialog = () => {
  showInviteDialog.value = true
}

const toggleSettingsDialog = (target: string) => {
  showSettingsDialog.value = true

  // On mobile open the modal but dont set the target
  settingsDialogTarget.value = !isMobile.value ? target : null
}

const deleteSettingsQuery = (): void => {
  const currentQueryParams = { ...route.query }
  delete currentQueryParams.settings
  router.push({ query: currentQueryParams })
}

onMounted(() => {
  const settingsQuery = route.query?.settings

  if (settingsQuery && isString(settingsQuery)) {
    if (settingsQuery.includes('server') && !isAdmin.value) {
      triggerNotification({
        type: ToastNotificationType.Danger,
        title: "You don't have access to server settings"
      })

      return
    }

    showSettingsDialog.value = true
    settingsDialogTarget.value = settingsQuery
    deleteSettingsQuery()
  }
})
</script>
