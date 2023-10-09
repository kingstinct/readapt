/* eslint-disable functional/immutable-data */
import { Formik } from 'formik'
import { useCallback, useMemo } from 'react'
import {
  View, Text, Switch,
} from 'react-native'
import { Button, TextInput } from 'react-native-paper'
import { useMutation, useQuery } from 'urql'

import { styles } from '../style'
import getSelectionSet from '../utils/getSelectionSet'
import { capitalize } from '../utils/text'

import type { GetEntityByPluralizedNameQuery } from '../gql/graphql'

const fieldToTypeMap: Record<string, string> = {
  StringField: 'String',
  NumberField: 'Float',
  BooleanField: 'Boolean',
  IDField: 'ID',
  // ArrayField: 'Array',
  // ObjectRelationField: 'Object',
}

type Entity = NonNullable<GetEntityByPluralizedNameQuery['getEntityByPluralizedName']>

const buildCreateEntryMutation = (entity: Entity) => {
  const { fields } = entity

  const mutationName = `create${capitalize(entity.name)}`

  const mutationInputVariables = fields.map((f) => (`$${f.name}: ${fieldToTypeMap[f.__typename]}${f.isRequired && f.name !== 'id' ? '!' : ''}`)).join(', ')

  const mutationVariables = fields.map((f) => `${f.name}: $${f.name}`).join(', ')

  const createEntryStr = `mutation CreateEntry(${mutationInputVariables}) 
  { ${mutationName}(${mutationVariables})
    { 
      id 
    } 
  }`

  return createEntryStr
}

const CreateEntry: React.FC<{
  readonly entity: Entity,
  readonly previousEntryId?: string,
  readonly onUpdated?: () => void,
}> = ({
  entity,
  previousEntryId,
  onUpdated,
}) => {
  const { fields } = entity

  const selectionSet = getSelectionSet(entity.name, fields)

  const queryName = `get${capitalize(entity.name)}ById`

  const [{ data }] = useQuery({
    query: `query GetEntity { ${queryName}(id: "${previousEntryId}") { ${selectionSet.join(' ')} } }`,
    variables: {},
    pause: !previousEntryId,
  })

  const previousEntry = previousEntryId ? (data?.[queryName]as Record<string, unknown> | undefined) : undefined

  const [, createEntry] = useMutation(useMemo(() => buildCreateEntryMutation(entity), [entity]))

  const defaults = useMemo(() => previousEntry ?? fields.reduce((acc, field) => {
    // eslint-disable-next-line no-nested-ternary, functional/immutable-data, unicorn/no-nested-ternary
    acc[field.name as unknown as string] = previousEntry ?? (field.__typename === 'BooleanField' ? field.defaultValueBoolean : field.__typename === 'NumberField' ? field.defaultValueNumber : field.__typename === 'StringField' ? field.defaultValueString : '') ?? ''
    return acc
  }, {} as Record<string, unknown>), [fields, previousEntry])

  const validate = useCallback((values) => {
    const errors = fields.reduce((acc, field) => {
      const value = values[field.name]
      if (field.isRequiredInput && (value === undefined || value === '') && field.name !== '_id') {
        acc[field.name] = `${field.name} is required`
      }

      return acc
    }, {})

    return errors
  }, [fields])

  return (
    <Formik
      initialValues={defaults}
      validate={validate}
      enableReinitialize
      onSubmit={async (values, actions) => {
        const mappedValues = fields.reduce((acc, field) => {
          if (field.__typename === 'BooleanField' && values[field.name] !== undefined && values[field.name] !== '') {
            acc[field.name] = JSON.parse(values[field.name])
          }
          return acc
        }, values)

        await createEntry(mappedValues)
        onUpdated?.()

        actions.resetForm({
          values: defaults,
        })
      }}
    >
      {({
        handleChange, handleBlur, handleSubmit, values, errors,
      }) => (
        <View>
          {
            entity.fields.map((field) => {
              if (field.__typename === 'IDField' && values[field.name]) {
                return (
                  <Text
                    key={field.name}
                    accessibilityHint={field.name}
                    style={{ padding: 8, margin: 8 }}
                    accessibilityLabel={field.name}
                  >
                    {`ID: ${values[field.name]}` as string}
                  </Text>
                )
              }
              if (field.__typename === 'StringField') {
                return (
                  <TextInput
                    key={field.name}
                    style={[styles.textInputStyle, { color: errors[field.name] ? 'red' : 'black' }]}
                    accessibilityHint={field.name}
                    placeholderTextColor={errors[field.name] ? 'red' : 'black'}
                    accessibilityLabel={field.name}
                    onBlur={handleBlur(field.name)}
                    placeholder={field.name + (field.isRequiredInput ? ' (required)' : '')}
                    onChangeText={handleChange(field.name)}
                    value={values[field.name] as string}
                  />
                )
              }
              if (field.__typename === 'ArrayField') {
                return <Text key={field.name}>Array input here</Text>
              }
              if (field.__typename === 'EntityRelationField') {
                return <Text key={field.name}>Relation input here</Text>
              }
              if (field.__typename === 'NumberField') {
                return (
                  <TextInput
                    key={field.name}
                    accessibilityHint={field.name}
                    accessibilityLabel={field.name}
                    placeholderTextColor={errors[field.name] ? 'red' : 'black'}
                    style={[styles.textInputStyle, { color: errors[field.name] ? 'red' : 'black' }]}
                    placeholder={field.name + (field.isRequiredInput ? ' (required)' : '')}
                    keyboardType='numeric'
                    onBlur={handleBlur(field.name)}
                    value={values[field.name] as string}
                    onChangeText={handleChange(field.name)}
                  />
                )
              }
              if (field.__typename === 'BooleanField') {
                return (
                  <View key={field.name} style={styles.booleanFieldInput}>
                    <Text>
                      {field.name + (field.isRequiredInput ? ' (required)' : '')}
                    </Text>
                    <Switch
                      accessibilityHint={field.name}
                      style={styles.booleanFieldSwitch}
                      accessibilityLabel={field.name}
                      value={values[field.name] || values[field.name] === false ? JSON.parse(values[field.name]) : false}
                      onValueChange={(e) => {
                        handleChange(field.name)(e.toString())
                      }}
                    />
                  </View>
                )
              }

              return null
            })
          }
          <View style={{ margin: 8 }}>
            { // @ts-expect-error fix later
              Object.keys(errors).map((key) => <Text key={key} style={{ color: 'red' }}>{errors[key]}</Text>)
            }
            <Button
              onPress={handleSubmit as () => void}
              mode='contained'
            >
              Save
            </Button>
          </View>
        </View>
      )}

    </Formik>
  )
}

export default CreateEntry
