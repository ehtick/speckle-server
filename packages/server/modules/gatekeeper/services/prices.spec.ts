import {
  getFreshWorkspacePlanProductPricesFactory,
  getWorkspacePlanProductPricesFactory
} from '@/modules/gatekeeper/services/prices'
import { Currency } from '@/modules/gatekeeperCore/domain/billing'
import { expectToThrow } from '@/test/assertionHelper'
import { mockRedisCacheProviderFactory } from '@/test/redisHelper'
import {
  PaidWorkspacePlans,
  PaidWorkspacePlansNew,
  WorkspaceGuestSeatType,
  WorkspacePlanBillingIntervals
} from '@speckle/shared'
import { expect } from 'chai'
import { flatten } from 'lodash'
import { WorkspacePlanProductAndPriceIds } from '@/modules/gatekeeper/domain/billing'

const testProductAndPriceIds: WorkspacePlanProductAndPriceIds = {
  [WorkspaceGuestSeatType]: {
    productId: 'prod_guest',
    monthly: { gbp: 'price_guest_monthly_gbp' },
    yearly: { gbp: 'price_guest_yearly_gbp' }
  },
  [PaidWorkspacePlans.Starter]: {
    productId: 'prod_starter',
    monthly: { gbp: 'price_starter_monthly_gbp' },
    yearly: { gbp: 'price_starter_yearly_gbp' }
  },
  [PaidWorkspacePlans.Plus]: {
    productId: 'prod_plus',
    monthly: { gbp: 'price_plus_monthly_gbp' },
    yearly: { gbp: 'price_plus_yearly_gbp' }
  },
  [PaidWorkspacePlans.Business]: {
    productId: 'prod_business',
    monthly: { gbp: 'price_business_monthly_gbp' },
    yearly: { gbp: 'price_business_yearly_gbp' }
  },
  [PaidWorkspacePlans.Team]: {
    productId: 'prod_team',
    monthly: { gbp: 'price_team_monthly_gbp', usd: 'price_team_monthly_usd' },
    yearly: { gbp: 'price_team_yearly_gbp', usd: 'price_team_yearly_usd' }
  },
  [PaidWorkspacePlans.TeamUnlimited]: {
    productId: 'prod_team_unlimited',
    monthly: {
      gbp: 'price_team_unlimited_monthly_gbp',
      usd: 'price_team_unlimited_monthly_usd'
    },
    yearly: {
      gbp: 'price_team_unlimited_yearly_gbp',
      usd: 'price_team_unlimited_yearly_usd'
    }
  },
  [PaidWorkspacePlans.Pro]: {
    productId: 'prod_pro',
    monthly: { gbp: 'price_pro_monthly_gbp', usd: 'price_pro_monthly_usd' },
    yearly: { gbp: 'price_pro_yearly_gbp', usd: 'price_pro_yearly_usd' }
  },
  [PaidWorkspacePlans.ProUnlimited]: {
    productId: 'prod_pro_unlimited',
    monthly: {
      gbp: 'price_pro_unlimited_monthly_gbp',
      usd: 'price_pro_unlimited_monthly_usd'
    },
    yearly: {
      gbp: 'price_pro_unlimited_yearly_gbp',
      usd: 'price_pro_unlimited_yearly_usd'
    }
  }
}

const fakeGetRecurringPrices = async () => {
  const pricePairs = Object.values(PaidWorkspacePlansNew).map((plan) => {
    const { productId, monthly, yearly } = testProductAndPriceIds[plan]
    return [
      {
        id: monthly.gbp,
        productId,
        unitAmount: 1,
        currency: 'gbp'
      },
      {
        id: monthly.usd,
        productId,
        unitAmount: 2,
        currency: 'usd'
      },
      {
        id: yearly.usd,
        productId,
        unitAmount: 3,
        currency: 'usd'
      },
      {
        id: yearly.gbp,
        productId,
        unitAmount: 4,
        currency: 'gbp'
      }
    ]
  })
  return flatten(pricePairs)
}

describe('prices @gatekeeper', () => {
  describe('getFreshWorkspacePlanProductPricesFactory', () => {
    it('returns prices', async () => {
      const sut = getFreshWorkspacePlanProductPricesFactory({
        getWorkspacePlanProductAndPriceIds: () => testProductAndPriceIds,
        getRecurringPrices: fakeGetRecurringPrices
      })

      const result = await sut()

      expect(result).to.be.ok
      for (const currency of Object.values(Currency)) {
        const newPlans = result[currency]
        for (const newPaidPlan of Object.values(PaidWorkspacePlansNew)) {
          const plan = newPlans[newPaidPlan]
          for (const interval of Object.values(WorkspacePlanBillingIntervals)) {
            const price = plan[interval]
            expect(price.amount).to.be.ok
            expect(price.currency).to.equal(currency)
          }
        }
      }
    })

    it('throws if price not found', async () => {
      const sut = getFreshWorkspacePlanProductPricesFactory({
        getWorkspacePlanProductAndPriceIds: () => testProductAndPriceIds,
        getRecurringPrices: async () => []
      })

      const e = await expectToThrow(sut)
      expect(e.message).to.match(/.* price not found for .* plan/)
    })
  })

  describe('getWorkspacePlanProductPricesFactory', () => {
    it('returns prices in a cached manner', async () => {
      let invoked = 0
      const sut = getWorkspacePlanProductPricesFactory({
        getWorkspacePlanProductAndPriceIds: () => testProductAndPriceIds,
        getRecurringPrices: async () => {
          invoked++
          return fakeGetRecurringPrices()
        },
        // Unit test, so we want a fresh cache every time
        cacheProvider: mockRedisCacheProviderFactory({ createNewCache: true })
      })

      const result = await sut()
      expect(result).to.be.ok

      const result2 = await sut()
      expect(result2).to.be.ok
      expect(result2).to.deep.equal(result)

      expect(invoked).to.equal(1)
    })
  })
})
