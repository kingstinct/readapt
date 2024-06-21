/* eslint-disable @typescript-eslint/no-namespace */

// eslint-disable-next-line max-classes-per-file
import type { InitializeProvider, Plugin } from '.'
import type { JSON } from '@zemble/utils/JSON'
import type { WebSocketHandler } from 'bun'
import type { PromiseOrValue } from 'graphql/jsutils/PromiseOrValue'
import type { PubSub } from 'graphql-yoga'
import type {
  Hono, Context as HonoContext,
} from 'hono'
import type { JWTPayload } from 'jose'
import type pino from 'pino'

export interface IEmail {
  readonly email: string
  readonly name?: string
}

export class ZembleCron<DataType = unknown, ReturnType = unknown> implements IZembleCron<DataType, ReturnType> {
  readonly worker: ZembleWorker<DataType, ReturnType>

  readonly options: CronOptions

  constructor(worker: ZembleWorker<DataType, ReturnType>, options: CronOptions) {
    this.worker = worker
    this.options = options
  }

  removeByIds(jobIds: readonly string[]): number {
    return this.options.plugin.providers.cronProvider.removeByIds(jobIds)
  }

  getById<TDataType extends DataType, TReturnType extends ReturnType>(jobId: string): ZembleJob<TDataType, TReturnType> | undefined {
    return this.options.plugin.providers.cronProvider.getById(
      jobId,
    )
  }

  getAllJobs<TDataType extends DataType, TReturnType extends ReturnType>(skip?: number | undefined, limit?: number | undefined): readonly ZembleJob<TDataType, TReturnType>[] {
    return this.options.plugin.providers.cronProvider.getAllJobs(skip, limit)
  }

  obliterate(): number {
    return this.options.plugin.providers.cronProvider.obliterate()
  }
}

export class ZembleQueue<DataType, ReturnType> implements IZembleQueue<DataType, ReturnType> {
  readonly worker: ZembleWorker<DataType, ReturnType>

  constructor(worker: ZembleWorker<DataType, ReturnType>) {
    this.worker = worker
  }

  add(data: DataType, opts?: JobOptions | undefined): Job<DataType, ReturnType> {
    throw new Error('Method not implemented.')
  }

  addBulk(data: readonly DataType[], opts?: JobOptions | undefined): readonly ZembleJob<DataType, ReturnType>[] {
    throw new Error('Method not implemented.')
  }

  removeByIds(jobId: readonly string[]): number {
    throw new Error('Method not implemented.')
  }

  getById<TDataType extends DataType, TReturnType extends ReturnType>(jobId: string): ZembleJob<TDataType, TReturnType> {
    throw new Error('Method not implemented.')
  }

  getAllJobs<TDataType extends DataType, TReturnType extends ReturnType>(skip?: number | undefined, limit?: number | undefined): readonly ZembleJob<TDataType, TReturnType>[] {
    throw new Error('Method not implemented.')
  }

  obliterate(): number {
    throw new Error('Method not implemented.')
  }
}

export type ZembleJobOpts = {
  readonly logger: IStandardLogger
}

export type ZembleWorker<DataType = unknown, ReturnType = unknown> = (job: ZembleJob<DataType, ReturnType>) => Promise<void> | void

type JobStatus = 'completed' | 'wait' | 'active' | 'delayed' | 'failed'

// queue with one recurring config - cron job?
// queue that is just a queue - queue?
// cron queue? - with possibility to add multiple cron jobs

export interface ZembleJob<DataType = unknown, ReturnType = unknown> {
  // maybe force serialization handling of this type?
  readonly data: DataType
  readonly jobId: string
  readonly repeatableId?: string
  readonly runAtEarliest: Date
  readonly createdAt: Date
  readonly startedRunningAt: Date
  readonly finishedRunningAt?: Date
  readonly status: JobStatus
  readonly returnValue?: ReturnType
  readonly error?: Error
}

interface RepeatableJob<DataType = unknown> {
  // maybe force serialization handling of this type?
  readonly data: DataType
  readonly repeatableId: string
  readonly createdAt: Date
}

interface JobOptions {
  readonly jobId?: string
  readonly runAtEarliest?: Date
}

interface CronOptions {
  readonly repeatPattern: string
  readonly timezone?: string
}

interface RepeatableJobOptions {
  readonly repeatPattern: string;
  readonly repeatableId?: string
}

export interface IZembleCron<DataType, ReturnType> {
  removeByIds(jobId: readonly string[]): number
  getById<TDataType extends DataType, TReturnType extends ReturnType>(jobId: string): ZembleJob<TDataType, TReturnType> | undefined
  getAllJobs<TDataType extends DataType, TReturnType extends ReturnType>(skip?: number, limit?: number): readonly ZembleJob<TDataType, TReturnType>[]
  obliterate(): number
}

interface IZembleCronProvider extends IZembleCron<unknown, unknown> {
  initialize(): void
}

export interface IZembleQueue<DataType, ReturnType> extends IZembleCron<DataType, ReturnType> {
  add(data: DataType, opts?: JobOptions): ZembleJob<DataType, ReturnType>
  addBulk(data: readonly DataType[], opts?: JobOptions): readonly ZembleJob<DataType, ReturnType>[]
}

export interface ZembleRepeatableQueue<DataType, ReturnType> extends IZembleCron<DataType, ReturnType> {
  addRepeatable(data: DataType, opts: RepeatableJobOptions): RepeatableJob<DataType>
  addRepeatableBulk(data: readonly DataType[], opts?: RepeatableJobOptions): readonly RepeatableJob<DataType>[]
  removeRepeatableByIds(repeatableJobId: readonly string[]): number
  getRepeatableById(repeatableJobId: string): RepeatableJob<DataType>
  getAllRepeatableJobs(skip?: number, limit?: number): readonly RepeatableJob<DataType>[]
}

export type SendEmailParams = {
  readonly to: readonly IEmail[] | IEmail | string | readonly string[],
  readonly html?: string,
  readonly text: string,
  readonly subject: string,
  readonly from: IEmail | string,
  readonly replyTo?: readonly IEmail[] | IEmail | string | readonly string[],
  readonly cc?: readonly IEmail[] | IEmail | string | readonly string[],
  readonly bcc?: readonly IEmail[] | IEmail | string | readonly string[],
}

export type IStandardSendEmailService = (options: SendEmailParams) => Promise<boolean>

export type SendSmsParams = {
  readonly to: string,
  readonly from: string,
  readonly message: string,
}

export type IStandardSendSmsService = (options: SendSmsParams) => Promise<boolean>

export abstract class IStandardKeyValueService<T = unknown> {
  abstract set(key: string, value: T, expireAfterSeconds?: number): Promise<void> | void

  abstract get(key: string): Promise<T | null> | T | null

  abstract has(key: string): Promise<boolean> | boolean

  abstract delete(key: string): Promise<void> | void

  abstract size(): Promise<number> | number

  abstract clear(): Promise<void> | void

  abstract keys(): Promise<readonly string[]> | readonly string[]

  abstract values(): Promise<ReadonlyArray<T>> | ReadonlyArray<T>

  abstract entries(): Promise<readonly (readonly [string, T])[]> | readonly (readonly [string, T])[]
}

export interface IStandardLogger extends pino.BaseLogger {
  readonly child: (bindings: Record<string, unknown>) => IStandardLogger
}

export interface PushMessage {
  readonly data?: Record<string, JSON>;
  readonly title?: string;
  readonly subtitle?: string;
  readonly body?: string;
  readonly sound?: {
    readonly critical?: boolean;
    readonly name?: 'default' | string;
    readonly volume?: number;
  };
  readonly ttl?: number;
  // readonly expiration?: number;
  readonly priority?: 'normal' | 'high';
  readonly badge?: number;
  readonly channelId?: string;
  readonly categoryId?: string;
  readonly mutableContent?: boolean;

  // not supported by expo
  readonly threadId?: string;
  readonly bodyLocalizationKey?: string;
  readonly bodyLocalizationArgs?: readonly string[];
  readonly titleLocalizationKey?: string;
  readonly titleLocalizationArgs?: readonly string[];
  readonly subtitleLocalizationKey?: string;
  readonly subtitleLocalizationArgs?: readonly string[];
  readonly launchImageName?: string;
}

export type PushTokenWithContents<TPush extends AnyPushTokenWithMetadata> = {
  readonly pushToken: TPush
  readonly contents: PushMessage | LiveActivityPushProps | Record<string, JSON>
}

export type PushTokenWithContentsAndTicket<TPush extends AnyPushTokenWithMetadata> = PushTokenWithContents<TPush> & { readonly ticketId: string }

export type PushTokenWithContentsAndTicketAndLiveActivityId<TPush extends AnyPushTokenWithMetadata> = PushTokenWithContents<TPush> & { readonly ticketId: string, readonly liveActivityId: string }

export type PushTokenWithContentsAndFailedReason<TPush extends AnyPushTokenWithMetadata> = PushTokenWithContents<TPush> & { readonly failedReason: string }

export interface SendPushResponse<TPush extends AnyPushTokenWithMetadata, TSuccess = PushTokenWithContentsAndTicket<TPush>> {
  readonly failedSendsToRemoveTokensFor: readonly TPush[]
  readonly failedSendsOthers: readonly PushTokenWithContentsAndFailedReason<TPush>[]
  readonly successfulSends: readonly TSuccess[]
}

export type LiveActivityPushProps = {
  readonly relevanceScore?: number
  readonly staleDate?: Date
  readonly contentState: Record<string, JSON>
  readonly timestamp?: Date
  readonly event: 'end' | 'update' // 'start' is separate since it's a different flow
  readonly dismissalDate?: Date
  readonly attributesType: string
  readonly attributes?: Record<string, JSON>
  // readonly attributes?: Record<string, JSON>
}

export type SendPushProvider = (
  pushTokens: readonly PushTokenWithMetadata[],
  message: PushMessage
) => PromiseOrValue<SendPushResponse<PushTokenWithMetadata>>
export type SendSilentPushProvider = (
  pushTokens: readonly PushTokenWithMetadata[],
  data: Record<string, JSON>
) => PromiseOrValue<SendPushResponse<PushTokenWithMetadata>>
export type SendStartLiveActivityPushProvider<TPush extends PushTokenForStartingLiveActivityWithMetadata = PushTokenForStartingLiveActivityWithMetadata> = (
  pushTokens: readonly TPush[],
  liveActivity: Omit<LiveActivityPushProps, 'event'> & PushMessage
) => PromiseOrValue<SendPushResponse<TPush>>
export type SendUpdateLiveActivityPushProvider<TPush extends PushTokenForUpdatingLiveActivityWithMetadata = PushTokenForUpdatingLiveActivityWithMetadata> = (
  pushTokens: readonly TPush[],
  liveActivity: Omit<LiveActivityPushProps, 'attributesType' | 'attributes'>
) => PromiseOrValue<SendPushResponse<TPush>>

declare global {
  namespace Zemble {
    interface HonoVariables extends Record<string, unknown> {

    }

    interface PushTokenStartLiveActivityRegistry {

    }

    interface PushTokenUpdateLiveActivityRegistry {

    }

    interface HonoBindings extends Record<string, unknown> {
      // eslint-disable-next-line functional/prefer-readonly-type
      logger: IStandardLogger
      // eslint-disable-next-line functional/prefer-readonly-type
      kv: <T extends Zemble.KVPrefixes[K], K extends keyof Zemble.KVPrefixes = keyof Zemble.KVPrefixes>(prefix: K) => IStandardKeyValueService<T>
    }

    interface HonoEnv {
      readonly Variables: HonoVariables
      readonly Bindings: HonoBindings
    }

    interface DefaultProviders {
      // eslint-disable-next-line functional/prefer-readonly-type
      sendEmail?: IStandardSendEmailService
      // eslint-disable-next-line functional/prefer-readonly-type
      sendSms?: IStandardSendSmsService
      // eslint-disable-next-line functional/prefer-readonly-type
      kv: <T extends Zemble.KVPrefixes[K], K extends keyof Zemble.KVPrefixes = keyof Zemble.KVPrefixes>(prefix: K) => IStandardKeyValueService<T>

      // eslint-disable-next-line functional/prefer-readonly-type
      logger: IStandardLogger

      // eslint-disable-next-line functional/prefer-readonly-type
      cronProvider: IZembleCronProvider
    }

    interface Providers extends DefaultProviders {

    }

    interface RouteContext extends HonoContext<HonoEnv> {

    }

    // eslint-disable-next-line functional/prefer-readonly-type
    type MultiProviders = {
      // eslint-disable-next-line functional/prefer-readonly-type
      [key in keyof Providers]: {
        [middlewareKey in keyof MiddlewareConfig]: Providers[key]
      }
    }

    type ProviderStrategies = Partial<Record<keyof Providers, 'last' | 'all' | 'failover' | 'round-robin'>>

    interface App {
      readonly hono: Hono<HonoEnv>
      readonly appDir: string

      // eslint-disable-next-line functional/prefer-readonly-type
      providers: Providers
      // eslint-disable-next-line functional/prefer-readonly-type
      multiProviders: MultiProviders

      // eslint-disable-next-line functional/prefer-readonly-type
      providerStrategies: ProviderStrategies

      readonly runBeforeServe: readonly RunBeforeServeFn[]

      readonly plugins: readonly Plugin[]
      readonly appPlugin?: Plugin
      // eslint-disable-next-line functional/prefer-readonly-type
      websocketHandler?: WebSocketHandler
    }

    interface DefaultMiddlewareConfig {
      readonly disable?: boolean
    }

    interface MiddlewareConfig {

    }

    interface GlobalConfig {
      readonly middleware?: MiddlewareConfig
    }

    interface KVPrefixes extends Record<string, unknown> {

    }

    // optional standard services here, so we can override them
    interface BaseStandardContext {

    }

    interface GlobalContext extends BaseStandardContext {
      // eslint-disable-next-line functional/prefer-readonly-type
      logger: IStandardLogger
    }

    interface RequestContext extends GlobalContext, HonoContext {

    }

    interface PubSubTopics {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      readonly [key: string]: any
    }

    interface PubSubType extends PubSub<PubSubTopics>{

    }

    // Extend the TokenRegistry for the new type
    interface TokenRegistry {
      // readonly UnknownToken: Record<string, unknown>
    }

    interface PushTokenRegistry {

    }
  }
}

export interface BaseToken extends JWTPayload
{
  readonly sub: string
}

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
export type TokenContents = Zemble.TokenRegistry[keyof Zemble.TokenRegistry] & BaseToken | BaseToken
export type PushTokenWithMetadata = Zemble.PushTokenRegistry[keyof Zemble.PushTokenRegistry]
export type PushTokenForStartingLiveActivityWithMetadata = Zemble.PushTokenStartLiveActivityRegistry[keyof Zemble.PushTokenStartLiveActivityRegistry]
export type PushTokenForUpdatingLiveActivityWithMetadata = Zemble.PushTokenUpdateLiveActivityRegistry[keyof Zemble.PushTokenUpdateLiveActivityRegistry]
// eslint-disable-next-line @typescript-eslint/no-duplicate-type-constituents, @typescript-eslint/no-redundant-type-constituents
export type AnyPushTokenWithMetadata = PushTokenWithMetadata | PushTokenForStartingLiveActivityWithMetadata | PushTokenForUpdatingLiveActivityWithMetadata

export type Dependency = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly plugin: Plugin<any, any, any>
  readonly config?: unknown,
  /**
   * To make it easy to write tests and develop a plugin towards an explicit implementation
   * of an interface, but leave it up to the developer using the plugin which implementation to use
   */
  readonly onlyWhenRunningLocally?: boolean,
}

export type DependenciesResolver<TSelf> = readonly Dependency[] | ((self: TSelf) => readonly Dependency[])

export type PluginOpts<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TSelf extends Plugin<any, any, any>,
  TConfig extends Zemble.GlobalConfig = Zemble.GlobalConfig,
  TDefaultConfig extends Partial<TConfig> = TConfig,
  TResolvedConfig extends TConfig & TDefaultConfig = TConfig & TDefaultConfig,
> = {
  /**
   * Default config for the plugin, will be merged (last write wins) with any configs passed to configure()
   */
  readonly defaultConfig?: TDefaultConfig,
  /**
   * Dependencies required for the plugin to work, specify onlyWhenRunningLocally: true if the plugin is only used in
   * development (for example a specific implementation of authentication when you don't have a strict dependency on
   * which auth module
   * is used)
   */
  readonly dependencies?: DependenciesResolver<TSelf>

  readonly additionalConfigWhenRunningLocally?: Partial<TConfig>,
  readonly providers?: Partial<{
    // @ts-expect-error fix later
    readonly [key in keyof Zemble.Providers]: InitializeProvider<Zemble.Providers[key], unknown>
  }>

  readonly name?: string,
  readonly version?: string,

  readonly middleware?: Middleware<TResolvedConfig, Plugin>

  // readonly provides: TSelf['providers']
}

export type RunBeforeServeFn = (() => Promise<void>) | (() => void)

// a middleware can return a function that will be called when the server is started
export type MiddlewareReturn = Promise<void> | void | RunBeforeServeFn | Promise<RunBeforeServeFn>

export type Middleware<TMiddlewareConfig extends Zemble.GlobalConfig, PluginType extends Plugin = Plugin> = (
  opts: {
    readonly app: Pick<Zemble.App, 'hono' |'appDir' |'providers' | 'websocketHandler' | 'appPlugin' | 'plugins' | 'multiProviders'>,
    readonly context: Zemble.GlobalContext
    readonly config: TMiddlewareConfig,
    readonly self: PluginType,
    readonly logger: IStandardLogger,
  }
) => MiddlewareReturn
