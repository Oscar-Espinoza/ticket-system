<script lang="ts">
  import { m } from '@/lib/i18n';
  import DownloadIcon from '@lucide/svelte/icons/download';

  import { Button } from '@/lib/components/ui/button';
  import { Separator } from '@/lib/components/ui/separator';
  import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/lib/components/ui/tabs';
  import AsanaImport from './asana-import.svelte';
  import CsvImport from './csv-import.svelte';
  import GitHubImport from './github-import.svelte';
  import ShortcutImport from './shortcut-import.svelte';

  let { projectId, canImport }: { projectId: string; canImport: boolean } = $props();

  const exportHref = (format: 'csv' | 'json') =>
    `/api/projects/${projectId}/export?format=${format}`;
</script>

<div class="flex flex-col">
  <section class="flex flex-col gap-3">
    <div>
      <h2 class="text-base font-medium">{m.auth_import_export()}</h2>
      <p class="text-sm text-muted-foreground">{m.auth_import_export_description()}</p>
    </div>
    <div class="flex gap-2">
      <Button variant="outline" size="sm" href={exportHref('csv')} download>
        <DownloadIcon />
        {m.auth_import_download_csv()}
      </Button>
      <Button variant="outline" size="sm" href={exportHref('json')} download>
        <DownloadIcon />
        {m.auth_import_download_json()}
      </Button>
    </div>
  </section>

  <Separator class="my-10" />

  <section class="flex flex-col gap-4">
    <div>
      <h2 class="text-base font-medium">{m.auth_import_import()}</h2>
      <p class="text-sm text-muted-foreground">{m.auth_import_import_description()}</p>
    </div>
    {#if canImport}
      <Tabs defaultValue="csv">
        <TabsList>
          <TabsTrigger value="csv">CSV</TabsTrigger> <!-- i18n-ignore -->
          <TabsTrigger value="jira">Jira</TabsTrigger> <!-- i18n-ignore -->
          <TabsTrigger value="github">{m.auth_import_tab_github()}</TabsTrigger>
          <TabsTrigger value="asana">Asana</TabsTrigger> <!-- i18n-ignore -->
          <TabsTrigger value="shortcut">Shortcut</TabsTrigger> <!-- i18n-ignore -->
        </TabsList>
        <TabsContent value="csv" class="pt-3">
          <CsvImport {projectId} preset="csv" />
        </TabsContent>
        <TabsContent value="jira" class="pt-3">
          <CsvImport {projectId} preset="jira" />
        </TabsContent>
        <TabsContent value="github" class="pt-3">
          <GitHubImport {projectId} />
        </TabsContent>
        <TabsContent value="asana" class="pt-3">
          <AsanaImport {projectId} />
        </TabsContent>
        <TabsContent value="shortcut" class="pt-3">
          <ShortcutImport {projectId} />
        </TabsContent>
      </Tabs>
    {:else}
      <p
        class="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
      >
        {m.auth_import_guests()}
      </p>
    {/if}
  </section>
</div>
