// Owner: B7 (cycles / automations). Stub — the project layout calls this
// inside `after()` on every project page load. Implement throttling via
// project.automation_run_at (at most once a day), then auto-archive / auto-close
// / cycle rollover using src/lib/issue-service.ts with actor { userId: null }.
// Must never throw.

export async function runProjectAutomations(projectId: string): Promise<void> {
  void projectId;
}
