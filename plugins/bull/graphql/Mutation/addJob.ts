import { Queue } from 'bullmq'
import redis from '../../redis'

export default (_:any, { queue }: { queue: string }) => {
  
  const q = new Queue(queue, {
    connection: redis
  })

  return q.add(queue, {}, {})
}