<template>
  <section class="flex flex-col border-t border-outline-2 py-8">
    <SettingsSectionHeader subheading title="Single Sign-On" />
    <p class="text-body-xs text-foreground-2 mt-2 mb-6">
      Use a third-party identity provider to authenticate users.
    </p>

    <div class="flex items-center">
      <div class="flex-1 flex-col pr-6 gap-y-1">
        <p class="text-body-xs font-medium text-foreground">Enable SSO</p>
        <p class="text-body-2xs text-foreground-2 leading-5 max-w-md mt-1">
          Allow logins through your OpenID identity provider
        </p>
      </div>
      <div>
        <div v-if="workspace.hasAccessToSSO">
          <FormSwitch
            v-if="isWorkspaceAdmin"
            v-model="isSsoEnabled"
            name="sso-configuration"
            :show-label="false"
            :disabled="loading"
            @update:model-value="handleSsoToggle"
          />

          <div v-else v-tippy="`You must be a workspace admin`">
            <FormSwitch disabled name="sso-configuration" :show-label="false" />
          </div>
        </div>

        <FormButton
          v-else
          size="sm"
          color="outline"
          :to="settingsWorkspaceRoutes.billing.route(workspace.slug)"
        >
          Upgrade to Business
        </FormButton>
      </div>
    </div>

    <div v-if="loading" class="flex justify-center">
      <CommonLoadingIcon />
    </div>

    <template v-else>
      <!-- Existing Provider Configuration -->
      <div v-if="provider" class="p-4 border border-outline-3 rounded-lg mt-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <h3 class="text-body-xs font-medium text-foreground">
              {{ provider.name }}
            </h3>
            <CommonBadge
              dot
              color-classes="bg-highlight-3 text-foreground-2"
              :dot-icon-color-classes="
                isSsoAuthenticated ? 'text-green-500' : 'text-danger'
              "
            >
              {{ isSsoAuthenticated ? 'Authenticated via SSO' : 'SSO login required' }}
            </CommonBadge>
          </div>
          <LayoutMenu
            v-model:open="showActionsMenu"
            :menu-id="menuId"
            :items="actionsItems"
            :menu-position="HorizontalDirection.Left"
            @chosen="onActionChosen"
          >
            <FormButton
              color="subtle"
              hide-text
              :icon-right="EllipsisHorizontalIcon"
              class="!text-foreground-2"
              @click="onButtonClick"
            />
          </LayoutMenu>
        </div>
      </div>

      <!-- Configuration Instructions -->
      <div
        v-if="isFormVisible && !provider"
        class="py-6 px-8 border border-outline-3 rounded-lg mt-4"
      >
        <p class="text-body-xs mb-4">
          To set up SSO, create a new web application using the OpenID Connect protocol
          in your identity provider's panel, which will contain the necessary settings
          for Speckle. When asked about
          <span class="font-bold">Redirect URL</span>
          (callback) please use:
        </p>
        <div class="mb-4">
          <CommonClipboardInputWithToast is-multiline :value="redirectUrl" />
        </div>

        <p class="text-body-xs mb-4">
          The application grant type should be set to "authorization_code." Below is a
          list of supported scopes and claims to configure in the application:
        </p>
        <div
          class="mb-8 bg-foundation border border-outline-3 rounded-lg p-4 text-body-xs"
        >
          <div class="grid grid-cols-3 gap-y-1.5">
            <div class="col-span-1 font-medium">Scope</div>
            <div class="col-span-2 font-medium">Resultant claims</div>

            <template v-for="(claims, scope) in scopesAndClaims" :key="scope">
              <div class="col-span-1">{{ scope }}</div>
              <div class="col-span-2">{{ claims }}</div>
            </template>
          </div>
        </div>

        <SettingsWorkspacesSecuritySsoForm
          :workspace-slug="workspace.slug"
          :provider-info="errorProviderInfo"
          @cancel="handleCancel"
          @submit="handleFormSubmit"
        />
      </div>
    </template>
    <SettingsWorkspacesSecuritySsoDeleteDialog
      v-if="provider"
      v-model:open="isDeleteDialogOpen"
      :provider-name="provider?.name"
      :workspace-id="workspace.id"
    />
  </section>
</template>

<script setup lang="ts">
import type { SettingsWorkspacesSecuritySsoWrapper_WorkspaceFragment } from '~~/lib/common/generated/gql/graphql'
import { useWorkspaceSsoStatus } from '~/lib/workspaces/composables/sso'
import type { SsoFormValues } from '~/lib/workspaces/helpers/types'
import type { LayoutMenuItem } from '@speckle/ui-components'
import { HorizontalDirection } from '~~/lib/common/composables/window'
import { EllipsisHorizontalIcon } from '@heroicons/vue/24/solid'
import { graphql } from '~/lib/common/generated/gql'
import { Roles } from '@speckle/shared'
import { settingsWorkspaceRoutes } from '~/lib/common/helpers/route'

graphql(`
  fragment SettingsWorkspacesSecuritySsoWrapper_Workspace on Workspace {
    id
    role
    slug
    sso {
      provider {
        id
        name
        clientId
        issuerUrl
      }
    }
    hasAccessToSSO: hasAccessToFeature(featureName: oidcSso)
  }
`)

const props = defineProps<{
  workspace: SettingsWorkspacesSecuritySsoWrapper_WorkspaceFragment
}>()

enum ActionTypes {
  Delete = 'delete'
}

const route = useRoute()
const apiOrigin = useApiOrigin()
const logger = useLogger()
const menuId = useId()
const { provider, loading, isSsoAuthenticated } = useWorkspaceSsoStatus({
  workspaceSlug: computed(() => props.workspace.slug)
})

const isFormVisible = ref(false)
const showActionsMenu = ref(false)
const isDeleteDialogOpen = ref(false)

const scopesAndClaims = ref({
  openid: '-',
  profile: 'name, given_name, family_name',
  email: 'email'
})

const isWorkspaceAdmin = computed(() => props.workspace?.role === Roles.Workspace.Admin)

// Shows as enabled if there's a provider OR if user is actively configuring (form is visible)
const isSsoEnabled = computed({
  get: () => !!provider.value || isFormVisible.value,
  set: (value: boolean) => {
    if (value) {
      isFormVisible.value = true
    } else {
      if (provider.value) {
        isDeleteDialogOpen.value = true
      } else {
        isFormVisible.value = false
        errorProviderInfo.value = undefined
      }
    }
  }
})

const actionsItems = computed<LayoutMenuItem[][]>(() => [
  [
    {
      title: 'Remove provider...',
      id: ActionTypes.Delete,
      disabled: !isWorkspaceAdmin.value,
      disabledTooltip: 'You must be a workspace admin'
    }
  ]
])

const onActionChosen = (params: { item: LayoutMenuItem; event: MouseEvent }) => {
  const { item } = params

  switch (item.id) {
    case ActionTypes.Delete:
      isDeleteDialogOpen.value = true
      break
  }
}

const onButtonClick = () => {
  showActionsMenu.value = !showActionsMenu.value
}

const handleSsoToggle = (enabled: boolean) => {
  if (enabled) {
    isFormVisible.value = true
    errorProviderInfo.value = undefined
  } else {
    if (provider.value) {
      isDeleteDialogOpen.value = true
    } else {
      isFormVisible.value = false
      errorProviderInfo.value = undefined
    }
  }
}

const handleFormSubmit = (data: SsoFormValues) => {
  logger.info('Form submitted:', data)
  isFormVisible.value = false
  errorProviderInfo.value = undefined
}

const handleCancel = () => {
  isFormVisible.value = false
  errorProviderInfo.value = undefined
}

const redirectUrl = computed(() => {
  return `${apiOrigin}/api/v1/workspaces/${props.workspace.slug}/sso/oidc/callback`
})

const errorProviderInfo = ref<
  | {
      providerName: string
      clientId: string
      issuerUrl: string
    }
  | undefined
>(undefined)

const router = useRouter()
const { triggerNotification } = useGlobalToast()

onMounted(() => {
  const providerName = route.query?.providerName as string
  const clientId = route.query?.clientId as string
  const issuerUrl = route.query?.issuerUrl as string
  const ssoError = route.query?.ssoError as string
  const ssoValidationSuccess = route.query?.ssoValidationSuccess

  // Handle error notifications
  if (ssoValidationSuccess === 'true') {
    triggerNotification({
      type: ToastNotificationType.Success,
      title: 'SSO Configuration Successful',
      description: 'Your SSO settings have been successfully configured.'
    })
    isFormVisible.value = false
    errorProviderInfo.value = undefined
  } else if (ssoValidationSuccess === 'false' || ssoError) {
    triggerNotification({
      type: ToastNotificationType.Danger,
      title: 'SSO Configuration Error',
      description: ssoError
        ? decodeURIComponent(ssoError)
        : 'SSO settings validation failed'
    })
  }

  // Handle provider info if present
  if (providerName && clientId && issuerUrl) {
    errorProviderInfo.value = {
      providerName,
      clientId,
      issuerUrl
    }
    isFormVisible.value = true
  }

  // Clean up URL params
  router.replace({
    query: {
      ...route.query,
      ssoError: undefined,
      providerName: undefined,
      clientId: undefined,
      issuerUrl: undefined,
      ssoValidationSuccess: undefined
    }
  })
})
</script>
