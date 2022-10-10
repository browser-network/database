import tap from 'tap'
import Db from '../src'
import Network from '@browser-network/network'
import * as bnc from '@browser-network/crypto'
import { ensureEventually } from './util'
import { randomUUID } from 'crypto' // TODO ensure this doesn't inflate the build size, use uuid/v4 if it does

// Ensure if person A makes some state and sends it to person B, then person A
// logs out, then person C logs in, that person C will get person A's state via
// person B.
tap.test(`State is passed around`, async t => {

  t.teardown(() => {
    process.exit(0)
  })

  const appId = 'db-test-app-id-andrews-art'
  const networkId = randomUUID()
  const switchAddress = 'http://localhost:5678'

  const secret1 = bnc.generateSecret()

  const db1 = new Db({
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

  const db2 = new Db({
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

  db1.set({ db1: 'state' })

  await ensureEventually(2 * 60 * 1000, () => {
    // eventually db2 should have db1's address
    const db2State = db2.get(db1.address)
    if (db2State) console.log('db2 found db1 state:', db2State)
    return !!db2State
  }).catch(() => {
    t.fail(`db2 did not see db1's state within the time limit`)
  }).then(() => {
    t.pass('db2 sees db1\'s state')
  })

  // Now we shut down db1
  db1.network.teardown()

  const secret3 = bnc.generateSecret()

  const db3 = new Db({
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

  // Ensure db3 sees db1's state even though they were never simultaneously
  // online (via db2)
  await ensureEventually(2 * 60 * 1000, () => {
    const db1StateByDb3 = db3.get(db1.address)
    if (db1StateByDb3) console.log('db3 found db1 state:', db1StateByDb3)
    return !!db1StateByDb3
  }).catch(() => {
    t.fail(`db3 did not see db1's state within the time limit`)
  }).then(() => {
    t.pass('db3 sees db1\'s state')
  })

  // Now check to make sure clear() works
  db3.clear()
  t.equal(db3.getAll().length, 0, 'db3 did not clear its local storage')

  t.end()
})
