import {redirect} from 'next/navigation';
import {pageSession} from '@/services/session-server';
import {AppShell} from '../ui/app-shell';
import {ElonNewsClient} from '../elon-news/news-client';
export const dynamic='force-dynamic';
export default async function AiNewsPage(){
 const session=await pageSession();if(!session)redirect('/login');if(session.role!=='admin')redirect('/dashboard');
 return <AppShell title="أخبار الذكاء الاصطناعي"><main className="stack"><h1>أخبار الذكاء الاصطناعي</h1>
  <p>مصادر رسمية وصحافة تقنية موثوقة، أدلة واضحة ومراجعة الادعاءات · توقيت الرياض</p>
  <p>Anthropic وClaude · xAI وGrok · Gemini · ChatGPT · أدوات البرمجة والصور والفيديو والصوت والأتمتة. أخبار Grok عبر الصحافة التقنية؛ لا نتجاوز المواقع التي تمنع الجلب الآلي، ولا نضمن تغطية كل أداة على الإنترنت.</p>
  <ElonNewsClient endpoint="/api/ai-news" idPrefix="ai" officialSources/>
 </main></AppShell>;
}
