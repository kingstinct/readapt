import { test, expect } from 'bun:test'

import { signJwt } from './signJwt'
import { verifyJwt } from './verifyJwt'

test('Should verify JWT', async () => {
  const encodedToken = await signJwt({ data: { } })
  const token = await verifyJwt(encodedToken)
  expect(token).toEqual({
    iat: expect.any(Number),
    iss: 'readapt-plugin-auth',
  })
})
