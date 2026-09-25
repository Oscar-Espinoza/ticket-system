'use client';

// Edit one widget: title, type, project, filters (query syntax everywhere; the
// Filter menu + chips when a single project is in scope), type options, size.

import { useState, type ReactNode } from 'react';

import { ProjectDataProvider } from '@/components/project/project-data';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FilterChips, FilterMenu, type FilterPropertyId } from '@/components/views/filter-menu';
import { SearchSyntaxHelp, appendToken } from '@/components/views/search-syntax-help';
import { normalizeIssueFilters, type IssueFilters } from '@/lib/issue-filtering';
import { widgetIssues, widgetProjects } from './widget-data';
import {
  BAR_GROUPS,
  BAR_GROUP_LABEL,
  LINE_WEEKS,
  LIST_LIMITS,
  LIST_ORDERS,
  LIST_ORDER_LABEL,
  WIDGET_SIZES,
  WIDGET_TYPES,
  WIDGET_TYPE_LABEL,
  sizeOf,
  type DashboardDataset,
  type Widget,
  type WidgetConfig,
} from './widget-model';

const ALL = '__all';

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function Choice<T extends string | number>({
  label,
  value,
  options,
  format,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  format: (value: T) => string;
  onChange: (value: T) => void;
}) {
  return (
    <Field label={label}>
      <Select
        value={String(value)}
        onValueChange={(next) => {
          const match = options.find((o) => String(o) === next);
          if (match !== undefined) onChange(match);
        }}
      >
        <SelectTrigger size="sm" aria-label={label} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={String(option)} value={String(option)}>
              {format(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function ProjectFilters({ filters, onChange }: { filters: IssueFilters; onChange: (next: IssueFilters) => void }) {
  const [menu, setMenu] = useState<{ open: boolean; property: FilterPropertyId | null }>({ open: false, property: null });
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <FilterMenu
        filters={filters}
        onChange={onChange}
        open={menu.open}
        property={menu.property}
        onOpenChange={(open) => setMenu((m) => ({ open, property: open ? m.property : null }))}
        onPropertyChange={(property) => setMenu((m) => ({ ...m, property }))}
      />
      <FilterChips filters={filters} onChange={onChange} onEdit={(property) => setMenu({ open: true, property })} />
    </div>
  );
}

export function WidgetEditor({
  widget,
  dataset,
  scopeProjectId,
  onOpenChange,
  onSave,
}: {
  /** Open while non-null. */
  widget: Widget | null;
  dataset: DashboardDataset;
  /** The dashboard's project (null = cross-project dashboard). */
  scopeProjectId: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (widget: Widget) => void;
}) {
  return (
    <Dialog open={widget !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {widget && (
          <EditorForm
            key={widget.id}
            initial={widget}
            dataset={dataset}
            scopeProjectId={scopeProjectId}
            onCancel={() => onOpenChange(false)}
            onSave={onSave}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditorForm({
  initial,
  dataset,
  scopeProjectId,
  onCancel,
  onSave,
}: {
  initial: Widget;
  dataset: DashboardDataset;
  scopeProjectId: string | null;
  onCancel: () => void;
  onSave: (widget: Widget) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [now] = useState(() => Date.now());
  const config = draft.config;
  const setConfig = (patch: Partial<WidgetConfig>) => setDraft((d) => ({ ...d, config: { ...d.config, ...patch } }));

  // Filter chips (ids) only make sense for one project.
  const single = widgetProjects(draft, dataset);
  const project = single.length === 1 ? single[0] : null;
  const matching = widgetIssues(draft, dataset, now).length;

  const setProject = (value: string) => {
    const projectId = value === ALL ? null : value;
    if (projectId === config.projectId) return;
    // Id-based filters and the epic belong to the old project; keep only the query.
    setConfig({
      projectId,
      epicId: null,
      filters: normalizeIssueFilters({ q: config.filters.q }),
    });
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ ...draft, title: draft.title.trim() || WIDGET_TYPE_LABEL[draft.type] });
      }}
    >
      <DialogHeader>
        <DialogTitle>Edit widget</DialogTitle>
        <DialogDescription>
          {matching === 1 ? '1 issue matches' : `${matching} issues match`} the current filters.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title" htmlFor="widget-title">
          <Input
            id="widget-title"
            value={draft.title}
            maxLength={80}
            onChange={(event) => setDraft((d) => ({ ...d, title: event.target.value }))}
          />
        </Field>
        <Choice
          label="Type"
          value={draft.type}
          options={WIDGET_TYPES}
          format={(type) => WIDGET_TYPE_LABEL[type]}
          onChange={(type) => setDraft((d) => ({ ...d, type }))}
        />
        {!scopeProjectId && dataset.projects.length > 1 && (
          <Field label="Project">
            <Select value={config.projectId ?? ALL} onValueChange={setProject}>
              <SelectTrigger size="sm" aria-label="Project" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All projects</SelectItem>
                {dataset.projects.map((p) => (
                  <SelectItem key={p.project.id} value={p.project.id}>
                    {p.project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <Choice
          label="Size"
          value={sizeOf(draft)}
          options={WIDGET_SIZES.map((s) => s.id)}
          format={(id) => WIDGET_SIZES.find((s) => s.id === id)!.label}
          onChange={(id) => {
            const size = WIDGET_SIZES.find((s) => s.id === id)!;
            setDraft((d) => ({ ...d, w: size.w, h: size.h }));
          }}
        />
      </div>

      <Field label="Filter" htmlFor="widget-query">
        <div className="flex items-center gap-1">
          <Input
            id="widget-query"
            value={config.filters.q}
            maxLength={200}
            placeholder="is:open label:bug assignee:me"
            className="font-mono text-xs"
            onChange={(event) => setConfig({ filters: { ...config.filters, q: event.target.value } })}
          />
          <SearchSyntaxHelp
            note="Free text matches titles and IDs."
            onInsert={(token) => setConfig({ filters: { ...config.filters, q: appendToken(config.filters.q, token) } })}
          />
        </div>
        {project && (
          <ProjectDataProvider value={project}>
            <ProjectFilters filters={config.filters} onChange={(filters) => setConfig({ filters })} />
          </ProjectDataProvider>
        )}
      </Field>

      {draft.type === 'bar' && (
        <Choice
          label="Group by"
          value={config.groupBy}
          options={BAR_GROUPS.filter((g) => g !== 'project' || !project)}
          format={(g) => BAR_GROUP_LABEL[g]}
          onChange={(groupBy) => setConfig({ groupBy })}
        />
      )}
      {draft.type === 'line' && (
        <Choice
          label="Range"
          value={config.weeks}
          options={LINE_WEEKS}
          format={(w) => `Last ${w} weeks`}
          onChange={(weeks) => setConfig({ weeks })}
        />
      )}
      {draft.type === 'list' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Choice
            label="Order"
            value={config.orderBy}
            options={LIST_ORDERS}
            format={(o) => LIST_ORDER_LABEL[o]}
            onChange={(orderBy) => setConfig({ orderBy })}
          />
          <Choice
            label="Show"
            value={config.limit}
            options={LIST_LIMITS}
            format={(n) => `${n} issues`}
            onChange={(limit) => setConfig({ limit })}
          />
        </div>
      )}
      {draft.type === 'epic' && project && (
        <Choice
          label="Epic"
          value={config.epicId ?? ALL}
          options={[ALL, ...project.epics.map((e) => e.id)]}
          format={(id) => (id === ALL ? 'All epics' : (project.epics.find((e) => e.id === id)?.name ?? 'Unknown epic'))}
          onChange={(id) => setConfig({ epicId: id === ALL ? null : id })}
        />
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Save widget</Button>
      </DialogFooter>
    </form>
  );
}
