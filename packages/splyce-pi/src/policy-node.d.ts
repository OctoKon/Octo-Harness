// Same narrow built-in typing convention as the store; no additional dependency.
declare module "node:crypto" {
  interface Hash {
    update(data: string): Hash;
    digest(encoding: "hex"): string;
  }
  export function createHash(algorithm: "sha256"): Hash;
  export function randomUUID(): string;
}
// TD-70 child path confinement.
declare module "node:path" {
  export function resolve(...paths: string[]): string;
  export function relative(from: string, to: string): string;
  export function isAbsolute(path: string): boolean;
  export function dirname(path: string): string;
  export const sep: string;
}
declare module "node:fs" {
  export function realpathSync(path: string): string;
  export namespace realpathSync {
    export function native(path: string): string;
  }
}
