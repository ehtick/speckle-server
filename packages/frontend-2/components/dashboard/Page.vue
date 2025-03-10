<template>
  <div>
    <Portal to="navigation">
      <HeaderNavLink :to="homeRoute" name="Dashboard" hide-chevron :separator="false" />
    </Portal>
    <PromoBannersWrapper
      v-if="promoBanners && promoBanners.length"
      :banners="promoBanners"
    />
    <ProjectsDashboardHeader
      :projects-invites="projectsResult?.activeUser || undefined"
      :workspaces-invites="workspacesResult?.activeUser || undefined"
    />
    <div class="flex flex-col gap-y-12">
      <div class="flex flex-col-reverse lg:flex-col gap-y-12">
        <section>
          <h2 class="text-heading-sm text-foreground-2">Quickstart</h2>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3 pt-5">
            <CommonCard
              v-for="quickStartItem in quickStartItems"
              :key="quickStartItem.title"
              :title="quickStartItem.title"
              :description="quickStartItem.description"
              :buttons="quickStartItem.buttons"
              :is-external-route="quickStartItem.isExternalRoute"
            />
          </div>
        </section>
        <!-- <section>
          <h2 class="text-heading-sm text-foreground-2">Connectors</h2>

        </section> -->
        <section>
          <div class="flex items-center justify-between">
            <h2 class="text-heading-sm text-foreground-2">Recently updated projects</h2>
            <FormButton
              color="outline"
              size="sm"
              @click.stop="router.push(projectsRoute)"
            >
              View all
            </FormButton>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3 pt-5">
            <template v-if="hasProjects">
              <DashboardProjectCard
                v-for="project in projects"
                :key="project.id"
                :project="project"
              />
            </template>
            <CommonCard
              v-else
              title="Create your first project"
              description="Projects are the place where your models and their versions live."
              :buttons="createProjectButton"
            />
          </div>
        </section>
      </div>
      <section>
        <div class="flex items-center justify-between">
          <h2 class="text-heading-sm text-foreground-2">Tutorials</h2>
          <FormButton color="outline" size="sm" :to="tutorialsRoute">
            View more
          </FormButton>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-5">
          <TutorialsCard
            v-for="tutorialItem in tutorialItems.slice(0, 4)"
            :key="tutorialItem.title"
            :tutorial-item="tutorialItem"
            source="dashboard"
          />
        </div>
      </section>
    </div>

    <ProjectsAddDialog v-model:open="openNewProject" />
  </div>
</template>
<script setup lang="ts">
import {
  dashboardProjectsPageQuery,
  dashboardProjectsPageWorkspacesQuery
} from '~~/lib/dashboard/graphql/queries'
import type { QuickStartItem } from '~~/lib/dashboard/helpers/types'
import { useQuery } from '@vue/apollo-composable'
// import { useMixpanel } from '~~/lib/core/composables/mp'
import {
  docsPageUrl,
  forumPageUrl,
  homeRoute,
  connectorsRoute,
  projectsRoute,
  tutorialsRoute
} from '~~/lib/common/helpers/route'
// import type { ManagerExtension } from '~~/lib/common/utils/downloadManager'
// import { downloadManager } from '~~/lib/common/utils/downloadManager'
// import { ToastNotificationType, useGlobalToast } from '~~/lib/common/composables/toast'
import type { LayoutDialogButton } from '@speckle/ui-components'
import type { PromoBanner } from '~/lib/promo-banners/types'
import { tutorialItems } from '~/lib/dashboard/helpers/tutorials'
import { useUserProjectsUpdatedTracking } from '~~/lib/user/composables/projectUpdates'

// const mixpanel = useMixpanel()
const isWorkspacesEnabled = useIsWorkspacesEnabled()
const { result: projectsResult } = useQuery(dashboardProjectsPageQuery)
const { result: workspacesResult } = useQuery(
  dashboardProjectsPageWorkspacesQuery,
  undefined,
  () => ({
    enabled: isWorkspacesEnabled.value
  })
)
// const { triggerNotification } = useGlobalToast()
const { isGuest } = useActiveUser()
const router = useRouter()
useUserProjectsUpdatedTracking()

const promoBanners = ref<PromoBanner[]>()
const openNewProject = ref(false)
const quickStartItems = shallowRef<QuickStartItem[]>([
  {
    title: 'Install Connectors',
    description:
      'Extract and exchange data in real time between the most popular AEC applications using our tailored connectors.',
    buttons: [
      {
        text: 'Install connectors',
        props: { to: connectorsRoute }
      }
    ],
    isExternalRoute: false
  },
  {
    title: "Don't know where to start?",
    description: "We'll walk you through some of most common usage scenarios.",
    buttons: [
      {
        text: 'Open documentation',
        props: { to: docsPageUrl }
      }
    ]
  },
  {
    title: 'Have a question you need answered?',
    description: 'Submit your question on the forum and get help from the community.',
    buttons: [
      {
        text: 'Ask a question',
        props: { to: forumPageUrl }
      }
    ]
  }
])

const createProjectButton = shallowRef<LayoutDialogButton[]>([
  {
    text: 'Create a project',
    props: { disabled: isGuest.value },
    onClick: () => (openNewProject.value = true)
  }
])

const projects = computed(() => projectsResult.value?.activeUser?.projects.items)
const hasProjects = computed(() => (projects.value ? projects.value.length > 0 : false))
</script>
