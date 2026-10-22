import PgBoss from 'pg-boss';
import { QueueAdapter, QueueJob, QueueSendOptions } from './types';
import { getServerEnv } from '@/server/config/env';

interface PgBossRawJob {
  id: string;
  name: string;
  data: unknown;
}

export class InMemoryQueueAdapter implements QueueAdapter {
  private started = false;
  private queues = new Map<string, Array<{ id: string; data: unknown; singletonKey?: string }>>();
  private handlers = new Map<string, Array<(job: QueueJob<unknown>) => Promise<void>>>();
  private activeSingletons = new Map<string, Set<string>>();

  async start(): Promise<void> {
    this.started = true;
  }

  async stop(): Promise<void> {
    this.started = false;
    this.queues.clear();
    this.handlers.clear();
    this.activeSingletons.clear();
  }

  async send<T>(name: string, data: T, options?: QueueSendOptions): Promise<string | null> {
    if (!this.started) {
      throw new Error('[InMemoryQueueAdapter] Cannot send job: adapter is not started.');
    }

    const singletonKey = options?.singletonKey;
    if (singletonKey) {
      const activeKeys = this.activeSingletons.get(name) || new Set<string>();
      if (activeKeys.has(singletonKey)) {
        // Debounce / deduplicate identical singleton key
        return null;
      }
      activeKeys.add(singletonKey);
      this.activeSingletons.set(name, activeKeys);
    }

    const id = `mem-${crypto.randomUUID()}`;
    const jobItem = { id, data, singletonKey };

    if (!this.queues.has(name)) {
      this.queues.set(name, []);
    }
    this.queues.get(name)!.push(jobItem);

    // If there is an active worker registered, process asynchronously
    const registeredHandlers = this.handlers.get(name);
    if (registeredHandlers && registeredHandlers.length > 0) {
      const queueList = this.queues.get(name)!;
      const index = queueList.indexOf(jobItem);
      if (index !== -1) {
        queueList.splice(index, 1);
      }

      const job: QueueJob<T> = { id, name, data, singletonKey };
      setTimeout(async () => {
        try {
          for (const handler of registeredHandlers) {
            await handler(job);
          }
        } finally {
          if (singletonKey) {
            this.activeSingletons.get(name)?.delete(singletonKey);
          }
        }
      }, 0);
    }

    return id;
  }

  async work<T>(name: string, handler: (job: QueueJob<T>) => Promise<void>): Promise<void> {
    if (!this.handlers.has(name)) {
      this.handlers.set(name, []);
    }
    this.handlers.get(name)!.push(handler as (job: QueueJob<unknown>) => Promise<void>);

    // Process any already queued items
    const queuedItems = this.queues.get(name) || [];
    while (queuedItems.length > 0) {
      const item = queuedItems.shift()!;
      const job: QueueJob<unknown> = {
        id: item.id,
        name,
        data: item.data,
        singletonKey: item.singletonKey,
      };

      setTimeout(async () => {
        try {
          await handler(job as QueueJob<T>);
        } finally {
          if (item.singletonKey) {
            this.activeSingletons.get(name)?.delete(item.singletonKey);
          }
        }
      }, 0);
    }
  }

  isHealthy(): boolean {
    return this.started;
  }
}

export class PgBossAdapter implements QueueAdapter {
  private boss: PgBoss | null = null;
  private started = false;
  private connectionString: string;

  constructor(connectionString?: string) {
    this.connectionString = connectionString || getServerEnv().DATABASE_URL;
  }

  async start(): Promise<void> {
    if (this.started && this.boss) {
      return;
    }

    this.boss = new PgBoss({
      connectionString: this.connectionString,
      schema: 'pgboss', // keep queue-managed schema separated from app public tables
    });

    this.boss.on('error', (err) => {
      console.error('[TraceCase Worker] pg-boss background error:', err);
    });

    await this.boss.start();
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started || !this.boss) {
      return;
    }

    await this.boss.stop({ graceful: true, timeout: 10000 });
    this.started = false;
    this.boss = null;
  }

  async send<T>(name: string, data: T, options?: QueueSendOptions): Promise<string | null> {
    if (!this.boss || !this.started) {
      throw new Error('[PgBossAdapter] Cannot send job: pg-boss queue is not started.');
    }

    const sendOptions: { singletonKey?: string; retryLimit?: number; expireInSeconds?: number } = {};
    if (options?.singletonKey) {
      sendOptions.singletonKey = options.singletonKey;
    }
    if (options?.retryLimit !== undefined) {
      sendOptions.retryLimit = options.retryLimit;
    }
    if (options?.expireInSeconds !== undefined) {
      sendOptions.expireInSeconds = options.expireInSeconds;
    }

    // pg-boss v10 requires explicit queue creation; otherwise send can return
    // null even though no existing singleton job was actually enqueued.
    await this.boss.createQueue(name);
    const jobId = await this.boss.send(name, data as object, sendOptions);
    return jobId || null;
  }

  async work<T>(name: string, handler: (job: QueueJob<T>) => Promise<void>): Promise<void> {
    if (!this.boss || !this.started) {
      throw new Error('[PgBossAdapter] Cannot register worker: pg-boss queue is not started.');
    }

    await this.boss.createQueue(name);
    const bossWorkerClient = this.boss as unknown as {
      work: (queueName: string, cb: (jobOrJobs: PgBossRawJob | PgBossRawJob[]) => Promise<void>) => Promise<void>;
    };

    await bossWorkerClient.work(name, async (jobOrJobs) => {
      const jobs = Array.isArray(jobOrJobs) ? jobOrJobs : [jobOrJobs];
      for (const j of jobs) {
        await handler({
          id: j.id,
          name: j.name,
          data: j.data as T,
        });
      }
    });
  }

  isHealthy(): boolean {
    return this.started && this.boss !== null;
  }
}
