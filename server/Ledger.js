import Debug from 'debug'
import Path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { didToKey, keyToString } from 'jlinx-core/util.js'

const debug = Debug('jlinx:ledger')
const packageJson = JSON.parse(fs.readFileSync(Path.join(fileURLToPath(import.meta.url), '../package.json'), 'utf8'))
const VERSION = packageJson.version

export default class Ledger {

  constructor(did, core){
    this.did = did
    this.publicKey = didToKey(did)
    this.core = core
  }

  [Symbol.for('nodejs.util.inspect.custom')](depth, opts){
    let indent = ''
    if (typeof opts.indentationLvl === 'number')
      while (indent.length < opts.indentationLvl) indent += ' '
    return this.constructor.name + '(\n' +
      indent + '  did: ' + opts.stylize(this.did, 'string') + '\n' +
      indent + '  length: ' + opts.stylize(this.length, 'number') + '\n' +
      indent + '  writable: ' + opts.stylize(this.writable, 'boolean') + '\n' +
      // indent + '  writable: ' + opts.stylize(this.writable, 'boolean') + '\n' +
      // indent + '  published: ' + opts.stylize(this.published, 'boolean') + '\n' +
      // indent + '  loaded: ' + opts.stylize(this.loaded, 'boolean') + '\n' +
      // indent + '  publicKey: ' + opts.stylize(this.publicKey, 'string') + '\n' +
      // indent + '  value: ' + opts.stylize(this.value ? JSON.stringify(this.value) : '', 'string') + '\n' +
      indent + ')'
  }

  get writable(){ return this.core.writable }
  get length(){ return this.core.length }

  async update(){
    await this.core.update()
    if (keyToString(this.core.key) !== this.publicKey)
      throw new Error(`key mismatch ${[keyToString(this.core.key), this.publicKey]}`)
    this.loaded = true
    this.initialized = this.core.length > 0
    if (this.initialized){
      const headerJson = await this.core.get(0)
      this.header = JSON.parse(headerJson)
      this.type = this.header.type
    }
  }

  async ready(){
    await this.update()
  }

  async exists(){
    await this.update()
    return this.initialized
  }

  async append(...events){
    // if (this.core.length === 0) // ensure entries[0] is a header record
    return await this.core.append(
      events.map(event => {
        return JSON.stringify({
          jlinxVersion: VERSION,
          at: new Date,
          event,
        })
      })
    )
  }

  async initialize(metadata){
    await this.update()
    if (this.initialized) throw new Error(`did=${this.did} already initialized`)
    await this.append({ eventType: 'init', ...metadata })
  }

  async getEvent(index){
    const json = await this.core.get(index)
    return JSON.parse(json).event
  }

  async getEvents(){
    await this.update()
    const length = this.core.length
    const entries = await Promise.all(
      Array(length).fill().map((_, index) => this.getEvent(index))
    )
    return entries
  }

  appleEvent(value, event){
    return Object.assign({}, value, event.payload)
  }

  async getValue(){
    const events = await this.getEvents()
    debug('GET VALUE', { events })
    const value = {}
    for (const entry of events) this.appleEvent(value, entry, events)
    return value
  }
}