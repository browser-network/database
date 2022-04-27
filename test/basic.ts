import tap from 'tap'
import { Dbdb } from '../src'
import { Network } from '@browser-network/network'
import * as bnc from '@browser-network/crypto'
import { ensureEventually } from './util'
import { randomUUID } from 'crypto'

// Ensure if person A makes some state and sends it to person B, then person A
// logs out, then person C logs in, that person C will get person A's state via
// person B.
tap.test(`State is passed around`, async t => {

  t.teardown(() => {
    process.exit(0)
  })

  const appId = 'dbdb-test-app-id-andrews-art'
  const networkId = randomUUID()
  const switchAddress = 'http://localhost:5678'

  const secret1 = bnc.generateSecret()

  const dbdb1 = new Dbdb({
    appId,
    secret: secret1,
    network: new Network({
      switchAddress, networkId,
      secret: secret1,
      config: {
        respectSwitchboardVolunteerMessages: false
      }
    })
  })

  const secret2 = bnc.generateSecret()

  const dbdb2 = new Dbdb({
    appId,
    secret: secret2,
    network: new Network({
      switchAddress, networkId,
      secret: secret2,
      config: {
        respectSwitchboardVolunteerMessages: false
      }
    })
  })

  dbdb1.set({ dbdb1: 'state' })

  await ensureEventually(2 * 60 * 1000, () => {
    // eventually dbdb2 should have dbdb1's address
    const dbdb2State = dbdb2.get(dbdb1.address)
    if (dbdb2State) console.log('dbdb2 found dbdb1 state:', dbdb2State)
    return !!dbdb2State
  }).catch(() => {
    t.fail(`dbdb2 did not see dbdb1's state within the time limit`)
  }).then(() => {
    t.pass('dbdb2 sees dbdb1\'s state')
  })

  // Now we shut down dbdb1
  dbdb1.network.teardown()

  const secret3 = bnc.generateSecret()

  const dbdb3 = new Dbdb({
    appId,
    secret: secret3,
    network: new Network({
      switchAddress, networkId,
      secret: secret3,
      config: {
        respectSwitchboardVolunteerMessages: false
      }
    })
  })

  await ensureEventually(2 * 60 * 1000, () => {
    // Ensure dbdb3 sees dbdb1's state even though they were never simultaneously
    // online (via dbdb2)
    const dbdb3State = dbdb3.get(dbdb1.address)
    if (dbdb3State) console.log('dbdb3 found dbdb1 state:', dbdb3State)
    return !!dbdb3State
  }).catch(() => {
    t.fail(`dbdb3 did not see dbdb1's state within the time limit`)
  }).then(() => {
    t.pass('dbdb3 sees dbdb1\'s state')
  }).finally(() => {
    t.end()
  })

})
