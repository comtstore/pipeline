/* eslint-disable no-unused-vars */
import createError from 'http-errors'
import EventEmitter from '@comtstore/event-emitter'

export type PipelineStatus = 'initial' | 'pending' | 'resolved' | 'rejected'

export type Ctx = {
    // 流输入数据
    ip: {
        [key: string]: any
    },
    // 流输出数据, resolved
    op: {
        [key: string]: any
    },
    // 流处理时的临时数据
    tp: {
        [key: string]: any
    },
    // 流出错数据，rejected
    ep?: Error
}
// 模仿koa，定义一个pipeline
// pipeline在不同phase之间共用一个ctx
class Pipeline extends EventEmitter {
    /**
     * 记录上下文环境数据
     */
    private ctx: Ctx = {
      ip: {},
      op: {},
      tp: {},
      ep: undefined
    }

    /**
     * 流处理的状态，一次由外部调用的execute()即开始一次流处理
     */
    private status: PipelineStatus = 'initial'

    /**
     * 变更状态
     * 状态变更：initial -> pending,
     * pending -> resolved / rejected,
     * resolved / rejected -> initial
     * @param newStatus
     * @returns 状态变更是否成功
     */
    private moveStatus (newStatus: PipelineStatus, err?: Error) {
      if (this.status === 'initial') {
        if (newStatus === 'pending') {
          this.status = 'pending'
        }
      } else if (this.status === 'pending') {
        if (newStatus === 'rejected') {
          this.status = 'rejected'
          this.ctx.ep = err
          this.emit('rejected')
        } else if (newStatus === 'resolved') {
          this.status = 'resolved'
          this.emit('resolved')
        }
      } else if (['resolved', 'rejected'].includes(this.status)) {
        if (newStatus === 'initial') {
          this.status = 'initial'
        }
      } else {
        throw new Error('不支持的状态')
      }
    }

    private middlewares: Array<(ctx: Ctx, next, pl: Pipeline) => void | Promise<void>> = []

    /**
     * 初始化流
     * @param initialCtx 最初的环境变量
     * @returns
     */
    public initial (initialIpCtx: {
        [key: string]: any
    }) {
      this.ctx.ip = {
        ...this.ctx.ip,
        ...initialIpCtx
      }
      return this
    }

    /**
     * 得到流处理的结果
     * @returns
     */
    public output (): Promise<{
        [key: string]: any
    }> {
      return new Promise((resolve, reject) => {
        if (this.status === 'resolved') {
          resolve(this.ctx.op)
        } else if (this.status === 'rejected') {
          reject(this.ctx.ep)
        } else if (this.status === 'pending') {
          const cb = () => {
            this.off('resolved', cb)
            this.off('rejected', cb)
            if (this.status === 'resolved') {
              reject(this.ctx.ep)
            } else if (this.status === 'rejected') {
              resolve(this.ctx.op)
            }
          }
          this.once('resolved', cb)
          this.once('rejected', cb)
        }
      })
    }

    /**
     * 添加流中间件
     * @param middleware
     * @returns
     */
    public use (middleware: (ctx, next, pl: Pipeline) => void | Promise<void>) {
      this.middlewares.push(middleware)
      return this
    }

    /**
     * 条件中间件，只有当condition条件满足时，才会执行，否则直接执行下一个中间件
     * @param condition 
     * @param middleware 
     */
    public conditionalUse (
      condition: (ctx, pl: Pipeline) => boolean, 
      middleware: (ctx, next, pl: Pipeline) => void | Promise<void>) {
        return this.use(async (ctx, next, pl: Pipeline) => {
          if(condition(ctx, pl)){
            await middleware(ctx, next, pl)
          } else {
            await next()
          }
        })
    }

    /**
     * 添加流中间件列表
     * @param middlewares
     * @returns
     */
    public uses (middlewares: Array<(ctx, next, pl: Pipeline) => void | Promise<void>>) {
      this.middlewares.push(...middlewares)
      return this
    }

    /**
     * 抛出一个错误
     * @param code
     * @param message
     */
    public throw (code, message) {
      throw createError(code, message)
    }

    /**
     * 添加一个错误处理中间件
     * @param errorCb 错误处理器
     * @returns
     */
    public error (errorCb: (err: Error) => void) {
      const errorMiddleware = async (_ctx, next) => {
        try {
          await next()
        } catch (err) {
          errorCb(err)
          throw err
        }
      }
      this.middlewares.unshift(errorMiddleware)
      return this
    }

    /**
     * 执行流
     * @param index 当前执行的阶段，默认为0，表示第一个阶段
     */
    public async execute (index: number = 0) {
      if (index >= this.middlewares.length) return
      if (index === 0) {
        this.moveStatus('initial')
      }
      const currentMiddleware = this.middlewares[index]
      const next = async () => {
        await this.execute(index + 1)
      }
      try {
        this.moveStatus('pending')
        await currentMiddleware(this.ctx, next, this)
        if (index === this.middlewares.length - 1) {
          this.moveStatus('resolved')
        }
      } catch (err) {
        if (index > 0) {
          throw err
        } else {
          this.moveStatus('rejected', err)
        }
      }
      return this
    }
}

// const pl = new Pipeline()
// pl.use(async (ctx, next) => {
//   // do something
//   await next()
//   // do next lans;
// }).use(async (ctx, next, pl) => {
//   // do nothing
//   pl.throw(10301, '出现错误')
// }).error((err) => {
//   console.log(err)
// }).execute()

// middlewares:
// [
//     async (_ctx, next) => {
//         try {
//           await next()
//         } catch (err) {
//           errorCb(err)
//           throw err
//         }
//     },
//     async (ctx, next) => {
//         // do something
//         await next()
//         // do next lans;
//     },
//     async (ctx, next) => {
//         // do nothing
//         throw new Error('抛出错误')
//     }
// ]

export default Pipeline
