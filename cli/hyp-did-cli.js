#!/usr/bin/env node

process.title = "hyp-did"

import Path from 'path'
import operatingSystem from 'os'
import subcommand from 'subcommand'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import chalk from 'chalk'
import fetch from 'node-fetch'
import { DidClient } from 'hyp-did'

const packageJson = JSON.parse(fs.readFileSync(path.join(fileURLToPath(import.meta.url), '../../package.json'), 'utf8'))

// MOVE THIS TO A ~/.hyp-did-cli/config
const HOSTS = (process.env.HYP_DID_SERVERS || '').spit(',')

export const commands = {
  create: {
    name: 'create',
    description: 'Create a new did',
    usage: {
      simple: 'Create a new did',
      full: 'Create a new did and hypercore'
    },
    async command({ didClient }){
      const didDocument = await didClient.create()
      const { did } = didDocument
      console.log(didDocument.value)
      console.log(`replicating…`)
      await didClient.ready()
      await Promise.all(HOSTS.map(host => replicate(host, didDocument.did)))
    }
  },
  resolve: {
    name: 'resolve',
    description: 'get the did document for the given did',
    usage: {
      simple: 'get did document',
      full: 'get the did document for the given did',
    },
    async command({ didClient, _: [did], replicate }){
      console.log('resolving', did)
      // await didClient.ready()
      const didDocument = await didClient.get(did)
      if (!didDocument) return fail(`unabled to resolve ${did}`)
      if (!didDocument.loaded) await didDocument.update()
      console.log(didDocument.value)
      if (replicate) await didDocument.replicate()
    }
  },
  superseed: {
    name: 'superseed',
    description: 'superseed',
    usage: {
      simple: 'superseed',
      full: 'superseed',
    },
    async command(args){
      console.log('superseed', args)
    }
  },
  revoke: {
    name: 'revoke',
    description: 'revoke',
    usage: {
      simple: 'revoke',
      full: 'revoke',
    },
    async command(args){
      console.log('revoke', args)
    },
  },
  history: {
    name: 'history',
    description: 'get the history for the given did',
    usage: {
      simple: 'get the history for the given did',
      full: 'get the history for the given did'
    },
    command(args){
      console.log('history', args)
    },
  },
}

Object.values(commands).forEach(wrapCommand)

// match & run the command
subcommand({ commands: Object.values(commands), none })(process.argv.slice(2))

function wrapCommand(cmd){
  const { command } = cmd
  cmd.command = async function(args){
    if (args.v || args.verbose) args.verbose = true
    if (args.h || args.help) {
      usage(cmd)
      process.exit(0)
    }

    let storagePath = Path.join(operatingSystem.homedir(), '.hyp-did', 'storage')
    if (args.verbose){
      console.error(`${chalk.gray(`storing hypercores in ${storagePath}`)}`)
    }

    args.didClient = new DidClient({
      storagePath
    })

    try{
      await command(args)
    }catch(error){
      fail(error)
    }finally{
      await args.didClient.destroy()
      process.exit(0)
    }
  }
}

function none(args){
  if (args.version){
    console.log(packageJson.version)
    process.exit(0)
  }
  if (args._[0]){
    console.error(`Invalid command: ${args._[0]}`)
  }else{
    usage()
  }
}

function fail(error) {
  console.error(error)
  // console.error(chalk.red(`${error}\n`))
  process.exit(1)
}

function usage(cmd){
  if (cmd) {
    console.error(simple(cmd))
    if (cmd.usage.full) console.error(cmd.usage.full)
    else console.error('')
    return
  }

  console.error(`Usage: ${chalk.bold(process.title)} <command> ${chalk.gray(`[opts...]`)}

  ${simple(commands.create)}
  ${simple(commands.resolve)}
  ${simple(commands.superseed)}
  ${simple(commands.revoke)}
  ${simple(commands.history)}

  ${chalk.green(`Learn more at ${packageJson.homepage}`)}
`)
}

function simple (cmd) {
  return `${chalk.bold(`${process.title} ${cmd.name}`)} ${cmd.usage.simple ? `${cmd.usage.simple} -` : `-`} ${cmd.description}`
}


async function replicate(host, did){
  const url = `${host}/${did}`
  const start = Date.now()
  while (Date.now() - start < 60000){
    const response = await fetch(url, {
      method: 'get',
      headers: {'Accept': 'application/json'}
    })
    const didDocument2 = await response.json()
    if (didDocument2 && didDocument2.did === did) return didDocument2
  }
  console.log(`replicated at ${url}`)
}
