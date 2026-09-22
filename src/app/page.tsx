import { redirect } from 'next/navigation';

// M1: the stock create-next-app landing is gone. `/` hands off to the guarded
// dashboard, which sends unauthenticated users to /login. redirect() throws —
// never wrap it in try/catch (Next.js docs: redirect API).
export default function Home() {
  redirect('/dashboard');
}
