import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { once } from "node:events";
import { sql } from "drizzle-orm";
import { assertDisposableDatabase } from "../tests/database-safety";
import { getDb } from "../src/db";
import { createSessionToken, SESSION_COOKIE } from "../src/services/request-auth";
import { leadAnalyticsQuery,leadAnalyticsRange,leadAnalyticsSummary,type LeadAnalyticsRow } from "../src/services/leads-analytics";

// Real HTTP requests to the built application, using synthetic users and an isolated DB.
// This is not a production-browser test and never runs Cron, publishing or Meta calls.
assertDisposableDatabase(process.env.TEST_DATABASE_URL,process.env.DISPOSABLE_TEST_DATABASE_HOST,process.env.DATABASE_URL);
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.AUTH_SECRET = randomBytes(32).toString("hex");
const db = getDb();
const pageId = randomUUID(),editorId = randomUUID(),viewerId = randomUUID(),adminId = randomUUID(),leadId = randomUUID();
await db.execute(sql`insert into facebook_pages(id,name,facebook_page_id,platform,is_active) values(${pageId}::uuid,'HTTP QA page',${`qa-${pageId}`},'facebook',true)`);
for (const [id,role] of [[editorId,"editor"],[viewerId,"viewer"],[adminId,"admin"]]) {
  await db.execute(sql`insert into users(id,email,name,role,is_active) values(${id}::uuid,${`${id}@example.test`},'HTTP QA user',${role},true)`);
  await db.execute(sql`insert into settings(key,value) values(${`user_access_scope:${id}`},${JSON.stringify({unrestricted:false,accountIds:[],pageIds:[pageId]})})`);
}
const editorToken = await createSessionToken({userId:editorId,role:"editor"});
const viewerToken = await createSessionToken({userId:viewerId,role:"viewer"});
const adminToken = await createSessionToken({userId:adminId,role:"admin"});
// Next's production route adapter canonicalizes its local origin to localhost.
const origin = "http://localhost:3217";
const environment: NodeJS.ProcessEnv = { NODE_ENV:"production", DATABASE_URL:process.env.TEST_DATABASE_URL, AUTH_SECRET:process.env.AUTH_SECRET, NEXT_TELEMETRY_DISABLED:"1", APP_URL:origin };
for(const key of ["PATH","Path","SystemRoot","WINDIR","TEMP","TMP","USERPROFILE","APPDATA","LOCALAPPDATA"]) if(process.env[key]) environment[key]=process.env[key];
const server = spawn(process.execPath,[resolve("node_modules/next/dist/bin/next"),"start","--hostname","localhost","--port","3217"],{env:environment,windowsHide:true,stdio:["ignore","pipe","pipe"]});
let output = "";
server.stdout.on("data",chunk => { output=(output+String(chunk)).slice(-12000); });
server.stderr.on("data",chunk => { output=(output+String(chunk)).slice(-12000); });
const exited = once(server,"exit");
const redact = (text:string) => [process.env.TEST_DATABASE_URL,process.env.AUTH_SECRET,editorToken,viewerToken,adminToken].reduce<string>((value,secret) => secret ? value.split(secret).join("[redacted]") : value,text);
async function call(path:string,body?:unknown,token=editorToken,requestOrigin=origin,method="POST") {
  return fetch(`${origin}${path}`,{method:body === undefined ? "GET" : method,headers:{...(token?{cookie:`${SESSION_COOKIE}=${token}`}:{ }),...(body===undefined?{}:{origin:requestOrigin,"content-type":"application/json"})},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:"manual",signal:AbortSignal.timeout(15000)});
}
try {
  let ready = false;
  for(let attempt=0;attempt<50;attempt++) {
    if(server.exitCode !== null) throw new Error("QA server stopped before readiness");
    try { ready=(await fetch(`${origin}/login`,{signal:AbortSignal.timeout(1000)})).ok; } catch { /* startup only */ }
    if(ready) break;
    await new Promise(resolve => setTimeout(resolve,200));
  }
  assert.equal(ready,true,"built QA server must start");
  console.log("CRM HTTP QA: built server ready on loopback; no external-service credentials.");
  const input = {id:leadId,pageId,name:`HTTP QA ${leadId}`,contact:null,status:"new",notes:"ملاحظة اختبار"};
  assert.equal((await call("/api/leads",input,"")).status,401);
  assert.equal((await call("/api/leads",input,editorToken,"https://outside.example.test")).status,403);
  assert.equal((await call("/api/leads",input,viewerToken)).status,403);
  const outsidePage = await call("/api/leads",{...input,pageId:randomUUID()});
  assert.equal(outsidePage.status,404,await outsidePage.text());
  const results = await Promise.all([call("/api/leads",input),call("/api/leads",input)]);
  assert.deepEqual(results.map(r => r.status).sort(),[200,201]);
  for(const response of results) assert.deepEqual(await response.json(),{id:leadId});
  console.log("CRM HTTP QA: authorization, page scope and concurrent create/retry passed.");
  const form = await call("/leads/new");assert.equal(form.status,200);
  const formHtml = await form.text();assert.ok(formHtml.includes("HTTP QA page"));assert.ok(formHtml.includes("اسم العميل"));
  const detail = await call(`/leads/${leadId}`);assert.equal(detail.status,200);assert.ok((await detail.text()).includes(input.name));
  const version = async () => String((await db.execute(sql`select updated_at::text as version from leads where id=${leadId}::uuid`)).rows[0].version);
  const oldVersion = await version();
  assert.equal((await call(`/api/leads/${leadId}`,{status:"qualified",expectedUpdatedAt:oldVersion},editorToken,origin,"PATCH")).status,200);
  assert.equal((await call(`/api/leads/${leadId}`,{status:"won",expectedUpdatedAt:oldVersion},editorToken,origin,"PATCH")).status,409);
  const dueAt = new Date(Date.now()+3600000).toISOString();
  assert.equal((await call(`/api/leads/${leadId}/followup`,{action:"schedule",dueAt,expectedUpdatedAt:await version()},editorToken,origin,"PATCH")).status,200);
  const list = await call(`/leads?q=${encodeURIComponent(input.name)}&followup=upcoming`);assert.equal(list.status,200);assert.ok((await list.text()).includes(input.name));
  assert.equal((await call(`/api/leads/${leadId}/followup`,{action:"complete",expectedUpdatedAt:await version()},editorToken,origin,"PATCH")).status,200);
  const completed = await db.execute(sql`select status,follow_up_completed_at is not null as completed,last_contact_at is not null as contacted from leads where id=${leadId}::uuid`);
  assert.deepEqual(completed.rows[0],{status:"qualified",completed:true,contacted:true});
  console.log("CRM HTTP QA: form/detail server rendering, edit conflicts, follow-up schedule/filter/completion passed.");
  const tag=`visibility-${randomUUID()}`;
  const hiddenPage=randomUUID(),hiddenLead=randomUUID();
  await db.execute(sql`update leads set name=${`${tag} visible lead`},contact=${`${tag}-contact-only`} where id=${leadId}::uuid`);
  await db.execute(sql`update facebook_pages set name=${`${tag} visible page`} where id=${pageId}::uuid`);
  await db.execute(sql`insert into facebook_pages(id,name,facebook_page_id,is_active) values(${hiddenPage}::uuid,${`${tag} hidden page`},${`qa-${hiddenPage}`},true)`);
  await db.execute(sql`insert into leads(id,page_id,name) values(${hiddenLead}::uuid,${hiddenPage}::uuid,${`${tag} hidden lead`})`);
  await db.execute(sql`update leads set status='won' where id=${hiddenLead}::uuid`);
  const metrics=(await db.execute(leadAnalyticsQuery(leadAnalyticsRange({days:"7"}),new Set([pageId])))).rows as LeadAnalyticsRow[];
  assert.deepEqual(leadAnalyticsSummary(metrics),{total:1,won:0,lost:0,conversion:0});
  const emptyMetrics=(await db.execute(leadAnalyticsQuery(leadAnalyticsRange({days:"7"}),new Set()))).rows as LeadAnalyticsRow[];
  assert.equal(leadAnalyticsSummary(emptyMetrics).conversion,null);
  const filteredMetrics=async(platform:'facebook'|'instagram',selected=pageId)=>(await db.execute(leadAnalyticsQuery(leadAnalyticsRange({days:'7'}),new Set([pageId]),{platform,pageId:selected}))).rows as LeadAnalyticsRow[];
  assert.equal(leadAnalyticsSummary(await filteredMetrics('facebook')).total,1);
  assert.equal(leadAnalyticsSummary(await filteredMetrics('instagram')).total,0);
  assert.equal(leadAnalyticsSummary(await filteredMetrics('facebook',hiddenPage)).total,0);
  const deniedReport=await call(`/leads/analytics?pageId=${hiddenPage}`);assert.equal(deniedReport.status,200);
  const deniedHtml=await deniedReport.text();assert.ok(deniedHtml.includes('الصفحة غير متاحة'));assert.equal(deniedHtml.includes(`${tag} hidden`),false);
  const instagramReport=await call('/leads/analytics?platform=instagram');assert.ok((await instagramReport.text()).includes('غير متاحة'));
  const analytics=await call("/leads/analytics?days=7");assert.equal(analytics.status,200);
  const analyticsHtml=await analytics.text();assert.ok(analyticsHtml.includes("ملخص الفترة"));assert.ok(analyticsHtml.includes(`${tag} visible page`));assert.equal(analyticsHtml.includes(`${tag} hidden page`),false);
  const invalidAnalytics=await call("/leads/analytics?from=bad");assert.ok((await invalidAnalytics.text()).includes("الفترة غير صالحة"));
  const exportPath=`/api/leads/analytics/export?days=7&platform=facebook&pageId=${pageId}`;
  assert.equal((await call(exportPath,undefined,'')).status,401);
  for(const token of [editorToken,viewerToken])assert.equal((await call(exportPath,undefined,token)).status,403);
  assert.equal(analyticsHtml.includes('تصدير التقرير CSV'),false,'editor must not see export control');
  const adminReport=await call(`/leads/analytics?days=7&platform=facebook&pageId=${pageId}`,undefined,adminToken);
  const adminHtml=await adminReport.text();assert.equal(adminReport.status,200);assert.ok(adminHtml.includes('تصدير التقرير CSV'));
  assert.ok(adminHtml.includes('/api/leads/analytics/export?from='));assert.ok(adminHtml.includes(`pageId=${pageId}`));
  const exportResponse=await call(exportPath,undefined,adminToken);assert.equal(exportResponse.status,200);
  assert.match(exportResponse.headers.get('content-type')!,/text\/csv/);
  assert.match(exportResponse.headers.get('content-disposition')!,/attachment; filename="leads-analytics-/);
  assert.equal(exportResponse.headers.get('cache-control'),'no-store');
  const exportBytes=new Uint8Array(await exportResponse.arrayBuffer());assert.deepEqual(Array.from(exportBytes.slice(0,3)),[239,187,191]);
  const exported=new TextDecoder().decode(exportBytes);
  assert.match(exported,/الإجمالي,1,0,0,0,/);assert.match(exported,/يدوي,1,0,0,0,/);assert.match(exported,/Asia\/Riyadh/);
  for(const privateText of [tag,'contact-only','ملاحظة اختبار',hiddenLead,hiddenPage])assert.equal(exported.includes(privateText),false,'aggregate export must exclude private/unselected data');
  const noDataExport=await call(`/api/leads/analytics/export?days=7&platform=instagram&pageId=${pageId}`,undefined,adminToken);
  assert.equal(noDataExport.status,200);assert.match(await noDataExport.text(),/الإجمالي,0,0,0,غير متاحة/);
  for(const query of ['from=bad','platform=tiktok','pageId=invalid'])assert.equal((await call(`/api/leads/analytics/export?${query}`,undefined,adminToken)).status,400);
  const exportAudits=await db.execute(sql`select metadata from activity_logs where action='export.downloaded' and metadata->>'kind'='leads-analytics' and metadata->>'pageId'=${pageId}`);
  assert.equal(exportAudits.rows.length,2);
  for(const row of exportAudits.rows)assert.equal(JSON.stringify(row.metadata).includes('contact-only'),false);
  await db.execute(sql`update users set role='viewer' where id=${adminId}::uuid`);
  assert.equal((await call(exportPath,undefined,adminToken)).status,403,'stale admin cookie must lose export permission');
  const downgradedReport=await call(`/leads/analytics?pageId=${pageId}`,undefined,adminToken);
  assert.equal((await downgradedReport.text()).includes('تصدير التقرير CSV'),false);
  console.log('CRM HTTP QA: aggregate CSV bytes, filtered totals, unavailable conversion, safe audit and current-role export authorization passed.');
  for(const [target,visibility] of [[pageId,"visible"],[hiddenPage,"hidden"]]) {
    const campaign=randomUUID(),post=randomUUID();const name=`${tag} ${visibility}`;
    await db.execute(sql`insert into campaigns(id,name) values(${campaign}::uuid,${`${name} campaign`})`);
    await db.execute(sql`insert into posts(id,page_id,content,status,campaign_id) values(${post}::uuid,${target}::uuid,${`${name} post`},'draft',${campaign}::uuid)`);
    const url=`https://example.test/${post}.png`;
    await db.execute(sql`insert into media_assets(name,url) values(${`${name} media`},${url})`);
    await db.execute(sql`insert into post_media(post_id,type,url) values(${post}::uuid,'image',${url})`);
    await db.execute(sql`insert into activity_logs(action,entity_type,entity_id,metadata) values('lead.updated','lead',${visibility==='visible'?leadId:hiddenLead},${JSON.stringify({actor:`${name} actor`})}::jsonb)`);
  }
  await db.execute(sql`insert into post_templates(name,content) values(${`${tag} unscoped template`},'QA only')`);
  await db.execute(sql`insert into activity_logs(action,entity_type,entity_id,metadata) values(${`${tag}.global`},'user',null,${JSON.stringify({actor:`${tag} hidden global actor`})}::jsonb)`);
  // Orphan UUIDs must fail closed without disclosing historical activity.
  await db.execute(sql`insert into activity_logs(action,entity_type,entity_id,metadata) values('post.updated','post',${randomUUID()}::uuid,'{}'::jsonb)`);
  const search=await call(`/api/search?q=${encodeURIComponent(tag)}`);assert.equal(search.status,200);
  const searchBody=await search.json() as {results:Array<{label:string;type:string}>};
  for(const type of ["منشور","وسائط","صفحة","حملة","عميل محتمل"])assert.ok(searchBody.results.some(result=>result.type===type&&result.label.includes("visible")),`${type} accessible result must remain available`);
  const contactSearch=await call(`/api/search?q=${encodeURIComponent(`${tag}-contact-only`)}`);
  assert.equal(contactSearch.status,200);const contactBody=await contactSearch.json();
  assert.ok(contactBody.results.some((result:{href:string})=>result.href===`/leads/${leadId}`));
  assert.equal(JSON.stringify(contactBody).includes("contact-only"),false);
  assert.equal(JSON.stringify(searchBody).includes("hidden"),false);
  assert.equal(searchBody.results.some(result=>result.type==="سجل"||result.type==="قالب"),false);
  const logs=await call("/logs");assert.equal(logs.status,200);assert.ok((await logs.text()).includes("ليست لديك صلاحية"));
  const dashboard=await call("/dashboard");assert.equal(dashboard.status,200);const dashboardHtml=await dashboard.text();
  assert.ok(dashboardHtml.includes(`${tag} visible actor`));assert.equal(dashboardHtml.includes(`${tag} hidden`),false);
  console.log("CRM HTTP QA: scoped search retains accessible groups; outside-page data and system audit are absent from search/dashboard/logs.");
  const secondLead=randomUUID();
  await db.execute(sql`insert into leads(id,page_id,name) values(${secondLead}::uuid,${pageId}::uuid,'Bulk HTTP QA synthetic')`);
  const bulkSnapshot=async()=>(await db.execute(sql`select id,status,updated_at::text as version from leads where id in (${leadId}::uuid,${secondLead}::uuid,${hiddenLead}::uuid) order by id`)).rows;
  const bulkBefore=await bulkSnapshot();
  const bulkItem=(id:string)=>({id,expectedUpdatedAt:String(bulkBefore.find(row=>row.id===id)!.version)});
  const bulkBody={status:'proposal',leads:[bulkItem(leadId),bulkItem(secondLead)]};
  const bulkCall=(body:unknown,token=editorToken,requestOrigin=origin)=>call('/api/leads/bulk',body,token,requestOrigin,'PATCH');
  assert.equal((await bulkCall(bulkBody,'')).status,401);assert.equal((await bulkCall(bulkBody,viewerToken)).status,403);
  assert.equal((await bulkCall(bulkBody,editorToken,'https://outside.example.test')).status,403);
  assert.equal((await bulkCall({...bulkBody,leads:[bulkItem(leadId),bulkItem(leadId)]})).status,400);
  assert.equal((await bulkCall({...bulkBody,leads:[bulkItem(leadId),bulkItem(hiddenLead)]})).status,404);
  assert.deepEqual(await bulkSnapshot(),bulkBefore);
  assert.equal((await bulkCall({...bulkBody,leads:[bulkItem(leadId),{...bulkItem(secondLead),expectedUpdatedAt:'2020-01-01T00:00:00Z'}]})).status,409);
  assert.deepEqual(await bulkSnapshot(),bulkBefore);
  const editorList=await call(`/leads?q=${encodeURIComponent(tag)}`);assert.ok((await editorList.text()).includes('تغيير مرحلة المحددين'));
  const viewerList=await call(`/leads?q=${encodeURIComponent(tag)}`,undefined,viewerToken);assert.equal((await viewerList.text()).includes('تغيير مرحلة المحددين'),false);
  const bulkResults=await Promise.all([bulkCall(bulkBody),bulkCall({...bulkBody,status:'interested',leads:[...bulkBody.leads].reverse()})]);
  assert.deepEqual(bulkResults.map(response=>response.status).sort(),[200,409]);
  for(const response of bulkResults)if(response.ok)assert.deepEqual(await response.json(),{updated:2});
  const bulkAfter=await bulkSnapshot();assert.equal(bulkAfter.find(row=>row.id===leadId)!.status,bulkAfter.find(row=>row.id===secondLead)!.status);
  assert.equal(bulkAfter.find(row=>row.id===hiddenLead)!.status,'won');
  const bulkAudits=await db.execute(sql`select count(*)::int as n from activity_logs where entity_id in (${leadId}::uuid,${secondLead}::uuid,${hiddenLead}::uuid) and metadata->>'bulk'='true'`);
  assert.equal(bulkAudits.rows[0].n,2);
  assert.equal((await bulkCall(bulkBody)).status,409);
  console.log('CRM HTTP QA: bulk stage authorization/CSRF, scoped all-or-none rejection, current-version concurrency and atomic audit passed.');
  await db.execute(sql`update users set role='viewer' where id=${editorId}::uuid`);
  assert.equal((await bulkCall(bulkBody)).status,403);
  assert.equal((await call("/api/leads",{...input,id:randomUUID()})).status,403);
  const viewerForm = await call("/leads/new");assert.equal(viewerForm.status,200);assert.ok((await viewerForm.text()).includes("ليست لديك صلاحية"));
  console.log("CRM HTTP QA: existing editor cookie loses write permission after DB downgrade. All checks passed.");
} catch(error) {
  console.error(redact(output));
  throw error;
} finally {
  if(server.exitCode === null) server.kill();
  await exited;
}
