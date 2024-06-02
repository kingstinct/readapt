import Auth from '@zemble/auth'
import { generateRefreshToken } from '@zemble/auth/utils/generateRefreshToken'
import { setTokenCookies } from '@zemble/auth/utils/setBearerTokenCookie'
import { signJwt } from '@zemble/auth/utils/signJwt'

import { loginRequestKeyValue } from '../clients/loginRequestKeyValue'
import plugin from '../plugin'

const getTokens = async (code: string, emailOrPhone: string, honoContext: Zemble.RouteContext) => {
  if (code.length !== 6) {
    return { __typename: 'CodeNotValidError' as const, message: 'Code should be 6 characters' }
  }

  const entry = await loginRequestKeyValue().get(emailOrPhone.toLowerCase())

  if (!entry) {
    return { __typename: 'CodeNotValidError' as const, message: 'Must loginRequest code first, it might have expired' }
  }

  if (entry?.twoFactorCode !== code) {
    return { __typename: 'CodeNotValidError' as const, message: 'Code not valid' }
  }

  const { sub, ...data } = await plugin.config.generateTokenContents({ emailOrPhone })

  const bearerToken = await signJwt({
    data,
    expiresInSeconds: Auth.config.bearerTokenExpiryInSeconds,
    sub,
  })

  const refreshToken = await generateRefreshToken({ sub })

  if (Auth.config.cookies.isEnabled) {
    setTokenCookies(honoContext, bearerToken, refreshToken)
  }

  return {
    __typename: 'LoginConfirmSuccessfulResponse' as const,
    bearerToken,
    refreshToken,
  }
}

export default getTokens