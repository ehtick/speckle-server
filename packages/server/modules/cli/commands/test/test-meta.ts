import type { CommandModule } from 'yargs'
import { cliLogger as logger } from '@/observability/logging'
import { metaHelpers } from '@/modules/core/helpers/meta'
import { Users } from '@/modules/core/dbSchema'
import type { UserRecord, UsersMetaRecord } from '@/modules/core/helpers/types'
import { db } from '@/db/knex'

const command: CommandModule = {
  command: 'test-meta',
  describe: 'Testing users meta behaviour',
  handler: async () => {
    logger.info('Hello world!')

    const testUsers = await Users.knex<UserRecord[]>().limit(5)
    const firstUserId = testUsers[0]?.id
    const secondUserId = testUsers[1]?.id
    if (!firstUserId || !secondUserId) {
      logger.error('One or more test users were not found')
      return
    }

    const meta = metaHelpers<UsersMetaRecord, typeof Users>(Users, db)

    // set value
    logger.info(await meta.set(firstUserId, 'foo', false))
    logger.info(await meta.set(firstUserId, 'bar', "I'm happy to see ya brodie'!\""))
    logger.info(await meta.set(secondUserId, 'foo', { a: 123 }))

    // get value
    logger.info(await meta.get<UsersMetaRecord<string>>(firstUserId, 'bar'))

    // get multiple values
    logger.info(
      await meta.getMultiple([
        { id: firstUserId, key: 'foo' },
        { id: firstUserId, key: 'bar' },
        { id: secondUserId, key: 'foo' },
        { id: secondUserId, key: 'bar' }
      ])
    )

    // delete value
    logger.info(await meta.delete(firstUserId, 'bar'))
  }
}

export = command
