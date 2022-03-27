# Decisions

The goal of this page is to document some of the decisions made here along the way.

## Choice of crypto libraries
window.crypto.subtle vs elliptic vs eccrypto vs simple-web-crypto

subtle:
- Only available on https
- Not available on node
- Cannot derive public EC key from private (this is requisite)

eccrypto:
* Basically elliptic but isomorphic with node
+ works with node
+ Can derive public EC key from private one

simple-web-crypto:
* Very nice wrapper around subtle

Went with eccrypto.

## Shared private state

For a while I was wondering whether to include state that is only visible
to two users. Private messages would be a great candidate to use for that.
But at this point I think it's better to keep that at application level.
This db can be basically the simplest form that expresses the concept of
shared state amongst the network.

## Private state / Public state

Also wondered about making an explicit private/public state distinction.
But again, if somebody wants to make some state private, it's super easy
for them to just encrypt it at application layer and store in the regular
(public) state within this db.

## Delete functionality

This is another application layer thing. All we'd be able to do is write
over a user's state so it's just null or something. So their key will
be there in perpetuity, but what it points to will not. Eventually, if
there's an state age limit available the deleted state would fade out
of existence.
