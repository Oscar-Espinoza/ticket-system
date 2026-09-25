'use client';

// Public intake form (/request/[token]). No app chrome, no toasts (the public
// page has no Toaster): every state renders inline.

import { useActionState, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';

import { submitIntakeRequest, type IntakeFormState } from '@/app/actions/intake';
import { Field } from '@/components/settings/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export function IntakeForm({ token, stamp }: { token: string; stamp: string }) {
  // Remounting the form after "Submit another" resets the action state.
  const [round, setRound] = useState(0);
  return <FormBody key={round} token={token} stamp={stamp} onAgain={() => setRound((n) => n + 1)} />;
}

function FormBody({
  token,
  stamp,
  onAgain,
}: {
  token: string;
  stamp: string;
  onAgain: () => void;
}) {
  const [state, action, pending] = useActionState<IntakeFormState, FormData>(
    submitIntakeRequest,
    {},
  );
  const errors = state.errors ?? {};
  const values = state.values ?? {};

  if (state.status === 'success') {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center" role="status">
        <CheckCircle2 aria-hidden="true" className="size-8 text-emerald-500" />
        <p className="text-base font-medium">Thanks — your request was received.</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          The team will review it and follow up by email if they need more details.
        </p>
        <Button variant="outline" size="sm" className="mt-2" onClick={onAgain}>
          Submit another request
        </Button>
      </div>
    );
  }

  const describedBy = (field: keyof typeof errors) =>
    errors[field] ? `intake-${field}-error` : undefined;

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="stamp" value={stamp} />
      {/* Honeypot: invisible to people, irresistible to form-filling bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="intake-website">Website</label>
        <input id="intake-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="intake-name" label="Name" error={errors.name}>
          <Input
            id="intake-name"
            name="name"
            defaultValue={values.name}
            maxLength={100}
            autoComplete="name"
            aria-invalid={!!errors.name}
            aria-describedby={describedBy('name')}
          />
        </Field>
        <Field id="intake-email" label="Email" error={errors.email}>
          <Input
            id="intake-email"
            name="email"
            type="email"
            defaultValue={values.email}
            maxLength={200}
            autoComplete="email"
            required
            aria-invalid={!!errors.email}
            aria-describedby={describedBy('email')}
          />
        </Field>
      </div>
      <Field id="intake-title" label="Summary" error={errors.title}>
        <Input
          id="intake-title"
          name="title"
          defaultValue={values.title}
          maxLength={200}
          placeholder="What do you need?"
          required
          aria-invalid={!!errors.title}
          aria-describedby={describedBy('title')}
        />
      </Field>
      <Field
        id="intake-description"
        label="Details"
        hint="Steps to reproduce, links, what you expected — anything that helps."
        error={errors.description}
      >
        <Textarea
          id="intake-description"
          name="description"
          defaultValue={values.description}
          maxLength={8000}
          rows={6}
          aria-invalid={!!errors.description}
          aria-describedby={describedBy('description')}
        />
      </Field>

      {errors.server && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errors.server}
        </p>
      )}

      <div>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Send request
        </Button>
      </div>
    </form>
  );
}
