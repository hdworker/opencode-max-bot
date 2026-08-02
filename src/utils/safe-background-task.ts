export function safeBackgroundTask(options: { taskName: string; task: () => Promise<void> }): void {
  options.task().catch((error) => {
    console.error(`[${options.taskName}] Unhandled error:`, error);
  });
}
