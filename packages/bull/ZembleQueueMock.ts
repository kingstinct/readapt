/* eslint-disable functional/immutable-data */
/* eslint-disable functional/prefer-readonly-type */

import zembleContext from '@zemble/core/zembleContext'
import { jest } from 'bun:test'

import type { ZembleQueueBull, ZembleQueueConfig, ZembleWorker } from './ZembleQueueBull'
import type {
  Job, JobsOptions, Queue,
} from 'bullmq'

interface IZembleQueue<DataType = unknown, ReturnType = unknown> {
  readonly add: ZembleQueueBull<DataType, ReturnType>['add']
  readonly addBulk: ZembleQueueBull<DataType, ReturnType>['addBulk']
  readonly remove: ZembleQueueBull<DataType, ReturnType>['remove']
  readonly getJob: ZembleQueueBull<DataType, ReturnType>['getJob']
  readonly resume: ZembleQueueBull<DataType, ReturnType>['resume']
  readonly pause: ZembleQueueBull<DataType, ReturnType>['pause']
}

class ZembleQueueMock<DataType = unknown, ResultType = unknown> implements IZembleQueue<DataType, ResultType> {
  private jobs: Array<Job<DataType, ResultType, string>> = []

  private isPaused = false

  constructor(
    readonly worker: ZembleWorker,
    _?: ZembleQueueConfig,
  ) {
    this.#worker = worker
    // this.#config = config

    // wrap all functions with jest.fn to be able to spy on them
    this.add = jest.fn(this.add.bind(this))
    this.addBulk = jest.fn(this.addBulk.bind(this))
    this.remove = jest.fn(this.remove.bind(this))
    this.getJob = jest.fn(this.getJob.bind(this))
    this.pause = jest.fn(this.pause.bind(this))
    this.resume = jest.fn(this.resume.bind(this))
  }

  readonly #worker: ZembleWorker

  // readonly #config?: ZembleQueueConfig

  #queueInternal: Queue<DataType, ResultType, string> | undefined

  get #queue(): Queue<DataType, ResultType, string> {
    if (!this.#queueInternal) throw new Error('Queue not initialized, something is wrong!')

    return this.#queueInternal
  }

  async addBulk(jobs: Parameters<ZembleQueueBull<DataType, ResultType>['addBulk']>[number]) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    const js = jobs.map((job) => this.#createMockJob(job.name, job.data as any, job.opts))

    void js.reduce(async (prev, job) => {
      await prev
      await new Promise((resolve) => {
        setTimeout(() => {
          void this.#worker(job, { logger: zembleContext.logger })
          resolve(undefined)
        }, 0)
      })
    }, Promise.resolve())

    return js
  }

  async _initQueue(queueName: string) {
    this.#queueInternal = {
      name: queueName,
      qualifiedName: queueName,
    } as Queue<DataType, ResultType, string>
  }

  #createMockJob(name: string, data: DataType, opts?: JobsOptions | undefined): Job<DataType, ResultType, string> {
    const job = {
      queue: this.#queue,
      queueName: this.#queue.name,
      attemptsMade: 0,
      data,
      name,
      progress: () => ({}),
      ...(opts || {}),
    } as unknown as Job<DataType, ResultType, string>

    return job
  }

  async add(name: string, data: DataType, opts?: JobsOptions | undefined): Promise<Job<DataType, ResultType, string>> {
    if (this.isPaused) {
      throw new Error('Queue is paused')
    }

    const job = this.#createMockJob(name, data, opts)
    this.jobs.push(job)
    setTimeout(async () => this.#worker(job, { logger: zembleContext.logger }), 0)
    return job
  }

  async remove(jobId: string) {
    const initialLength = this.jobs.length
    this.jobs = this.jobs.filter((job) => job.id !== jobId)
    const removedCount = initialLength - this.jobs.length
    return removedCount
  }

  async getJob(jobId: string) {
    return this.jobs.find((job) => job.id === jobId) as unknown as ReturnType<ZembleQueueBull<DataType, ResultType>['getJob']>
  }

  async pause() {
    this.isPaused = true
  }

  async resume(): Promise<void> {
    this.isPaused = false
  }
}

export default ZembleQueueMock
