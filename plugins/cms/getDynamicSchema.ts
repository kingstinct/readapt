/* eslint-disable @typescript-eslint/no-explicit-any */

import Dataloader from 'dataloader'
import {
  GraphQLObjectType, GraphQLSchema,
  GraphQLString, GraphQLList,
  GraphQLNonNull, GraphQLID,
  GraphQLFloat, GraphQLBoolean,
  GraphQLUnionType, Kind,
  GraphQLInputObjectType,
} from 'graphql'
import { ObjectId } from 'mongodb'

import {
  Entities,
  Content,
  connect,
} from './clients/papr'
import {
  capitalize,
} from './utils'

import type {
  ArrayFieldType,
  EntityRelationType,
  EntityType,
} from './clients/papr'
import type {
  BooleanField,
  IdField,
  EntityRelationField,
  NumberField,
  ArrayField,
  StringField,
} from './graphql/schema.generated'
import type {
  GraphQLFieldConfig,
  GraphQLOutputType,
  GraphQLScalarType,
  GraphQLInputObjectTypeConfig,
  GraphQLEnumType,
} from 'graphql'

type ReducerType = {
  readonly query: Record<string, GraphQLFieldConfig<any, any, any>>,
  readonly types: readonly (GraphQLObjectType<any, any> | GraphQLEnumType)[],
  readonly mutations: Record<string, GraphQLFieldConfig<any, any, any>>,
}

type IField = NumberField | StringField | BooleanField | IdField | EntityRelationType | ArrayFieldType

let types: Record<string, GraphQLUnionType | GraphQLObjectType> = {}

function typeDeduper<T extends GraphQLUnionType | GraphQLObjectType>(type: T): T {
  if (types[type.name]) {
    return types[type.name] as T
  }
  // eslint-disable-next-line functional/immutable-data
  types[type.name] = type
  return type
}

const mapRelationField = (entityName: string, data: string) => ({ __typename: `${capitalize(entityName)}Relation`, externalId: data })

const fieldToOutputType = (
  typePrefix: string,
  field: IField,
  relationTypes: Record<string, GraphQLObjectType>,
): GraphQLScalarType | GraphQLList<GraphQLOutputType> | GraphQLObjectType => {
  switch (field.__typename) {
    case 'NumberField':
      return GraphQLFloat
    case 'BooleanField':
      return GraphQLBoolean
    case 'IDField':
      return GraphQLID
    case 'ArrayField':
      // eslint-disable-next-line no-case-declarations
      const availableFields = field.availableFields.map((f) => {
        const resolvedType = fieldToOutputType(typePrefix, f as any, relationTypes)

        return typeDeduper(new GraphQLObjectType({
          name: `${capitalize(typePrefix)}${capitalize(field.name)}${capitalize(f.name)}`.replaceAll(' ', '_'),
          fields: {
            [f.name.replaceAll(' ', '_')]: {
              type: resolvedType,
            },
          },
        }))
      })

      // eslint-disable-next-line no-case-declarations
      const union = typeDeduper(new GraphQLUnionType({
        name: `${capitalize(typePrefix)}${capitalize(field.name)}Union`.replaceAll(' ', '_'),
        types: availableFields,
      }))
      return new GraphQLList(union)
    case 'EntityRelationField':
      // eslint-disable-next-line no-case-declarations
      const relatedType = relationTypes[field.entityName]

      // just fallback to something if there is no type, for now
      return relatedType ? typeDeduper(relatedType) : GraphQLString
    default:
      return GraphQLString
  }
}

const fieldToInputType = (typePrefix: string, field: IField): GraphQLScalarType | GraphQLList<GraphQLInputObjectType> | GraphQLInputObjectType => {
  switch (field.__typename) {
    case 'NumberField':
      return GraphQLFloat
    case 'BooleanField':
      return GraphQLBoolean
    case 'IDField':
      return GraphQLID
    case 'EntityRelationField':
      return GraphQLID
    case 'ArrayField':
      // eslint-disable-next-line no-case-declarations
      const availableFields = field.availableFields.reduce<GraphQLInputObjectTypeConfig>((prev, f) => ({
        ...prev,
        fields: {
          ...prev.fields,
          [f.name.replaceAll(' ', '_')]: {
            type: fieldToInputType(typePrefix, f as any),
          },
        },
      }), {
        name: `${capitalize(typePrefix)}${capitalize(field.name)}Input`,
        fields: {},
        extensionASTNodes: [
          {
            name: {
              kind: Kind.NAME,
              value: 'extension',
            },
            directives: [
              {
                kind: Kind.DIRECTIVE,
                name: {
                  kind: Kind.NAME,
                  value: 'oneOf',
                },
              },
            ],
            kind: Kind.INPUT_OBJECT_TYPE_EXTENSION,
          },
        ],
      } as GraphQLInputObjectTypeConfig)
      return new GraphQLList(new GraphQLInputObjectType(availableFields))
    default:
      return GraphQLString
  }
}

// modifies input data so it can be saved to the db
const createTraverser = (entity: EntityType) => {
  const fields = Object.values(entity.fields)
  const arrayFieldNames = new Set(fields.filter((f) => f.__typename === 'ArrayField').map((f) => f.name))
  const entityRelationFieldNamesWithEntity = {
    ...fields.filter((f) => f.__typename === 'EntityRelationField').reduce((prev, f) => ({
      ...prev,
      [f.name]: (f as EntityRelationField).entityName,
    }), {} as Record<string, string>),

    // get those deep entity relation fields, could probaby be cleaned up
    ...fields.filter((f) => f.__typename === 'ArrayField').reduce((prev, f) => ({
      ...(f as unknown as ArrayField).availableFields.filter((f) => (f as IField).__typename === 'EntityRelationField').reduce((prev, f) => ({
        ...prev,
        [f.name.replaceAll(' ', '_')]: (f as EntityRelationField).entityName,
      }), prev),
    }), {} as Record<string, string>),
  }

  // eslint-disable-next-line arrow-body-style
  const fieldValueMapper = (key: string, data: Record<string, unknown>) => {
  // eslint-disable-next-line no-nested-ternary
    return arrayFieldNames.has(key)
      ? mapArrayFields(key, data[key] as Record<string, unknown> | readonly Record<string, unknown>[]) : (entityRelationFieldNamesWithEntity[key]
        ? mapRelationField(entityRelationFieldNamesWithEntity[key], data[key] as string)
        : data[key])
  }

  const traverseData = (data: Record<string, unknown>) => Object.keys(data).reduce((prev, key) => ({
    ...prev,
    // eslint-disable-next-line no-nested-ternary
    [key]: fieldValueMapper(key, data),
  }), {} as Record<string, unknown>)

  const mapArrayFields = (
    fieldName: string,
    data: Record<string, unknown> | readonly Record<string, unknown>[],
  ) => (Array.isArray(data) ? data : [data]).map((el: Record<string, unknown>): Record<string, unknown> => ({
    __typename: (capitalize(entity.name) + capitalize(fieldName) + capitalize(Object.keys(el)[0])).replaceAll(' ', '_'),
    ...traverseData(el),
  }))

  return traverseData
}

export default async () => {
  if (process.env.NODE_ENV !== 'test') {
    await connect()
  }

  const entities = await Entities.find({})

  types = {}

  const resolveRelationTypes = (initialTypes: Record<string, GraphQLObjectType>) => entities.reduce((acc, entity) => {
    const getById = new Dataloader(async (ids: readonly string[]) => {
      const entries = await Content.find({ entityType: entity.name, _id: { $in: ids.map((id) => new ObjectId(id)) } })

      return ids.map((id) => entries.find((entry) => entry._id.toHexString() === id))
    })

    const objRelation = new GraphQLObjectType({
      fields: () => Object.values(entity.fields).reduce((prev, field) => {
        const baseType = fieldToOutputType(entity.name, field, acc)
        return ({
          ...prev,
          [field.name]: {
            type: field.isRequiredInput ? new GraphQLNonNull(baseType) : baseType,
            resolve: async (parent: { readonly externalId: string }) => {
              const id = parent.externalId
              const resolved = await getById.load(id)
              // @ts-expect-error fix sometime
              return resolved[field.name]
            },
          },
        })
      }, {}),
      name: `${capitalize(entity.name)}Relation`,
    })

    return {
      ...acc,
      [entity.name]: objRelation,
    }
  }, initialTypes)

  // some way to resolve the deep types
  let relationTypes = resolveRelationTypes({})
  relationTypes = resolveRelationTypes(relationTypes)

  const config = await entities.reduce(async (prevP, entity) => {
    const prev = await prevP
    const obj = new GraphQLObjectType({
      fields: Object.values(entity.fields).reduce((prev, field) => {
        const baseType = fieldToOutputType(entity.name, field, relationTypes)
        return ({
          ...prev,
          [field.name]: {
            type: field.isRequiredInput ? new GraphQLNonNull(baseType) : baseType,
            resolve: (props: { readonly _id: ObjectId } & Record<string, unknown>) => (
              field.name === 'id'
                ? props._id.toHexString()
                : (props[field.name] ?? ('defaultValue' in field
                  ? field.defaultValue
                  : null)
                )
            ),
          },
        })
      }, {}),
      name: capitalize(entity.name).replaceAll(' ', '_'),
    })

    const getById: GraphQLFieldConfig<unknown, unknown, {readonly id: string}> = { // "book"
      type: new GraphQLNonNull(obj),
      args: {
        id: {
          type: new GraphQLNonNull(GraphQLID),
        },
      },
      resolve: async (_, { id }) => Content.findOne({ entityType: entity.name, _id: new ObjectId(id) }),
    } as const

    const getAll: GraphQLFieldConfig<unknown, unknown, unknown> = { // "books"
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(obj))),
      resolve: async () => Content.find({ entityType: entity.name }),
    }

    const search: GraphQLFieldConfig<unknown, unknown, {
      readonly query: string,
      readonly caseSensitive?: boolean,
      readonly diacriticSensitive?: boolean,
      readonly language?: string,
    }> = { // "books"
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(obj))),
      args: {
        query: { type: new GraphQLNonNull(GraphQLString) },
        caseSensitive: { type: GraphQLBoolean },
        diacriticSensitive: { type: GraphQLBoolean },
        language: { type: GraphQLString },
      },
      resolve: async (_, {
        query, caseSensitive, diacriticSensitive, language,
      }) => Content.find({
        entityType: entity.name,
        $text: {
          $search: query, $caseSensitive: caseSensitive ?? false, $diacriticSensitive: diacriticSensitive ?? false, $language: language,
        },
      }),
    }

    const createEntityEntry: GraphQLFieldConfig<unknown, unknown, Record<string, unknown> & { readonly id: string }> = {
      type: obj,
      args: Object.values(entity.fields).reduce((prev, field) => {
        const baseType = fieldToInputType(entity.name, field)

        return ({
          ...prev,
          [field.name]: {
            type: field.isRequiredInput && field.__typename !== 'IDField' ? new GraphQLNonNull(baseType) : baseType,
          },
        })
      }, {}),
      resolve: async (_, { id, ...input }) => {
        const mappedData = createTraverser(entity)(input)

        const _id = id ? new ObjectId(id) : new ObjectId()

        const res = await Content.findOneAndUpdate({
          _id,
          entityType: entity.name,
        }, {
          $set: {
            entityType: entity.name,
            ...mappedData,
          },
          $setOnInsert: { _id },
        }, {
          upsert: true,
          returnDocument: 'after',
        })

        return res!
      },
    }

    const deleteEntityEntry: GraphQLFieldConfig<unknown, unknown, { readonly id: string }> = {
      type: new GraphQLNonNull(GraphQLBoolean),
      args: {
        id: {
          type: new GraphQLNonNull(GraphQLString),
        },
      },
      resolve: async (_, { id }) => {
        await Content.findOneAndDelete({
          entityType: entity.name,
          _id: new ObjectId(id),
        })
        return true
      },
    }

    const retVal: ReducerType = {
      query: {
        ...prev.query,
        [`getAll${capitalize(entity.pluralizedName)}`]: getAll,
        [`search${capitalize(entity.pluralizedName)}`]: search,
        [`get${capitalize(entity.name)}ById`]: getById,
      },
      types: [...prev.types],
      mutations: {
        ...prev.mutations,
        [`create${capitalize(entity.name)}`]: createEntityEntry,
        [`delete${capitalize(entity.name)}`]: deleteEntityEntry,
      },
    }
    return retVal
  }, Promise.resolve<ReducerType>({
    query: {},
    types: [
      /* new GraphQLEnumType({
      name: 'EntityEnum',
      values: entities.reduce((prev, entity) => ({
        ...prev,
        [entity.name.toUpperCase()]: {
          value: entity.name,
        },
      }), {}),
      values:  {
      a: { value: 'a' },
       },
       }), */
    ],
    mutations: {},
  }))

  const schema = new GraphQLSchema({
    types: config.types,
    query: new GraphQLObjectType({
      name: 'Query',
      fields: {
        ...config.query,
      },
    }),
    mutation: new GraphQLObjectType({
      name: 'Mutation',
      fields: {
        ...config.mutations,
      },
    }),
  })

  return schema
}
