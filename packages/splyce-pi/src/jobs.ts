// TD-45 scheduler prep (pure jobs). Implementation pending TD-14/25/37.
export interface Job {
  id: string;
  runAt: number;
}

export function scheduleJob(_job: Job): Job {
  throw new Error("TD-45 not implemented");
}
