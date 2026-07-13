declare module 'restore-redact' {
  export interface RestoreRedactModule {
    detect<T>(data: T): T;
    restore<T>(data: T): T;
    clear(): void;
  }

  const restoreRedact: RestoreRedactModule;
  export default restoreRedact;
}
