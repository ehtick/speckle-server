import type { ScopeRecord } from '@/modules/auth/helpers/types'
import { Scopes } from '@/modules/core/dbSchema'
import type { TokenScopeData } from '@/modules/shared/domain/rolesAndScopes/types'
import type { Knex } from 'knex'

const tables = {
  scopes: (db: Knex) => db<ScopeRecord>(Scopes.name)
}

export const registerOrUpdateScopeFactory =
  ({ db }: { db: Knex }) =>
  async ({ scope }: { scope: TokenScopeData }) => {
    await tables
      .scopes(db)
      .insert(scope)
      .onConflict('name')
      .merge(['public', 'description'])
  }
