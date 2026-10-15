import {createHash} from 'node:crypto';
import {z} from 'zod';

// Fixed HTTPS endpoints prevent feed configuration from becoming an SSRF proxy.
// Approval/disable is an administrator choice, not something feed text can control.
export const SOURCES = [
 {id:'aitnews',name:'البوابة العربية للأخبار التقنية',url:'https://aitnews.com/feed/',host:'aitnews.com',group:'aitnews'},
 {id:'ars',name:'Ars Technica',url:'https://feeds.arstechnica.com/arstechnica/index',host:'arstechnica.com',group:'ars'},
 {id:'techcrunch',name:'TechCrunch',url:'https://techcrunch.com/feed/',host:'techcrunch.com',group:'techcrunch'},
 {id:'verge',name:'The Verge',url:'https://www.theverge.com/rss/index.xml',host:'theverge.com',group:'verge'},
] as const;
export const configSchema=z.object({
 monitoring:z.boolean(),autoPublish:z.boolean(),pageId:z.uuid().nullable(),
 sourceIds:z.array(z.enum(['aitnews','ars','techcrunch','verge'])).max(4),
 pollMinutes:z.number().int().min(10).max(1440),dailyLimit:z.number().int().min(1).max(30),
 minIntervalMinutes:z.number().int().min(10).max(1440),
}).strict().refine(v=>!v.autoPublish||(v.monitoring&&v.pageId&&v.sourceIds.length>0),{message:'Select a Page and approved sources before enabling publishing'});
export type NewsConfig=z.infer<typeof configSchema>;
export const DEFAULT_CONFIG:NewsConfig={monitoring:false,autoPublish:false,pageId:null,sourceIds:[],pollMinutes:30,dailyLimit:5,minIntervalMinutes:60};
export const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function canonicalUrl(value:string,host?:string){
 const u=new URL(value);
 if(u.protocol!=='https:'||u.username||u.password||u.port||(host&&u.hostname!==host&&u.hostname!==`www.${host}`))throw new Error('SOURCE_URL_REFUSED');
 u.hash='';u.hostname=u.hostname.toLowerCase().replace(/^www\./,'');
 for(const key of [...u.searchParams.keys()])if(/^utm_|^(fbclid|gclid|mc_cid|mc_eid|ref)$/i.test(key))u.searchParams.delete(key);
 u.searchParams.sort();u.pathname=u.pathname.replace(/\/$/,'')||'/';return u.toString();
}
export function normalizedTitle(value:string){
 return value.normalize('NFKC').toLowerCase().replace(/[\u064b-\u065f\u0670]/g,'').replace(/[أإآ]/g,'ا')
  .replace(/\b(breaking|updated|exclusive)\b|عاجل|تحديث/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
}
export function similarity(a:string,b:string){
 const stop=new Set(['elon','musk','إيلون','ايلون','ماسك','the','a','to','of','and','in','on','for','is','في','من','على','عن']);
 const tokens=(s:string)=>new Set(normalizedTitle(s).split(' ').filter(t=>t.length>1&&!stop.has(t)));
 const x=tokens(a),y=tokens(b);const shared=[...x].filter(t=>y.has(t)).length;
 return shared/Math.max(1,new Set([...x,...y]).size);
}
export const relevant=(title:string)=>/\belon\s+musk\b|إيلون\s+ماسك|ايلون\s+ماسك/i.test(title);
export const speculative=(text:string)=>/\b(rumou?rs?|unconfirmed|satire|could|might|reportedly|allegedly)\b|شائع[ةات]|غير مؤكد|ساخر|قد يكون|من المحتمل|ربما|يُشاع/i.test(text);
export function validArabicPost(text:string,evidence:string){
 if(text.length<15||text.length>1500||/https?:|<[^>]+>|access_token|Bearer /i.test(text))return false;
 const letters=text.match(/\p{L}/gu)??[],arabic=text.match(/\p{Script=Arabic}/gu)??[];
 if(arabic.length<10||arabic.length/Math.max(1,letters.length)<.55)return false;
 // A translation may not invent numeric claims, including Arabic-Indic digits.
 const digits=(s:string):string[]=>s.replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x660)).match(/\d+(?:[.,]\d+)*/g)??[];
 return digits(text).every(n=>digits(evidence).includes(n));
}
export const retryDelaySeconds=(attempt:number)=>Math.min(21600,60*2**Math.min(Math.max(attempt-1,0),8));
export function riyadhDay(date:Date){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
