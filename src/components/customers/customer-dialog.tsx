'use client';

// Create / edit a customer, and the admin-only delete confirmation.

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UserRound } from 'lucide-react';
import { toast } from 'sonner';

import { createCustomer, deleteCustomer, updateCustomer } from '@/app/actions/customers';
import { MemberPicker } from '@/components/epics/epic-pickers';
import { useProjectData } from '@/components/project/project-data';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import { Avatar } from '@/components/ui-icons';
import { STATUS_DOT_CLASS } from './customer-glyphs';
import {
  CUSTOMER_NAME_MAX,
  CUSTOMER_STATUSES,
  CUSTOMER_STATUS_LABEL,
  CUSTOMER_TIER_MAX,
  customerPath,
  isCustomerStatus,
  splitDomains,
  type CustomerRow,
  type CustomerStatus,
} from './customer-model';

type Field = 'name' | 'domains' | 'tier' | 'revenue' | 'size' | 'ownerId';

/** "120k" / "1.5m" / "120,000" → 120000; '' → null; NaN when unparseable. */
function parseAmount(value: string): number | null {
  const trimmed = value.trim().toLowerCase().replace(/[$,\s_]/g, '');
  if (!trimmed) return null;
  const match = /^(\d+(?:\.\d+)?)([km]?)$/.exec(trimmed);
  if (!match) return Number.NaN;
  const scale = match[2] === 'k' ? 1_000 : match[2] === 'm' ? 1_000_000 : 1;
  return Math.round(Number(match[1]) * scale);
}

export function CustomerDialog({
  open,
  onOpenChange,
  customer,
  tiers = [],
  openAfterCreate = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this customer; create when absent. */
  customer?: CustomerRow;
  /** Tier suggestions (tiers already in use). */
  tiers?: string[];
  openAfterCreate?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Remount per open so the form starts from the current values. */}
        {open && (
          <CustomerForm
            customer={customer}
            tiers={tiers}
            openAfterCreate={openAfterCreate}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CustomerForm({
  customer,
  tiers,
  openAfterCreate,
  onDone,
}: {
  customer?: CustomerRow;
  tiers: string[];
  openAfterCreate: boolean;
  onDone: () => void;
}) {
  const { project, members, viewer } = useProjectData();
  const router = useRouter();
  const uid = useId();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(customer?.name ?? '');
  const [domains, setDomains] = useState(customer?.domains.join(', ') ?? '');
  const [status, setStatus] = useState<CustomerStatus>(customer?.status ?? 'active');
  const [tier, setTier] = useState(customer?.tier ?? '');
  const [revenue, setRevenue] = useState(customer?.revenue?.toString() ?? '');
  const [size, setSize] = useState(customer?.size?.toString() ?? '');
  const [ownerId, setOwnerId] = useState<string | null>(
    customer ? (customer.owner?.id ?? null) : viewer.id,
  );
  const [error, setError] = useState<{ message: string; field?: Field } | null>(null);
  const owner = members.find((m) => m.id === ownerId) ?? customer?.owner ?? null;

  function submit(event?: React.FormEvent) {
    event?.preventDefault();
    if (!name.trim() || pending) return;
    const revenueValue = parseAmount(revenue);
    const sizeValue = parseAmount(size);
    if (Number.isNaN(revenueValue)) {
      setError({ message: 'Enter revenue as a number, e.g. 120000 or 120k.', field: 'revenue' });
      return;
    }
    if (Number.isNaN(sizeValue)) {
      setError({ message: 'Enter size as a number of employees.', field: 'size' });
      return;
    }
    const input = {
      name,
      domains: splitDomains(domains),
      status,
      tier: tier.trim() || null,
      revenue: revenueValue,
      size: sizeValue,
      ownerId,
    };
    startTransition(async () => {
      if (customer) {
        const result = await updateCustomer({ projectId: project.id, id: customer.id, patch: input });
        if (!result.ok) {
          setError({ message: result.error, field: result.field as Field | undefined });
          return;
        }
        toast.success('Customer updated');
        onDone();
        return;
      }
      const result = await createCustomer({ projectId: project.id, ...input });
      if (!result.ok) {
        setError({ message: result.error, field: result.field as Field | undefined });
        return;
      }
      toast.success(`Created customer “${name.trim()}”`);
      onDone();
      if (openAfterCreate) router.push(customerPath(project.id, result.id));
    });
  }

  const invalid = (field: Field) => (error?.field === field ? true : undefined);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{customer ? 'Edit customer' : 'New customer'}</DialogTitle>
        <DialogDescription>
          Requests from these email domains are linked to the customer automatically.
        </DialogDescription>
      </DialogHeader>
      <form
        onSubmit={submit}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit(event);
        }}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${uid}-name`}>Name</Label>
          <Input
            id={`${uid}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Inc."
            maxLength={CUSTOMER_NAME_MAX}
            autoFocus
            aria-invalid={invalid('name')}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${uid}-domains`}>Domains</Label>
          <Input
            id={`${uid}-domains`}
            value={domains}
            onChange={(e) => setDomains(e.target.value)}
            placeholder="acme.com, acme.io"
            aria-invalid={invalid('domains')}
            aria-describedby={`${uid}-domains-hint`}
          />
          <p id={`${uid}-domains-hint`} className="text-xs text-muted-foreground">
            Separate with commas. Subdomains match too.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-status`}>Status</Label>
            <Select value={status} onValueChange={(v) => isCustomerStatus(v) && setStatus(v)}>
              <SelectTrigger id={`${uid}-status`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CUSTOMER_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    <span className={`size-2 rounded-full ${STATUS_DOT_CLASS[s]}`} />
                    {CUSTOMER_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-tier`}>Tier</Label>
            <Input
              id={`${uid}-tier`}
              value={tier}
              onChange={(e) => setTier(e.target.value)}
              placeholder="Enterprise"
              maxLength={CUSTOMER_TIER_MAX}
              list={`${uid}-tiers`}
              aria-invalid={invalid('tier')}
            />
            <datalist id={`${uid}-tiers`}>
              {tiers.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-revenue`}>Annual revenue (USD)</Label>
            <Input
              id={`${uid}-revenue`}
              value={revenue}
              onChange={(e) => setRevenue(e.target.value)}
              placeholder="120k"
              inputMode="decimal"
              aria-invalid={invalid('revenue')}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-size`}>Size (employees)</Label>
            <Input
              id={`${uid}-size`}
              value={size}
              onChange={(e) => setSize(e.target.value)}
              placeholder="250"
              inputMode="numeric"
              aria-invalid={invalid('size')}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Owner</span>
          <MemberPicker
            value={ownerId}
            members={members}
            viewerId={viewer.id}
            onChange={setOwnerId}
            placeholder="Set owner…"
            noneLabel="No owner"
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit font-normal"
              aria-label={`Owner: ${owner?.name ?? 'none'}`}
            >
              {owner ? (
                <>
                  <Avatar name={owner.name} src={owner.image} size={20} className="-my-1 size-4" />
                  {owner.name}
                </>
              ) : (
                <>
                  <UserRound />
                  <span className="text-muted-foreground">No owner</span>
                </>
              )}
            </Button>
          </MemberPicker>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error.message}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || pending}>
            {customer ? 'Save' : 'Create customer'}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function DeleteCustomerDialog({
  customer,
  onOpenChange,
  onDeleted,
}: {
  /** Open while set. */
  customer: Pick<CustomerRow, 'id' | 'name'> | null;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const { project } = useProjectData();
  const [pending, startTransition] = useTransition();
  const remove = () =>
    startTransition(async () => {
      if (!customer) return;
      const result = await deleteCustomer({ projectId: project.id, id: customer.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Deleted ${customer.name}`);
      onOpenChange(false);
      onDeleted?.();
    });

  return (
    <AlertDialog open={customer !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {customer?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            The customer is removed permanently. Their requests stay on the issues, without a
            customer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              remove();
            }}
          >
            Delete customer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
