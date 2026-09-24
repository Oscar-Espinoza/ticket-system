'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { updateProfile, type ProfileState } from '@/app/actions/profile';
import { Avatar } from '@/components/ui-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from './field';
import { TimezonePicker } from './timezone-picker';

export interface ProfileFormProps {
  email: string;
  name: string;
  image: string;
  title: string;
  bio: string;
  timezone: string;
  timezones: string[];
}

export function ProfileForm({
  email,
  name,
  image,
  title,
  bio,
  timezone,
  timezones,
}: ProfileFormProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ProfileState, FormData>(
    updateProfile,
    {},
  );
  const [preview, setPreview] = useState({ name, image });
  const errors = state.errors ?? {};

  useEffect(() => {
    if (state.success) {
      toast.success('Profile saved');
      // Sidebar user menu reads the session user from the layout.
      router.refresh();
    } else if (state.errors?.server) {
      toast.error(state.errors.server);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <div className="flex items-center gap-3">
        <Avatar
          name={preview.name || email}
          src={preview.image || null}
          className="size-10 text-sm"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{preview.name || 'Unnamed'}</p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        </div>
      </div>

      <Field id="profile-email" label="Email" hint="Your sign-in email can't be changed here.">
        <Input id="profile-email" value={email} readOnly disabled />
      </Field>

      <Field id="profile-name" label="Name" error={errors.name}>
        <Input
          id="profile-name"
          name="name"
          defaultValue={name}
          maxLength={100}
          required
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? 'profile-name-error' : undefined}
          onChange={(e) => setPreview((p) => ({ ...p, name: e.target.value }))}
        />
      </Field>

      <Field
        id="profile-image"
        label="Avatar URL"
        hint="Link to a square image. Leave empty to use your initials."
        error={errors.image}
      >
        <Input
          id="profile-image"
          name="image"
          type="url"
          inputMode="url"
          placeholder="https://…"
          defaultValue={image}
          aria-invalid={!!errors.image}
          aria-describedby={errors.image ? 'profile-image-error' : undefined}
          onChange={(e) => setPreview((p) => ({ ...p, image: e.target.value.trim() }))}
        />
      </Field>

      <Field id="profile-title" label="Title" hint="e.g. Frontend engineer" error={errors.title}>
        <Input
          id="profile-title"
          name="title"
          defaultValue={title}
          maxLength={100}
          aria-invalid={!!errors.title}
        />
      </Field>

      <Field id="profile-bio" label="Bio" error={errors.bio}>
        <Textarea
          id="profile-bio"
          name="bio"
          defaultValue={bio}
          maxLength={1000}
          rows={3}
          aria-invalid={!!errors.bio}
        />
      </Field>

      <Field
        id="profile-timezone"
        label="Timezone"
        hint="Used for due dates, cycles and reminders."
        error={errors.timezone}
      >
        <TimezonePicker
          id="profile-timezone"
          name="timezone"
          timezones={timezones}
          defaultValue={timezone}
        />
      </Field>

      <div>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Save changes
        </Button>
      </div>
    </form>
  );
}
