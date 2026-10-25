import { runs as seedRuns, workspaces } from './data';
import type { Page, Run, Theme, Toast, View } from './types';

class AppState {
  // Landing is parked, not deleted; app routes currently start on Work.
  view = $state<View>('app');
  page = $state<Page>('work');
  runId = $state<string>('r-1042');
  workspaceId = $state<string>('payments');
  runs = $state<Run[]>(seedRuns.map((run) => ({ ...run })));
  theme = $state<Theme>('light');
  toasts = $state<Toast[]>([]);
  #timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor() {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('splyce.theme');
      if (saved === 'dark' || saved === 'light') this.theme = saved;
      this.applyTheme();
      this.readHash();
      window.addEventListener('hashchange', () => this.readHash());
    }
  }

  go(page: Page) {
    this.view = 'app';
    this.page = page;
    this.writeHash();
    this.scrollTop();
  }

  openRun(id: string) {
    this.view = 'app';
    this.runId = id;
    this.page = 'run';
    this.writeHash();
    this.scrollTop();
  }

  openSite() {
    this.view = 'landing';
    this.page = 'work';
    this.writeHash();
    window.scrollTo({ top: 0 });
  }

  readHash() {
    const path = window.location.hash.replace(/^#\/?/, '');
    if (!path) {
      this.page = 'work';
      this.view = 'app';
      return;
    }
    const [page, id] = path.split('/');
    if (page === 'run' && id) {
      this.runId = id;
      this.page = 'run';
      this.view = 'app';
      return;
    }
    if (
      page === 'work' ||
      page === 'runs' ||
      page === 'memory' ||
      page === 'models' ||
      page === 'extensions' ||
      page === 'settings'
    ) {
      this.page = page;
      this.view = 'app';
    }
  }

  writeHash() {
    const next =
      this.view === 'landing'
        ? '#/'
        : this.page === 'run'
          ? `#/run/${this.runId}`
          : `#/${this.page}`;
    if (window.location.hash !== next) window.location.hash = next;
  }

  scrollTop() {
    requestAnimationFrame(() => document.querySelector('.main')?.scrollTo({ top: 0 }));
  }

  setTheme(theme: Theme) {
    this.theme = theme;
    this.applyTheme();
    try {
      window.localStorage.setItem('splyce.theme', theme);
    } catch {
      /* storage can be unavailable in private windows */
    }
  }

  toggleTheme() {
    this.setTheme(this.theme === 'light' ? 'dark' : 'light');
  }

  applyTheme() {
    if (typeof document !== 'undefined') document.documentElement.dataset.theme = this.theme;
  }

  createRun(prompt: string, workspace: string, base: string, model = 'Qwen3-Coder-30B-A3B') {
    const id = `r-${1043 + this.runs.filter((run) => run.id.startsWith('r-10')).length}`;
    const title = prompt.trim().split('\n')[0].slice(0, 72) || 'Untitled run';
    const run: Run = {
      id,
      title,
      prompt: prompt.trim(),
      workspace,
      branch: `splyce/${title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 32)}`,
      base,
      status: 'running',
      updated: 'now',
      elapsed: '0s',
      files: 0,
      additions: 0,
      deletions: 0,
      model,
    };
    this.runs = [run, ...this.runs];
    this.openRun(id);
    return id;
  }

  updateRun(id: string, patch: Partial<Run>) {
    this.runs = this.runs.map((run) => (run.id === id ? { ...run, ...patch } : run));
  }

  resolveApproval(id: string, decision: 'allowed' | 'always' | 'denied') {
    this.updateRun(id, { approval: decision });
  }

  toast(message: string) {
    const id = crypto.randomUUID();
    this.toasts = [...this.toasts, { id, message }];
    this.#timers.set(
      id,
      setTimeout(() => {
        this.toasts = this.toasts.filter((toast) => toast.id !== id);
        this.#timers.delete(id);
      }, 3200),
    );
  }

  get currentRun(): Run {
    return this.runs.find((run) => run.id === this.runId) ?? this.runs[0];
  }

  get workspace() {
    return workspaces.find((workspace) => workspace.id === this.workspaceId) ?? workspaces[0];
  }

  get activeWorkspace() {
    return this.workspace;
  }

  setWorkspace(id: string) {
    this.workspaceId = id;
    const next = workspaces.find((workspace) => workspace.id === id);
    if (next) this.toast(`Workspace: ${next.name}`);
  }
}

export const app = new AppState();
