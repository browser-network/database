# Distributed Browser Database (Dbdb)

A distributed, decentralized, trustless, peer to peer database that exists in
the browser on top of [The Browser
Network](https://github.com/browser-network/network).

Dbdb was created to allow apps to be developed completely client side. I don't
mean [serverless in the modern
sense](https://www.redhat.com/en/topics/cloud-native-apps/what-is-serverless),
I mean truly apps running without servers at all.

It works by allowing each user to have one "state". The state can be anything.
When a user updates their state, Dbdb passes it to other users on the network
who hold on to it. If a third user wants to see the first user's state and
the first user is not online, whoever else may have it can pass it along.

* The database works more as a list of distinct state objects rather than one big
shared state of things.
* Each user can modify only their own state.
* Each user holds a copy of every state on the network.
* If user A updates their state, and then is simultaneously online with user B at any point, user B will pick up
that state. If then user A closes their browser window, then user C opens
theirs, user C will get, via user B, user A's state.
* Each client periodically broadcasts which states they have (just a list of id's associated with a
timestamp of their last modification), and if there's a version in there that's
newer than what it has, it will request that update from the node that
broadcasted it. This way full state objects are never sent over the network
unnecessarily, preserving bandwidth.
* This database uses the excellent
[eccrypto](https://www.npmjs.com/package/eccrypto) elliptic curve public key
cryptography system to prove veracity of state, ensuring one user cannot update
another user's information.

## Installation

Installing this is mostly like usual:

```sh
npm install @browser-network/database
```

or if you're old school and want a umd import:

```html
<script src="//unpkg.com/@browser-network/database/umd/database.min.js"></script>
```

## Quick Start

Here's a very simple app you can get up and running using @browser-network/database
super quick and easy:

```html
<!doctype html>

<html lang="en">
  <body>

    <code id='state'></code>

    <script src="//unpkg.com/@browser-network/crypto/umd/crypto.min.js"></script>
    <script src="//unpkg.com/@browser-network/network/umd/network.min.js"></script>
    <script src="//unpkg.com/@browser-network/database/umd/dbdb.min.js"></script>
    <script>

      const network = new Network({
        switchAddress: 'http://localhost:5678', // default address of switchboard
        secret: Bnc.generateSecret(),
        networkId: 'test-network'
      })

      const dbdb = new Dbdb({
        network: network,
        secret: Bnc.generateSecret(),
        appId: 'dbdb-app-id' // this just needs to be unique for your app, which it is for this
      })

      dbdb.onChange(() => {
        console.log("We've got updates!:", dbdb.getAll())
        document.querySelector('#state').innerHTML = JSON.stringify(dbdb.getAll())
      })

      window.setState = (state) => dbdb.set(state)

    </script>
  </body>
</html>
```

Copy and paste that html into some html file of your choosing on your machine.
Then in one terminal:

```sh
npx @browser-network/switchboard
```

And in another, host your html file. I've always found this to be easiest:

```sh
python -m SimpleHTTPServer
```

Now navigate to `localhost:8000` or whatever port you're hosting it on, with
a few browser windows.

Now, in one of them, open up the console, and run `setState('hello, world!')`

You should see, eventually, that state appear on the screens of all the different
browser windows you have open.

## Usage

```ts
import Network from '@browser-network/network'
import Bnc from '@browser-network/crypto'
import Dbdb from '@browser-network/database'

// This is a database that operates on top of the browser network.
const network = new Network({
  switchAddress: 'localhost:5678',
  networkId: 'whatever-network-id-just-make-it-unique',
  clientId: '<clientId>' // usually stored in the localStorage
})

// Instantiate the db
const db = new Dbdb({
  appId: 'just-needs-to-be-unique-from-other-appIds-on-the-network',
  network: network,
  secret: Bnc.generateSecret() // your users will reuse this, saving it somewhere safe and secret.
})

// Listen for changes. This will be called every time we discover a new
// user on the network or someone we already know has updated their state.
db.onChange(() => {

  // Get the whole state of the network as far as we are aware
  const userStates = db.getAll()

  // Maybe if you are using react, we are in a top level component and call
  // something like
  setState({ userStates })

  // To see just one user's state
  // (`clientId` represents the id of the user on the network)
  const oneState = db.get(<clientId>)

  // To set our own state
  db.set(<ourState>)
})

// Now we can interact with the database

// Set your own state. It can be whatever type you want.
db.set({ whatever: 'we want' })

// Get a state
db.get(<id>) // where id is a clientId, which is the same as the WrappedState['id'] type.

// Get all of the states
db.getAll()

// Clear the local Storage. Note that if you're still connected to others on the network,
// your storage will rapidly begin to repopulate.
db.clear()
```

### Allow/deny lists

Dbdb also has allow/deny lists. The lists are just an exposed array of
`clientId`s, so add to it like `dbdb.allowList.push('<clientId>')`. Or swap in
`denyList`.

* If a user is on the `denyList`, we will never accept any messages from them.
* If there're any ids in the `allowList`, and a user is _not_ in there, then
we will not accept any messages from them.

### generateSecret()

Dbdb uses a public key cryptography system to ensure only a user can update
their own state. The public key is derived from the secret. @browser-network exposes an
easy way to make a dbdb acceptable private key, which your users can store and
then put back in as the `secret` field when Dbdb is instantiated.

```ts
import { generateSecret } from '@browser-network/crypto'
generateSecret() // -> hex string
```

### On removing items

Dbdb has an interesting take on removing items: there's explicitly no concept
of it, because that'd take it from declarative kinda to imperative kinda,
whereby only the people online at the time of removal would know to remove
it from their own local storage. For users offline at the time of deletion,
they'd happily send out that state to everyone and everyone else would pick
it up as if it was new state they'd never seen before. If instead a user
sets their state to null or undefined, it can be dealt with on the app
level, and the update will make it to everyone.

If need be, later some logic can be put in to remove al the state that's set to
null or undefined or {} or [] or ''.

## Building

Because this project is using
[eccrypto](https://www.npmjs.com/package/eccrypto) and
[simple-peer](https://www.npmjs.com/package/eccrypto), it's pretty much locked
into the [browserify](https://browserify.org/) ecosystem. Modern webpack does
not automatically shim for browserify requires, but you can get it working with
determination. However using browserify directly will be easier without a
doubt.

### TODO
* Max state age specification
* Only send a certain number of states per unit time. Or a certain volume of data.
