import { useOnAuthStateChange } from '~/lib/auth/composables/auth'
import { useActiveUser } from '~~/lib/auth/composables/activeUser'
import { md5 } from '~/lib/common/helpers/encodeDecode'
import { useTheme } from '~~/lib/core/composables/theme'

const HOST_APP = 'web-2'
const HOST_APP_DISPLAY_NAME = 'Web 2.0 App'

/**
 * Get mixpanel server identifier
 */
function getMixpanelServerId(): string {
  return md5(window.location.hostname.toLowerCase()).toUpperCase()
}

/**
 * Get Mixpanel instance
 * Note: Mixpanel is not available during SSR because mixpanel-browser only works in the browser!
 */
export function useMixpanel() {
  const nuxt = useNuxtApp()
  const $mixpanel = nuxt.$mixpanel
  return $mixpanel()
}

/**
 * Composable that builds the user (re-)identification function. Needs to be invoked on app
 * init and when the active user changes (e.g. after signing out/in)
 * Note: The returned function will only work on the client-side
 */
export function useMixpanelUserIdentification() {
  if (import.meta.server) return { reidentify: () => void 0 }

  const mp = useMixpanel()
  const { distinctId } = useActiveUser()
  const { isDarkTheme } = useTheme()
  const serverId = getMixpanelServerId()
  const {
    public: { speckleServerVersion }
  } = useRuntimeConfig()

  return {
    reidentify: () => {
      // Reset previous user data, if any
      mp.reset()

      // Register session
      mp.register({
        // eslint-disable-next-line camelcase
        server_id: serverId,
        hostApp: HOST_APP,
        speckleVersion: speckleServerVersion
      })

      // Identify user, if any
      if (distinctId.value) {
        mp.identify(distinctId.value)
        mp.people.set('Identified', true)
        mp.people.set('Theme Web', isDarkTheme.value ? 'dark' : 'light')
        mp.add_group('server_id', serverId)
      }
    }
  }
}

/**
 * Composable that builds the mixpanel initialization function
 * Note: The returned function will only initialize mixpanel on the client-side
 */
export async function useMixpanelInitialization() {
  if (import.meta.server) return

  const mp = useMixpanel()
  const { reidentify } = useMixpanelUserIdentification()
  const onAuthStateChange = useOnAuthStateChange()

  // Reidentify on auth change
  await onAuthStateChange(() => reidentify(), { immediate: true })

  // Track app visit
  mp.track(`Visit ${HOST_APP_DISPLAY_NAME}`)
}
