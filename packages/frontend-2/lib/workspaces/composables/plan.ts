import { graphql } from '~~/lib/common/generated/gql'
import { workspacePlanQuery } from '~~/lib/workspaces/graphql/queries'
import { useQuery } from '@vue/apollo-composable'
import {
  PaidWorkspacePlansNew,
  UnpaidWorkspacePlans,
  WorkspacePlanBillingIntervals,
  isPaidPlan as isPaidPlanShared,
  isNewWorkspacePlan,
  doesPlanIncludeUnlimitedProjectsAddon
} from '@speckle/shared'
import type { WorkspacesPlan_WorkspaceFragment } from '~/lib/common/generated/gql/graphql'
import {
  WorkspacePlanStatuses,
  BillingInterval
} from '~/lib/common/generated/gql/graphql'
import { formatPrice } from '~/lib/billing/helpers/plan'
import { useActiveWorkspacePlanPrices } from '~/lib/billing/composables/prices'

graphql(`
  fragment WorkspacesPlan_Workspace on Workspace {
    id
    slug
    plan {
      status
      createdAt
      name
      paymentMethod
      usage {
        projectCount
        modelCount
      }
    }
    subscription {
      billingInterval
      currentBillingCycleEnd
      currency
      seats {
        editors {
          assigned
          available
        }
        viewers {
          assigned
          available
        }
      }
    }
  }
`)

export const usePlanState = () =>
  useState<WorkspacesPlan_WorkspaceFragment | null>('plan', () => null)

export const useWorkspacePlan = (slug: string) => {
  const planState = usePlanState()
  const isBillingIntegrationEnabled = useIsBillingIntegrationEnabled()
  const { prices } = useActiveWorkspacePlanPrices()

  const { onResult } = useQuery(
    workspacePlanQuery,
    () => ({
      slug
    }),
    () => ({
      enabled: isBillingIntegrationEnabled.value && slug !== planState.value?.slug
    })
  )

  onResult((result) => {
    planState.value = result.data?.workspaceBySlug
  })

  const subscription = computed(() => planState.value?.subscription)
  const plan = computed(() => planState.value?.plan)
  const currency = computed(() => subscription.value?.currency || 'usd')

  const isFreePlan = computed(() => plan.value?.name === UnpaidWorkspacePlans.Free)
  const isBusinessPlan = computed(
    () =>
      plan.value?.name === PaidWorkspacePlansNew.Pro ||
      plan.value?.name === PaidWorkspacePlansNew.ProUnlimited
  )
  const isUnlimitedPlan = computed(
    () => plan.value?.name === UnpaidWorkspacePlans.Unlimited
  )
  const isPaidPlan = computed(
    () => plan.value?.name && isPaidPlanShared(plan.value?.name)
  )
  const isNewPlan = computed(
    () => plan.value?.name && isNewWorkspacePlan(plan.value?.name)
  )
  const hasUnlimitedAddon = computed(() => {
    if (!plan.value?.name) return false
    return doesPlanIncludeUnlimitedProjectsAddon(plan.value.name)
  })

  // Plan status information
  const statusIsExpired = computed(
    () => plan.value?.status === WorkspacePlanStatuses.Expired
  )
  const statusIsCanceled = computed(
    () => plan.value?.status === WorkspacePlanStatuses.Canceled
  )
  const statusIsCancelationScheduled = computed(
    () => plan.value?.status === WorkspacePlanStatuses.CancelationScheduled
  )

  // Billing cycle information
  const billingInterval = computed(() => subscription.value?.billingInterval)
  const intervalIsYearly = computed(
    () => billingInterval.value === BillingInterval.Yearly
  )
  const currentBillingCycleEnd = computed(
    () => subscription.value?.currentBillingCycleEnd
  )

  // Seat information
  const seats = computed(() => subscription.value?.seats)
  const hasAvailableEditorSeats = computed(() => {
    if (seats.value?.editors.available && seats.value?.editors.assigned) {
      return seats.value?.editors.available - seats.value?.editors.assigned > 0
    }
    return false
  })
  const editorSeatPriceFormatted = computed(() => {
    if (plan.value?.name && isPaidPlanShared(plan.value?.name)) {
      return formatPrice(
        prices.value?.[plan.value?.name as PaidWorkspacePlansNew]?.[
          WorkspacePlanBillingIntervals.Monthly
        ]
      )
    }

    return formatPrice({
      amount: 0,
      currency: 'gbp'
    })
  })

  return {
    plan,
    statusIsExpired,
    statusIsCanceled,
    isFreePlan,
    billingInterval,
    intervalIsYearly,
    currentBillingCycleEnd,
    statusIsCancelationScheduled,
    subscription,
    seats,
    hasAvailableEditorSeats,
    editorSeatPriceFormatted,
    isUnlimitedPlan,
    isBusinessPlan,
    isPaidPlan,
    isNewPlan,
    currency,
    hasUnlimitedAddon
  }
}
