/* eslint-disable no-param-reassign */
/* eslint-disable functional/immutable-data */
import { envelop } from '@envelop/core'
import { mergeSchemas } from '@graphql-tools/schema'
import { printSchemaWithDirectives } from '@graphql-tools/utils'
import { type GraphQLFormattedError, type GraphQLScalarType } from 'graphql'
import { print } from 'graphql/language/printer'
import fs from 'node:fs'
import path from 'node:path'
import { useSofa } from 'sofa-api'

import createPubSub from './createPubSub'
import createPluginSchema from './utils/createPluginSchema'
import handleYoga from './utils/handleYoga'

import type { GraphQLMiddlewareConfig } from './plugin'
import type { Subschema } from '@graphql-tools/delegate'
import type { TypedDocumentNode, ResultOf } from '@graphql-typed-document-node/core'
import type { Plugin } from '@zemble/core'
import type { Middleware } from '@zemble/core/types'
import type {
  GraphQLSchemaWithContext,
} from 'graphql-yoga'

const processPluginSchema = async (pluginPath: string, {
  transforms,
  scalars,
  skipGraphQLValidation,
}: { readonly transforms: Subschema['transforms'], readonly scalars: Record<string, GraphQLScalarType>, readonly skipGraphQLValidation?: boolean }) => {
  const graphqlDir = path.join(pluginPath, '/graphql')
  const hasGraphQL = fs.existsSync(graphqlDir)
  if (hasGraphQL) {
    return [
      await createPluginSchema({
        graphqlDir,
        transforms,
        scalars,
        skipGraphQLValidation: !!skipGraphQLValidation,
      }),
    ]
  }
  return []
}

async function gqlRequestUntyped<TRes, TVars>(
  app: Zemble.App,
  query: string,
  variables: TVars,
  options?: {readonly headers?: Record<string, string>, readonly silenceErrors?: boolean},
) {
  const response = await app.fetch(new Request('http://localhost/graphql', {
    method: 'POST',
    body: JSON.stringify({
      query,
      variables,
    }),
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  }))

  const { data, errors } = await response.json() as unknown as {
    readonly data?: TRes,
    readonly errors: readonly GraphQLFormattedError[]
  }

  if (errors && !options?.silenceErrors) {
    console.error(errors)
  }

  return { data, errors, response }
}

async function gqlRequest<TQuery, TVars>(
  app: Zemble.App,
  query: TypedDocumentNode<TQuery, TVars>,
  variables: TVars,
  options: {readonly headers?: Record<string, string>, readonly silenceErrors?: boolean} = {},
) {
  const response = new Request('http://localhost/graphql', {
    method: 'POST',
    body: JSON.stringify({
      query: print(query),
      variables,
    }),
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  const res = await app.fetch(response)

  const { errors, data } = await res.json() as unknown as {
    readonly data?: ResultOf<TQuery>,
    readonly errors: readonly GraphQLFormattedError[]
  }

  if (errors && !options?.silenceErrors) {
    console.error(errors)
  }

  return { errors, data, response }
}

const buildMergedSchema = async (
  plugins: readonly Plugin[],
  config: GraphQLMiddlewareConfig,
) => {
  const isPlugin = plugins.some(({ pluginPath }) => pluginPath === process.cwd())
  const selfSchemas: readonly GraphQLSchemaWithContext<Zemble.GraphQLContext>[] = [
    // don't load if we're already a plugin
    ...!isPlugin
      ? await processPluginSchema(process.cwd(), { transforms: [], scalars: config.scalars || {}, skipGraphQLValidation: false })
      : [],
    // eslint-disable-next-line no-nested-ternary
    ...(config.extendSchema
      ? (typeof config.extendSchema === 'function'
        ? await config.extendSchema()
        : config.extendSchema
      )
      : []),
  ]

  const pluginsToAdd = plugins.filter(({ config }) => !config.middleware?.['@zemble/graphql']?.disable)

  // eslint-disable-next-line @typescript-eslint/await-thenable
  const graphQLSchemas = await pluginsToAdd.reduce(async (
    prev,
    { pluginPath, config: traversedPluginConfig },
  ) => {
    const graphqlSchemaTransforms = traversedPluginConfig.middleware?.['@zemble/graphql']?.graphqlSchemaTransforms
    // eslint-disable-next-line functional/prefer-readonly-type
    const toReturn: GraphQLSchemaWithContext<Zemble.GraphQLContext>[] = [
      ...await prev,
      ...await processPluginSchema(pluginPath, {
        transforms: graphqlSchemaTransforms ?? [],
        scalars: config.scalars || {},
        // skipGraphQLValidation: true, // skip validation so we don't need to provide root queries for plugins where it doesn't make sense
      }),
    ]

    return toReturn
  }, Promise.resolve(selfSchemas))

  const mergedSchema = mergeSchemas({
    // eslint-disable-next-line functional/prefer-readonly-type
    schemas: graphQLSchemas as unknown as GraphQLSchemaWithContext<Zemble.GraphQLContext>[],
    resolverValidationOptions: {
      // requireResolversForArgs: 'warn',
    },
  })

  return mergedSchema
}

export const middleware: Middleware<GraphQLMiddlewareConfig> = (
  {
    config, app, context, plugins,
  },
) => {
  const pubsub = createPubSub(
    config.redisUrl,
    config.redisOptions,
  )

  // @ts-expect-error sdfgsdfg
  app.gqlRequest = async (query, vars, opts) => {
    const response = await gqlRequest(app, query, vars, opts)

    return response
  }

  // @ts-expect-error sdfgsdfg
  app.gqlRequestUntyped = async (untypedQuery: string, vars, opts) => {
    const response = await gqlRequestUntyped(app, untypedQuery, vars, opts)
    return response
  }

  const getGlobalContext = () => {
    if (config.yoga?.context) {
      const ctx = typeof config.yoga.context === 'function'
        ? config.yoga.context(context)
        : { ...context, ...(config.yoga.context as object) }
      ctx.pubsub = pubsub
      return ctx
    }
    // eslint-disable-next-line no-unused-expressions
    context.pubsub = pubsub

    return context
  }

  const handlerPromise = handleYoga(
    async () => {
      const mergedSchema = await buildMergedSchema(plugins, config)

      if (config.outputMergedSchemaPath) {
        const resolvedPath = path.isAbsolute(config.outputMergedSchemaPath)
          ? config.outputMergedSchemaPath
          : path.join(process.cwd(), config.outputMergedSchemaPath)

        void fs.promises.writeFile(resolvedPath, printSchemaWithDirectives(mergedSchema))
      }

      return mergedSchema
    },
    pubsub,
    context.logger,
    {
      ...config.yoga,
      graphiql: async (req, context) => {
        const resolved = (typeof config.yoga?.graphiql === 'function'
          ? await config.yoga?.graphiql?.(req, context)
          : (config.yoga?.graphiql ?? {}))
        return ({
          credentials: 'include',
          ...typeof resolved === 'boolean' ? {} : resolved,
        })
      },
      // eslint-disable-next-line no-nested-ternary
      context: getGlobalContext(),
    },
  )

  if (config.sofa) {
    const urlPath = config.sofa.basePath ?? '/api'

    const enveloped = envelop({
      plugins: config.yoga?.plugins ?? [],
    })

    app.all(
      path.join('/', urlPath, '/*'),
      async (ctx) => {
        const mergedSchema = await buildMergedSchema(plugins, config)
        const res = await useSofa({
          basePath: path.join('/', urlPath),
          schema: mergedSchema,
          subscribe: async (args) => enveloped(args.contextValue ?? {}).subscribe(args),
          execute: async (args) => enveloped(args.contextValue ?? {}).execute(args),
          context: getGlobalContext(),
          ...config.sofa,
          openAPI: {
            endpoint: '/openapi.json',
            ...(config.sofa?.openAPI ?? {}),
          },
          swaggerUI: {
            endpoint: '/docs',
            ...(config.sofa?.swaggerUI ?? {}),
          },
        })(ctx.req.raw)
        return ctx.body(res.body, res.status, res.headers.toJSON())
      },
    )
  }

  app.use('*', async (ctx) => {
    ctx.env.pubsub = pubsub
  })

  app.use(config!.yoga!.graphqlEndpoint!, async (ctx) => {
    const handler = await handlerPromise

    return handler(ctx)
  })
}

export default middleware
