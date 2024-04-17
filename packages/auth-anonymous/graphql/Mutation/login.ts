/* eslint-disable @typescript-eslint/no-namespace */
import authPlugin from 'zemble-plugin-auth'
import { encodeToken } from 'zemble-plugin-auth/utils/encodeToken'
import { setBearerTokenCookie } from 'zemble-plugin-auth/utils/setBearerTokenCookie'

import plugin from '../../plugin'

import type { MutationResolvers } from '../schema.generated'

const login: MutationResolvers['login'] = async (_: unknown, __, { honoContext }) => {
  const userId = plugin.config.generateUserId()
  const bearerToken = await encodeToken(plugin.config.generateTokenContents(userId))

  if (authPlugin.config.cookies.isEnabled) {
    setBearerTokenCookie(honoContext, bearerToken)
  }

  return { token: bearerToken }
}

export default login
