import { GraphQLError } from 'graphql'

import type { MutationResolvers, Todo } from '../schema.generated'

const updateTodoStatus: MutationResolvers['updateTodoStatus'] = async (_, {
  id, completed,
}, { pubsub, decodedToken, kv }) => {
  if (decodedToken?.type === 'AnonymousAuth') {
    const { userId } = decodedToken
    const todoIdWithUser = `${userId}_${id}`
    const previous = await kv<Todo>(userId).get(todoIdWithUser)

    if (previous) {
      const todo = { ...previous, completed }
      pubsub.publish('todoUpdated', todo)
      await kv(userId).set(todoIdWithUser, todo)
      return todo
    }
    return null
  }
  throw new GraphQLError('Needs to be user')
}

export default updateTodoStatus
