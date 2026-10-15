import {redirect} from 'next/navigation';
import {pageSession} from '@/services/session-server';
import {AppShell} from '../ui/app-shell';
import {ElonNewsClient} from './news-client';
export const dynamic='force-dynamic';
export default async function ElonNewsPage(){
 const session=await pageSession();if(!session)redirect('/login');if(session.role!=='admin')redirect('/dashboard');
 return <AppShell title="أخبار إيلون ماسك"><main className="stack"><h1>أخبار إيلون ماسك</h1>
  <p>اكتشاف المصادر، مراجعة الأدلة، والنشر الآمن · توقيت الرياض</p><ElonNewsClient/></main></AppShell>;
}
