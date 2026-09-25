// Query cost guards: a max selection depth and a max number of field
// selections per operation (aliases can't multiply work past it). Fragments are
// followed; introspection fields (`__schema`, `__type`, `__typename`) are free
// so GraphiQL / codegen introspection still works.

import {
  GraphQLError,
  Kind,
  type ASTVisitor,
  type FragmentDefinitionNode,
  type SelectionSetNode,
  type ValidationContext,
} from 'graphql';

export const MAX_DEPTH = 6;
export const MAX_FIELDS = 500;

export function costLimitRule(context: ValidationContext): ASTVisitor {
  const fragments = new Map<string, FragmentDefinitionNode>();
  for (const def of context.getDocument().definitions) {
    if (def.kind === Kind.FRAGMENT_DEFINITION) fragments.set(def.name.value, def);
  }

  function measure(set: SelectionSetNode, depth: number, seen: Set<string>): { depth: number; fields: number } {
    let max = depth;
    let fields = 0;
    for (const sel of set.selections) {
      if (sel.kind === Kind.FIELD) {
        if (sel.name.value.startsWith('__')) continue;
        fields += 1;
        if (sel.selectionSet) {
          const inner = measure(sel.selectionSet, depth + 1, seen);
          max = Math.max(max, inner.depth);
          fields += inner.fields;
        } else {
          max = Math.max(max, depth + 1);
        }
      } else {
        let inner: SelectionSetNode | undefined;
        if (sel.kind === Kind.INLINE_FRAGMENT) inner = sel.selectionSet;
        else if (!seen.has(sel.name.value)) inner = fragments.get(sel.name.value)?.selectionSet;
        if (!inner) continue; // unknown / cyclic spreads are reported by the standard rules
        const next = sel.kind === Kind.FRAGMENT_SPREAD ? new Set([...seen, sel.name.value]) : seen;
        const result = measure(inner, depth, next);
        max = Math.max(max, result.depth);
        fields += result.fields;
      }
      if (fields > MAX_FIELDS) break;
    }
    return { depth: max, fields };
  }

  return {
    OperationDefinition(node) {
      const { depth, fields } = measure(node.selectionSet, 0, new Set());
      if (depth > MAX_DEPTH) {
        context.reportError(
          new GraphQLError(`Query depth ${depth} exceeds the maximum of ${MAX_DEPTH}.`, {
            nodes: [node],
          }),
        );
      }
      if (fields > MAX_FIELDS) {
        context.reportError(
          new GraphQLError(`Query selects more than ${MAX_FIELDS} fields.`, { nodes: [node] }),
        );
      }
    },
  };
}
