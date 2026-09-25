'use client';

// Switches save as they flip (optimistic; reverted with a toast on failure).

import { useState, useTransition } from 'react';
import { Send } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { sendTestEmail, updateNotificationPrefs } from '@/app/actions/notifications';
import { NOTIFICATION_PREFS, prefEnabled } from '@/lib/notifications/types';
import { cn } from '@/lib/utils';

export function NotificationPrefsForm({
  email,
  emailEnabled: initialEmail,
  prefs: initialPrefs,
}: {
  email: string;
  emailEnabled: boolean;
  prefs: Record<string, boolean>;
}) {
  const [emailEnabled, setEmailEnabled] = useState(initialEmail);
  const [prefs, setPrefs] = useState(initialPrefs);
  const [testing, startTest] = useTransition();

  const save = async (patch: Parameters<typeof updateNotificationPrefs>[0], revert: () => void) => {
    const result = await updateNotificationPrefs(patch).catch(() => null);
    if (!result?.ok) {
      revert();
      toast.error(result?.error ?? 'Could not save your settings');
    }
  };

  const toggleEmail = (on: boolean) => {
    setEmailEnabled(on);
    void save({ email: on }, () => setEmailEnabled(!on));
  };

  const togglePref = (type: string, on: boolean) => {
    setPrefs((prev) => ({ ...prev, [type]: on }));
    void save({ prefs: { [type]: on } }, () => setPrefs((prev) => ({ ...prev, [type]: !on })));
  };

  const test = () =>
    startTest(async () => {
      const result = await sendTestEmail().catch(() => null);
      if (!result?.ok) toast.error(result?.error ?? 'Could not send the test email');
      else if (result.delivered) toast.success(`Test email sent to ${email}`);
      else
        toast.warning('Email delivery is not configured on this server', {
          description: 'Set RESEND_API_KEY and EMAIL_FROM. The message was written to the server log.',
        });
    });

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="mb-1 text-base font-medium">Email</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Notifications are always in your inbox. Email copies go to {email}.
        </p>
        <SwitchRow
          id="notify-email"
          label="Email me about notifications"
          description="One email per batch of updates, linking back to the issue."
          checked={emailEnabled}
          onChange={toggleEmail}
        />
        <Button variant="outline" size="sm" className="mt-4" onClick={test} disabled={testing}>
          <Send />
          {testing ? 'Sending…' : 'Send test email'}
        </Button>
      </section>

      <Separator />

      <section>
        <h2 className="mb-1 text-base font-medium">Notify me when</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Turning a type off stops both the inbox item and its email. Reminders you set are always
          delivered.
        </p>
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {NOTIFICATION_PREFS.map((pref) => (
            <SwitchRow
              key={pref.type}
              id={`notify-${pref.type}`}
              label={pref.label}
              description={pref.description}
              checked={prefEnabled(prefs, pref.type)}
              onChange={(on) => togglePref(pref.type, on)}
              className="px-4 py-3"
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function SwitchRow({
  id,
  label,
  description,
  checked,
  onChange,
  className,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-4', className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
