/* eslint-disable react-hooks/rules-of-hooks */
import { useExtendContext } from '@envelop/core'
import { UnauthenticatedError, useGenericAuth } from '@envelop/generic-auth'
import {
  FilterRootFields,
} from '@graphql-tools/wrap'
import { Plugin } from '@readapt/core'
import graphqlYoga from '@readapt/graphql-yoga'
import { Kind } from 'graphql'
import { getCookie } from 'hono/cookie'

import { decodeToken } from './utils/decodeToken'

import type {
  ExecutionArgs, FieldNode, GraphQLObjectType, ObjectValueNode, ValueNode,
} from 'graphql'
import type { CookieOptions } from 'hono/utils/cookie'

const { PUBLIC_KEY, PRIVATE_KEY } = process.env
const ISSUER = process.env.ISSUER ?? 'readapt-plugin-auth'

interface AuthConfig extends Readapt.GlobalConfig {
  readonly PUBLIC_KEY?: string;
  readonly PRIVATE_KEY?: string;
  readonly ISSUER?: string;
  readonly headerName?: string
  readonly cookies?: {
    readonly name?: string
    readonly isEnabled?: boolean
    readonly opts?: () => CookieOptions
  }
}

const defaultConfig = {
  PUBLIC_KEY,
  PRIVATE_KEY,
  ISSUER,
  headerName: 'authorization',
  graphqlSchemaTransforms: process.env.PLUGIN_DEV || process.env.NODE_ENV === 'test'
    ? []
    : [
      new FilterRootFields((
        op, opName,
      ) => op === 'Query' && [
        'validateJWT',
        'readJWT',
        'publicKey',
      ].includes(opName)),
    ],
  cookies: {
    name: 'authorization',
    isEnabled: true as boolean,
    opts: () => ({
      sameSite: 'Lax',
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV !== 'development',
      expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2), // 2 days
    }),
  },
} satisfies AuthConfig

const getVariableReferenceSimple = (
  referenceWithPrefix: string, {
    fieldNode,
    objectType,
    executionArgs,
  }: { readonly fieldNode: FieldNode; readonly objectType: GraphQLObjectType; readonly executionArgs: ExecutionArgs },
) => {
  const variableName = referenceWithPrefix.substring(1)

  const argument = fieldNode.arguments?.find(
    (arg) => arg.name.value === variableName,
  )

  if (!argument) {
    throw new Error(`Could not find argument '${variableName}' in '${objectType.name}.${fieldNode?.name.value}'`)
  }

  if ('value' in argument.value) {
    const valueToMatch = argument.value.value
    return valueToMatch
  } if (argument.value.kind === Kind.VARIABLE) {
    const valueFromVariable = executionArgs?.variableValues?.[argument.value.name.value]

    return valueFromVariable
  }

  // more to handle here
  return null
}

const handleValueNode = (
  value: ValueNode, {
    fieldNode,
    objectType,
    executionArgs,
  }: { readonly fieldNode: FieldNode; readonly objectType: GraphQLObjectType; readonly executionArgs: ExecutionArgs },
): unknown => {
  if (value.kind === Kind.STRING) {
    if (value.value.startsWith('$')) {
      return getVariableReferenceSimple(value.value, { fieldNode, objectType, executionArgs })
    }
    return value.value
  }
  if (value.kind === Kind.OBJECT) {
    return transformObjectNode(value, { executionArgs, fieldNode, objectType })
  }
  if (value.kind === Kind.LIST) {
    return value.values.map((v) => handleValueNode(v, { executionArgs, fieldNode, objectType }))
  }
  if (value.kind === Kind.NULL) {
    return null
  }
  if (value.kind === Kind.BOOLEAN) {
    return value.value
  }
  if (value.kind === Kind.INT) {
    return parseInt(value.value, 10)
  }
  if (value.kind === Kind.FLOAT) {
    return parseFloat(value.value)
  }
  if (value.kind === Kind.ENUM) {
    return value.value
  }

  const valueFromVariable = executionArgs?.variableValues?.[value.name.value]
  return valueFromVariable
}

const transformObjectNode = (
  objectNode: ObjectValueNode,
  {
    fieldNode,
    objectType,
    executionArgs,
  }: { readonly fieldNode: FieldNode; readonly objectType: GraphQLObjectType; readonly executionArgs: ExecutionArgs },
): Record<string, unknown> => {
  const { fields } = objectNode
  return fields.reduce((acc, field) => ({
    ...acc,
    [field.name.value]: handleValueNode(field.value, { executionArgs, fieldNode, objectType }),
  }), {})
}

const plugin = new Plugin<AuthConfig, typeof defaultConfig>(__dirname, {
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
          useGenericAuth<object, Readapt.GraphQLContext>({
            resolveUserFn: (context) => context.decodedToken,
            validateUser: ({
              fieldAuthDirectiveNode, user, fieldNode, objectType, executionArgs,
            }) => {
              if (!user) {
                let skipValidation = false
                const skipArg = fieldAuthDirectiveNode?.arguments?.find(
                  (arg) => arg.name.value === 'skip',
                )

                if (skipArg?.value.kind === 'BooleanValue') {
                  skipValidation = skipArg.value.value
                }

                if (!skipArg) {
                  return new UnauthenticatedError(`Accessing '${objectType.name}.${fieldNode?.name.value}' requires authentication.`)
                }
              }

              const matchArg = fieldAuthDirectiveNode?.arguments?.find(
                (arg) => arg.name.value === 'match',
              )

              if (matchArg?.value.kind === 'ObjectValue') {
                const matcher = transformObjectNode(matchArg.value, { executionArgs, fieldNode, objectType })

                // @ts-expect-error can be improved
                const isValid = user && Object.entries(matcher).every(([key, value]) => user[key] === value)

                if (!isValid) {
                  return new UnauthenticatedError(`Accessing '${objectType.name}.${fieldNode?.name.value}' requires token matching ${JSON.stringify(matcher)}.`)
                }
              }

              const includesArg = fieldAuthDirectiveNode?.arguments?.find(
                (arg) => arg.name.value === 'includes',
              )

              if (includesArg?.value.kind === 'ObjectValue') {
                const matcher = transformObjectNode(includesArg.value, { executionArgs, fieldNode, objectType })

                const isValid = user && Object.entries(matcher).every(([arrayName, value]) => {
                  // @ts-expect-error can be improved
                  const arrayVal = user[arrayName]
                  if (Array.isArray(arrayVal)) {
                    return arrayVal.some((v) => {
                      if (value && typeof value === 'object') {
                        return Object.entries(value).every(([key, val]) => v[key] === val)
                      }
                      return v === value
                    })
                  }
                  throw new Error(`'${objectType.name}.${fieldNode?.name.value}' includes matcher can only be used on arrays.`)
                })

                if (!isValid) {
                  return new UnauthenticatedError(`Accessing '${objectType.name}.${fieldNode?.name.value}' requires token including arrays matching ${JSON.stringify(matcher)}.`)
                }
              }

              return undefined
            },
            mode: 'protect-all',
            directiveOrExtensionFieldName: 'auth',
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

export default plugin
