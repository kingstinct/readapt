import { createTestApp } from '@zemble/core/test-utils'
import { describe, expect, it } from 'bun:test'

import plugin from '../../plugin'
import { graphql } from '../client.generated'

export const LoginRequestMutation = graphql(`
  mutation LoginRequest($email: String!) {
    emailLoginRequest(email: $email) {
      __typename
      ... on Error {
        message
      }
    }
  }
`)

describe('Mutation.loginRequest', () => {
  it('Should succeed', async () => {
    const app = await createTestApp(plugin)

    const email = 'test@example.com'

    const { data } = await app.gqlRequest(LoginRequestMutation, { email })

    expect(data).toEqual({
      emailLoginRequest: {
        __typename: 'LoginRequestSuccessResponse',
      },
    })
  })

  it('Should fail if not email', async () => {
    const app = await createTestApp(plugin)

    const email = 'test@.com'

    const { data } = await app.gqlRequest(LoginRequestMutation, { email })

    expect(data).toEqual({
      emailLoginRequest: {
        __typename: 'EmailNotValidError',
        message: 'Not a valid email',
      },
    })
  })
})