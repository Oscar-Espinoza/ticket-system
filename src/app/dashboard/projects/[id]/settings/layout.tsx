// Project settings frame. The project layout above has already checked
// membership (non-members 404); each settings action re-checks the role.

import { PROJECT_SETTINGS_NAV, projectHref } from '@/components/app-shell/routes';
import { SettingsFrame, SettingsNav } from '@/components/app-shell/settings-nav';

export default async function ProjectSettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <SettingsFrame
      nav={
        <SettingsNav
          label="Project settings"
          items={PROJECT_SETTINGS_NAV.map((item) => ({
            href: projectHref(id, `settings/${item.segment}`),
            label: item.label,
          }))}
        />
      }
    >
      {children}
    </SettingsFrame>
  );
}
