// Executable schema + yoga server for /api/graphql (built once per instance).

import { createSchema, createYoga, type Plugin } from 'graphql-yoga';

import type { ApiCredential } from '@/lib/api-auth';
import { createLoaders, type GraphQLContext } from './context';
import { costLimitRule } from './limits';
import { resolvers } from './resolvers';
import { typeDefs } from './type-defs';

export const schema = createSchema<GraphQLContext>({ typeDefs, resolvers });

export interface GraphQLServerContext {
  credential: ApiCredential | null;
}

const costLimits: Plugin = {
  onValidate({ addValidationRule }) {
    addValidationRule(costLimitRule);
  },
};

export const yoga = createYoga<GraphQLServerContext, GraphQLContext>({
  schema,
  graphqlEndpoint: '/api/graphql',
  graphiql: process.env.NODE_ENV === 'development',
  landingPage: false,
  fetchAPI: { Response },
  // Fresh loaders per request: caches never outlive the caller's permissions.
  context: ({ credential }) => ({
    credential,
    loaders: createLoaders(credential?.userId ?? ''),
  }),
  plugins: [costLimits],
});
