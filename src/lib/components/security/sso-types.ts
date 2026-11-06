export type Protocol = 'saml' | 'oidc';

export interface SsoProviderView {
  protocol: Protocol;
  domain: string;
  issuer: string;
  saml: { entryPoint: string; hasMetadata: boolean; hasCert: boolean } | null;
  oidc: { clientId: string; hasSecret: boolean } | null;
}

export interface SsoUrls {
  acsUrl: string;
  spEntityId: string;
  metadataUrl: string;
  oidcRedirectUri: string;
}
