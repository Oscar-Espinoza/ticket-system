/** The author deletes their own update; a project admin deletes anyone's. */
export function canDeleteUpdate(isAdmin: boolean, authorId: string | undefined, userId: string): boolean {
  return isAdmin || authorId === userId;
}
