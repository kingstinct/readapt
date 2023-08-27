import { useContext } from 'react'
import { Button, Text, View } from 'react-native'
import AuthContext from 'readapt-plugin-auth-anonymous-expo/contexts/Auth'
import { useMutation } from 'urql'

import { graphql } from '../gql'

import type { AllTodosQuery } from '../gql/graphql'

const CompleteTodo = graphql(/* GraphQL */ `
  mutation CompleteTodo($token: String!, $completed: Boolean!, $id: ID!) {
    updateTodoStatus(token: $token, completed: $completed, id: $id) {
      id
      title
      completed
    }
  }
`)

const TodoListItem: React.FC<{readonly todo: AllTodosQuery['todos'][0], readonly refetch: () => void}> = ({ todo, refetch }) => {
  const { token } = useContext(AuthContext)

  const [, completeTodo] = useMutation(CompleteTodo)

  return (
    <View>
      <Text>{todo.title}</Text>
      <Button
        key={todo.id}
        title={todo.completed ? 'Completed' : 'Not completed'}
        onPress={() => {
          void completeTodo({ id: todo.id, completed: !todo.completed, token: token! }).then(() => {
            refetch()
          })
        }}
      />
    </View>
  )
}

export default TodoListItem
