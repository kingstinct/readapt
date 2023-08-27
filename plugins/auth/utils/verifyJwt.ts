import { verify } from 'jsonwebtoken'

import plugin from '../plugin'

const { PUBLIC_KEY } = plugin.config

export function verifyJwt(token: string, publicKey?: string) {
  const actualPublicKey = publicKey ?? PUBLIC_KEY
  if (!actualPublicKey) {
    throw new Error('PUBLIC_KEY not set')
  }

  return verify(token, actualPublicKey, { algorithms: ['RS256'] }) as Readapt.DecodedToken
}
