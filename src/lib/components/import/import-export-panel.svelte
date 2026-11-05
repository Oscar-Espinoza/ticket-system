<script lang="ts">
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
      <h2 class="text-base font-medium">Export</h2>
      <p class="text-sm text-muted-foreground">
        Every issue in this project, archived ones included (trash excluded), with all properties.
      </p>
    </div>
    <div class="flex gap-2">
      <Button variant="outline" size="sm" href={exportHref('csv')} download>
        <DownloadIcon />
        Download CSV
      </Button>
      <Button variant="outline" size="sm" href={exportHref('json')} download>
        <DownloadIcon />
        Download JSON
      </Button>
    </div>
  </section>

  <Separator class="my-10" />

  <section class="flex flex-col gap-4">
    <div>
      <h2 class="text-base font-medium">Import</h2>
      <p class="text-sm text-muted-foreground">
        Bring issues in from a spreadsheet, Jira, GitHub, Asana or Shortcut. Imported issues are
        created by you and show up in activity like any other.
      </p>
    </div>
    {#if canImport}
      <Tabs defaultValue="csv">
        <TabsList>
          <TabsTrigger value="csv">CSV</TabsTrigger>
          <TabsTrigger value="jira">Jira</TabsTrigger>
          <TabsTrigger value="github">GitHub Issues</TabsTrigger>
          <TabsTrigger value="asana">Asana</TabsTrigger>
          <TabsTrigger value="shortcut">Shortcut</TabsTrigger>
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
        Guests can export but not import. Ask a project admin or member.
      </p>
    {/if}
  </section>
</div>
