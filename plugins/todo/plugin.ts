import { Plugin } from '@readapt/core'
import Yoga from '@readapt/graphql-yoga'
import AnonymousAuth from 'readapt-plugin-auth-anonymous'
import KV from 'readapt-plugin-kv'

export default new Plugin(__dirname, {
  // this is mostly to ensure we get the global typings past here
  dependencies: () => [
    { plugin: Yoga },
    { plugin: AnonymousAuth, devOnly: true },
    { plugin: KV },
  ],
})
