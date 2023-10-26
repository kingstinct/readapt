import type { CodegenConfig } from '@graphql-codegen/cli'
import type { Types } from '@graphql-codegen/plugin-helpers'

const defaultSchema: Types.InstanceOrArray<Types.Schema> = [
  `./graphql/**/*.graphql`,
  '!./graphql/client.generated/**/*',
]
const defaultClientOutputPath = `./graphql/client.generated/`
const defaultServerOutputPath = `./graphql/schema.generated.ts`

export const createClientConfig = ({
  schema = defaultSchema,
  outputPath = defaultClientOutputPath,
}: { readonly schema?: Types.InstanceOrArray<Types.Schema>, readonly outputPath?: string }) => ({
  schema,
  ignoreNoDocuments: true,
  generates: {
    [outputPath]: {
      documents: [
        `./**/*.tsx`,
        `./**/*.ts`,
        `./*.tsx`,
        `./*.ts`,
        `!./**/*.generated.ts`,
        `!./node_modules/**/*`,
      ],
      plugins: [
        {
          add: {
            placement: 'prepend',
            content: `// @ts-nocheck`,
          },
        },
      ],
      preset: 'client',
    },
  },
}) satisfies CodegenConfig

const createServerConfig = ({
  schema = defaultSchema,
  outputPath = defaultServerOutputPath,
}: { readonly schema?: Types.InstanceOrArray<Types.Schema>, readonly outputPath?: string }) => ({
  schema,
  ignoreNoDocuments: true,
  generates: {
    [outputPath]: {
      config: {
        useIndexSignature: true,
        contextType: 'Zemble.GraphQLContext',
        immutableTypes: true,
        directiveContextTypes: ['auth#Zemble.AuthContextWithToken'],
        showUnusedMappers: true,
      },
      plugins: [
        {
          add: {
            placement: 'prepend',
            content: `// @ts-nocheck
import '@zemble/core'`,
          },
        },
        'typescript',
        'typescript-resolvers',
      ],
    },
  },
} satisfies CodegenConfig)

const serverConfig = createServerConfig({})
const clientConfig = createClientConfig({})

const config = {
  ...serverConfig,
  ...clientConfig,
  generates: {
    ...serverConfig.generates,
    ...clientConfig.generates,
  },
} satisfies CodegenConfig

export default config