# @repo/models

The TypeScript models shared between the client and the Convex backend —
most importantly the Coach operation contracts, which are the vocabulary the
AI uses to propose changes and the client uses to render, confirm, and undo
them.

Nothing in here executes anything. If a type is only used on one side of the
client/backend line, it does not belong in this package; put it where it is
used. If both sides need it and they disagree about its shape, that is a bug
this package exists to make impossible.
