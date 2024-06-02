import { loginRequestKeyValue } from '../../clients/loginRequestKeyValue'
import plugin from '../../plugin'
import getTwoFactorCode from '../../utils/getTwoFactorCode'
import { isValidEmail } from '../../utils/isValidEmail'

import type { MutationResolvers } from '../schema.generated'

export const emailLoginRequest: NonNullable<MutationResolvers['emailLoginRequest']> = async (_, {
  email: emailInput,
}, context) => {
  if (!isValidEmail(emailInput)) {
    return { message: 'Not a valid email', __typename: 'EmailNotValidError' }
  }

  const email = emailInput.toLowerCase().trim()

  const whitelistedEmailFromDomain = plugin.config.WHITELISTED_SIGNUP_EMAIL_DOMAINS?.includes(emailInput.split('@')[1]!)

  const validatedEmailFromWhitelist = plugin.config.WHITELISTED_SIGNUP_EMAILS?.includes(email)

  const hasWhitelist = plugin.config.WHITELISTED_SIGNUP_EMAILS || plugin.config.WHITELISTED_SIGNUP_EMAIL_DOMAINS

  if (hasWhitelist && !whitelistedEmailFromDomain && !validatedEmailFromWhitelist) {
    return {
      message: 'Email not whitelisted',
      __typename: 'EmailNotValidError',
    }
  }

  const existing = await loginRequestKeyValue().get(email)

  if (existing?.loginRequestedAt) {
    const { loginRequestedAt } = existing,
          timeUntilAllowedToSendAnother = new Date(loginRequestedAt).valueOf() + (plugin.config.minTimeBetweenTwoFactorCodeRequestsInSeconds * 1000) - Date.now()

    if (timeUntilAllowedToSendAnother > 0) {
      return {
        success: false,
        __typename: 'LoginRequestSuccessResponse',
      }
    }
  }

  const twoFactorCode = getTwoFactorCode()

  await loginRequestKeyValue().set(email, {
    loginRequestedAt: new Date().toISOString(),
    twoFactorCode,
  }, plugin.config.twoFactorCodeExpiryInSeconds)

  await plugin.config.handleEmailAuthRequest({ email: emailInput }, twoFactorCode, context)

  return {
    __typename: 'LoginRequestSuccessResponse',
    success: true,
  }
}

export default emailLoginRequest
