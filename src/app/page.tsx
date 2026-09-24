import { redirect } from 'next/navigation';

// redirect() throws — never wrap it in try/catch.
export default function Home() {
  redirect('/dashboard');
}
