// Workspace → Security: SAML / OIDC single sign-on (+ "Require SSO") and SCIM
// provisioning. Owners and admins manage it; other members get a short note,
// non-members a 404 (slugs can't be probed). Every action re-checks the role.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft, ScrollText, ShieldCheck } from 'lucide-react';

import { getSession } from '@/lib/session';
import { getWorkspaceMembership } from '@/lib/workspace-access';
import {
  DOMAIN_TXT_LABEL,
  domainProofOptional,
  domainVerificationValue,
  emailDomain,
  getWorkspaceSso,
  isFreeMailDomain,
  workspaceSsoUrls,
} from '@/lib/sso';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { EmptyState } from '@/components/ui-icons';
import { ScimSettings } from '@/components/security/scim-settings';
import { WorkspaceSsoSettings } from '@/components/security/workspace-sso-settings';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const [{ slug }, session] = await Promise.all([params, getSession()]);
  const membership = session?.user ? await getWorkspaceMembership(slug, session.user.id) : null;
  return { title: membership ? `Security · ${membership.name}` : 'Workspace not found' };
}

export default async function WorkspaceSecurityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [{ slug }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) redirect('/login');
  const membership = await getWorkspaceMembership(slug, session.user.id);
  if (!membership) notFound();

  const header = (
    <header className="flex items-start gap-3">
      <Button variant="ghost" size="icon-sm" asChild aria-label="Back to workspace">
        <Link href={`/dashboard/workspaces/${membership.slug}`}>
          <ChevronLeft />
        </Link>
      </Button>
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-medium">Security</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Single sign-on and user provisioning for {membership.name}.
        </p>
      </div>
      {membership.role !== 'member' && (
        <Button variant="outline" size="sm" asChild>
          <Link href={`/dashboard/workspaces/${membership.slug}/audit`}>
            <ScrollText />
            Audit log
          </Link>
        </Button>
      )}
    </header>
  );

  if (membership.role === 'member') {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-10">
        {header}
        <EmptyState
          icon={<ShieldCheck />}
          title="Admins only"
          description="Workspace owners and admins manage single sign-on and provisioning."
        />
      </div>
    );
  }

  const workspaceId = membership.workspaceId;
  const view = await getWorkspaceSso(workspaceId);
  const urls = workspaceSsoUrls(workspaceId);
  const ownDomain = emailDomain(session.user.email);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10">
      {header}

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-medium">Single sign-on</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Let people sign in with your identity provider (SAML 2.0 or OpenID Connect). New
            people from your domain join the workspace as members on first sign-in.
          </p>
        </div>
        <WorkspaceSsoSettings
          workspaceId={workspaceId}
          provider={
            view.provider && {
              protocol: view.provider.protocol,
              domain: view.provider.domain,
              issuer: view.provider.issuer,
              saml: view.provider.saml,
              oidc: view.provider.oidc,
            }
          }
          enforced={view.enforced}
          ssoMemberCount={view.ssoMemberIds.length}
          urls={{
            acsUrl: urls.acsUrl,
            spEntityId: urls.spEntityId,
            metadataUrl: urls.metadataUrl,
            oidcRedirectUri: urls.oidcRedirectUri,
          }}
          txtRecord={{ label: DOMAIN_TXT_LABEL, value: domainVerificationValue(workspaceId) }}
          proofOptional={domainProofOptional()}
          suggestedDomain={isFreeMailDomain(ownDomain) ? '' : ownDomain}
        />
      </section>

      <Separator />

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-medium">SCIM provisioning</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Keep workspace membership in sync with your identity provider.
          </p>
        </div>
        <ScimSettings
          workspaceId={workspaceId}
          configured={view.scimConfigured}
          baseUrl={urls.scimBaseUrl}
        />
      </section>
    </div>
  );
}
