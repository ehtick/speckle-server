import { noop } from 'lodash-es'
import type { CommandModule } from 'yargs'

const command: CommandModule = {
  command: 'seed',
  describe: 'Seed your local DB with fake data',
  builder(yargs) {
    return yargs.commandDir('seed', { extensions: ['js', 'ts'] }).demandCommand()
  },
  handler: noop
}

export = command
