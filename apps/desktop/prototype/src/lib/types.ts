export type View = 'landing' | 'app';
export type Page = 'work' | 'runs' | 'run' | 'memory' | 'models' | 'extensions' | 'settings';
export type RunStatus = 'approval' | 'running' | 'verified' | 'stopped';
export type Theme = 'light' | 'dark';

export interface Workspace {
  id: string;
  name: string;
  path: string;
  branch: string;
  files: number;
  local: boolean;
}

export interface Run {
  id: string;
  title: string;
  prompt: string;
  workspace: string;
  branch: string;
  base: string;
  status: RunStatus;
  updated: string;
  elapsed: string;
  files: number;
  additions: number;
  deletions: number;
  model: string;
  verification?: { command: string; exit: number; tests: number; duration: string; at: string };
  stopReason?: string;
  approval?: 'allowed' | 'always' | 'denied';
}

export interface Receipt {
  id: string;
  kind: 'run' | 'intent' | 'action' | 'verification' | 'policy';
  label: string;
  detail: string;
  at: string;
  state: 'ok' | 'denied' | 'failed';
}

export interface DiffFile {
  path: string;
  additions: number;
  deletions: number;
  hunks: { header: string; lines: DiffLine[] }[];
}

export interface DiffLine {
  kind: 'context' | 'add' | 'del';
  number: number;
  text: string;
}

export interface MemoryItem {
  id: string;
  kind: 'decision' | 'failure' | 'capsule';
  title: string;
  excerpt: string;
  source: string;
  revision: string;
  runId: string;
  workspace: string;
  age: string;
  used: number;
  superseded?: string;
  evidence: string[];
}

export interface Role {
  id: 'generation' | 'extraction' | 'embeddings' | 'reranking';
  label: string;
  job: string;
  model: string;
  runtime: string;
  state: 'loaded' | 'ready' | 'idle';
  locality: 'verified' | 'unchecked';
  detail: string;
}

export interface LocalModel {
  id: string;
  name: string;
  params: string;
  quant: string;
  size: string;
  runtime: string;
  roles: string[];
  installed: boolean;
}

export interface McpServer {
  id: string;
  name: string;
  command: string;
  transport: string;
  version: string;
  tools: number;
  grant: 'Read-only' | 'Workspace write' | 'Network';
  enabled: boolean;
  tools_list: { name: string; scope: string }[];
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  provenance: string;
  version: string;
  scope: string;
  enabled: boolean;
}

export interface Toast {
  id: string;
  message: string;
}
