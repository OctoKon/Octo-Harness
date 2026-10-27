// Narrow ambient typings for the Node built-ins workspace-tools.ts uses; no @types/node.

declare const process: {
  env: Record<string, string | undefined>;
  platform: string;
};

declare module "node:fs/promises" {
  export interface Dirent {
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
    isSymbolicLink(): boolean;
  }
  export function readFile(path: string, encoding: "utf8"): Promise<string>;
  export function writeFile(path: string, data: string): Promise<void>;
  export function mkdir(
    path: string,
    options: { recursive: true },
  ): Promise<unknown>;
  export function readdir(
    path: string,
    options: { withFileTypes: true },
  ): Promise<Dirent[]>;
  export function realpath(path: string): Promise<string>;
  export function lstat(
    path: string,
  ): Promise<{ size: number; isFile(): boolean; isDirectory(): boolean }>;
}

declare module "node:path" {
  export const sep: string;
  export function resolve(...parts: string[]): string;
  export function relative(from: string, to: string): string;
  export function isAbsolute(path: string): boolean;
  export function dirname(path: string): string;
  export function basename(path: string): string;
  export function join(...parts: string[]): string;
}

declare module "node:child_process" {
  export interface Chunk {
    length: number;
    toString(encoding?: "utf8"): string;
  }
  export interface ChildStream {
    on(event: "data", cb: (chunk: Chunk) => void): unknown;
  }
  export interface ChildProcess {
    pid?: number;
    stdout: ChildStream | null;
    stderr: ChildStream | null;
    kill(signal?: string): boolean;
    on(event: "error", cb: (error: Error) => void): unknown;
    on(event: "close", cb: (code: number | null) => void): unknown;
  }
  export function spawn(
    file: string,
    args: readonly string[],
    options: {
      cwd?: string;
      env?: Record<string, string>;
      windowsHide: boolean;
      detached?: boolean;
      stdio: readonly string[];
    },
  ): ChildProcess;
}
