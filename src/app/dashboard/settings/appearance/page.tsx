import type { Metadata } from 'next';

import { AppearanceForm } from '@/components/settings/appearance-form';

export const metadata: Metadata = { title: 'Appearance' };

export default function AppearanceSettingsPage() {
  return (
    <>
      <h1 className="text-xl font-medium">Appearance</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">
        Theme and density apply to this browser only.
      </p>
      <AppearanceForm />
    </>
  );
}
