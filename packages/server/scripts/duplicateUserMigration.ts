import { knex } from '@/db/knex'
import { logger } from '@/observability/logging'
import roles from '@/modules/core/roles.js'
import { Roles } from '@speckle/shared'

const Users = () => knex('users')

// tableName, columnName that need migration
const migrationTargets = <const>[
  ['api_tokens', 'owner'],
  ['authorization_codes', 'userId'],
  ['branches', 'authorId'],
  ['commits', 'author'],
  ['file_uploads', 'userId'],
  ['personal_api_tokens', 'userId'],
  ['refresh_tokens', 'userId'],
  // [ 'server_acl' , 'userId' ], //userId is a PrimaryKey in this table, act accordingly
  ['server_apps', 'authorId'],
  ['server_invites', 'inviterId'],
  // [ 'stream_acl' , 'userId' ],//userId, with resourceId is a PrimaryKey in this table, act accordingly
  ['stream_activity', 'userId']
]

type User = { id: string }
type StreamAcl = { userId: string; resourceId: string; role: string }

const migrateColumnValue = async (
  tableName: string,
  columnName: string,
  oldUser: User,
  newUser: User
) => {
  try {
    const query = knex(tableName)
      .where({ [columnName]: oldUser.id })
      .update({ [columnName]: newUser.id })
    logger.info(`${query}`)
    await query
  } catch (err) {
    logger.error(err)
  }
}

const serverAclMigration = async ({
  lowerUser,
  upperUser
}: {
  lowerUser: User
  upperUser: User
}) => {
  const oldAcl = await knex('server_acl').where({ userId: upperUser.id }).first()
  // if the old user was admin, make the target admin too
  if (oldAcl.role === Roles.Server.Admin)
    await knex('server_acl')
      .where({ userId: lowerUser.id })
      .update({ role: Roles.Server.Admin })
}

const _migrateSingleStreamAccess = async ({
  lowerUser,
  upperStreamAcl
}: {
  lowerUser: User
  upperStreamAcl: StreamAcl
}) => {
  const upperRole = roles.filter((r) => r.name === upperStreamAcl.role)[0]
  const lowerAcl = await knex('stream_acl')
    .where({ userId: lowerUser.id, resourceId: upperStreamAcl.resourceId })
    .first()
  // see if the lowerUser has access to the stream
  if (lowerAcl) {
    // if the upper user had more access, migrate the lower user up
    const lowerRole = roles.filter((r) => r.name === lowerAcl.role)[0]
    if (lowerRole.weight < upperRole.weight)
      await knex('stream_acl')
        .where({ userId: lowerUser.id, resourceId: upperStreamAcl.resourceId })
        .update({ role: upperRole.name })
  } else {
    // if it didn't have access, just add it
    const lowerStreamAcl = { ...upperStreamAcl }
    lowerStreamAcl.userId = lowerUser.id
    await knex('stream_acl').insert(lowerStreamAcl)
  }
}

const streamAclMigration = async ({
  lowerUser,
  upperUser
}: {
  lowerUser: User
  upperUser: User
}) => {
  const upperAcl = await knex('stream_acl').where({ userId: upperUser.id })

  await Promise.all(
    upperAcl.map(
      async (upperStreamAcl) =>
        await _migrateSingleStreamAccess({ lowerUser, upperStreamAcl })
    )
  )
}

const createMigrations = ({
  lowerUser,
  upperUser
}: {
  lowerUser: User
  upperUser: User
}) =>
  migrationTargets.map(([tableName, columnName]) => {
    void migrateColumnValue(tableName, columnName, upperUser, lowerUser)
  })

const userByEmailQuery = (email: string) => Users().where({ email })

const getDuplicateUsers = async () => {
  const duplicates = (await knex.raw(
    'select lower(email) as lowered, count(id) as reg_count from users group by lowered having count(id) > 1'
  )) as { rows: Array<{ lowered: string; reg_count: number }> }

  return await Promise.all(
    duplicates.rows.map(async (dup) => {
      const lowerEmail = dup.lowered

      let lowerUser = await userByEmailQuery(lowerEmail).first()
      // if no user found migrate to a random one?
      // TODO: decide 👆
      // my idea, take the first one and run with it
      if (!lowerUser)
        lowerUser = await Users()
          .whereRaw('lower(email) = lower(?)', [lowerEmail])
          .first()
      const upperUser = await Users()
        .whereRaw('lower(email) = lower(?)', [lowerEmail])
        .whereNot({ id: lowerUser.id })
        .first()
      return { lowerUser, upperUser }
    })
  )
}

const runMigrations = async () => {
  const duplicateUsers = await getDuplicateUsers()
  logger.info(duplicateUsers)
  await Promise.all(
    duplicateUsers.map(async (userDouble) => {
      const migrations = createMigrations(userDouble)
      await Promise.all(migrations.map(async (migrationStep) => await migrationStep))
      await serverAclMigration(userDouble)
      await streamAclMigration(userDouble)

      // remove the now defunct user
      await userByEmailQuery(userDouble.upperUser.email).delete()
    })
  )
}

void (async function () {
  try {
    // await createData()
    await runMigrations()
  } catch (err) {
    logger.error(err)
  } finally {
    process.exit()
  }
})()
