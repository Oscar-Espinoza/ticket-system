// Account settings frame. The dashboard layout already guarantees a session.

import { ACCOUNT_SETTINGS_NAV } from '@/components/app-shell/routes';
import { SettingsFrame, SettingsNav } from '@/components/app-shell/settings-nav';

export default function AccountSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SettingsFrame
      nav={
        <SettingsNav
          label="Account"
          items={ACCOUNT_SETTINGS_NAV.map((item) => ({
            href: `/dashboard/settings/${item.segment}`,
            label: item.label,
          }))}
        />
      }
    >
      {children}
    </SettingsFrame>
  );
}
