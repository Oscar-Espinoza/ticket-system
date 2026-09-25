'use client';

import { Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CsvImport } from './csv-import';
import { GitHubImport } from './github-import';

export function ImportExportPanel({
  projectId,
  canImport,
}: {
  projectId: string;
  canImport: boolean;
}) {
  const exportHref = (format: 'csv' | 'json') => `/api/projects/${projectId}/export?format=${format}`;

  return (
    <div className="flex flex-col">
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-medium">Export</h2>
          <p className="text-sm text-muted-foreground">
            Every issue in this project, archived ones included (trash excluded), with all
            properties.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={exportHref('csv')} download>
              <Download />
              Download CSV
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={exportHref('json')} download>
              <Download />
              Download JSON
            </a>
          </Button>
        </div>
      </section>

      <Separator className="my-10" />

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-medium">Import</h2>
          <p className="text-sm text-muted-foreground">
            Bring issues in from a spreadsheet, Jira or GitHub. Imported issues are created by
            you and show up in activity like any other.
          </p>
        </div>
        {canImport ? (
          <Tabs defaultValue="csv">
            <TabsList>
              <TabsTrigger value="csv">CSV</TabsTrigger>
              <TabsTrigger value="jira">Jira</TabsTrigger>
              <TabsTrigger value="github">GitHub Issues</TabsTrigger>
            </TabsList>
            <TabsContent value="csv" className="pt-3">
              <CsvImport projectId={projectId} preset="csv" />
            </TabsContent>
            <TabsContent value="jira" className="pt-3">
              <CsvImport projectId={projectId} preset="jira" />
            </TabsContent>
            <TabsContent value="github" className="pt-3">
              <GitHubImport projectId={projectId} />
            </TabsContent>
          </Tabs>
        ) : (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            Guests can export but not import. Ask a project admin or member.
          </p>
        )}
      </section>
    </div>
  );
}
