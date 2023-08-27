/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable react-hooks/rules-of-hooks */

import { useExtendContext } from '@envelop/core'
import { useGenericAuth } from '@envelop/generic-auth'
import { Plugin } from '@readapt/core'
import graphqlYoga from '@readapt/graphql-yoga'
import {
  getCookie,
} from 'hono/cookie'
import { decodeToken } from 'readapt-plugin-auth/utils/isValid'

import type { CookieOptions } from 'hono/dist/types/utils/cookie'

interface AnonymousAuthConfig extends Readapt.GlobalConfig {
  readonly headerName?: string
  readonly cookies?: {
    readonly name?: string
    readonly isEnabled?: boolean
    readonly opts?: () => CookieOptions
  }
}

const defaultConfig = {
  headerName: 'authorization',
  cookies: {
    name: 'authorization',
    isEnabled: true as boolean,
    opts: () => ({
      sameSite: 'Lax',
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV !== 'development',
      // domain: 'localhost:3000',
      expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2), // 2 days
    }),
  },
} satisfies AnonymousAuthConfig

const plugin = new Plugin<AnonymousAuthConfig, typeof defaultConfig>(__dirname, {
  dependencies: ({ config }) => {
    const gql = graphqlYoga.configure({
      yoga: {
        plugins: [
          useExtendContext((context: Readapt.GraphQLContext) => {
            const headerName = config.headerName ?? 'authorization',
                  headerToken = context.request.headers.get(headerName)?.split(' ')[1],
                  cookieToken = config.cookies.isEnabled !== false ? getCookie(context.honoContext)[config.cookies.name] : undefined,
                  token = headerToken ?? cookieToken,
                  decodedToken = token ? decodeToken(token) : undefined

            return {
              token,
              decodedToken,
            }
          }),
          useGenericAuth<Readapt.TokenContents, Readapt.GraphQLContext>({
            resolveUserFn: (context) => context.decodedToken,
            mode: 'protect-all',
          }),
        ],
      },
    })

    return [
      {
        plugin: gql,
      },
    ]
  },
  defaultConfig,
})

export const { config } = plugin

export default plugin
