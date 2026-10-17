import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Events,ActivityLog,eventMessage} from '../src/app/elon-news/activity';

test('configuration activity describes the historical boolean values, including partial or malformed records',()=>{
 assert.equal(eventMessage('CONFIG_UPDATED',{monitoring:true,autoPublish:true}),'حُفظت الإعدادات: متابعة الأخبار مفعّلة، النشر التلقائي مفعّل.');
 assert.match(eventMessage('CONFIG_UPDATED',{monitoring:false,autoPublish:false}),/متابعة الأخبار متوقفة، النشر التلقائي متوقف/);
 assert.match(eventMessage('CONFIG_UPDATED',{monitoring:true,autoPublish:false}),/متابعة الأخبار مفعّلة، النشر التلقائي متوقف/);
 for(const value of [null,[],{autoPublish:'true'},undefined])assert.equal(eventMessage('CONFIG_UPDATED',value),'حُفظت إعدادات الأتمتة.');
 assert.equal(eventMessage('CONFIG_UPDATED',{monitoring:false}),'حُفظت الإعدادات: متابعة الأخبار متوقفة.');
});
test('the whole automation log is collapsed by default, with a count and independent nested technical details',()=>{
 const html=renderToStaticMarkup(React.createElement(ActivityLog,{events:[{id:'event',code:'DISCOVERY_COMPLETED',createdAt:'2026-10-17T12:00:00Z',details:{}}],formatTime:()=> 'اليوم',classes:{events:'events',technical:'technical',activityLog:'log',activitySummary:'summary'}}));
 assert.match(html,/^<details class="card log"><summary class="summary"><h2>سجل نشاط الأتمتة <span>\(1\)<\/span><\/h2><\/summary>/);
 assert.doesNotMatch(html,/<details[^>]*\bopen\b/);
 assert.equal((html.match(/<details\b/g)??[]).length,2);
 assert.match(html,/اكتمل فحص المصادر/);
 const empty=renderToStaticMarkup(React.createElement(ActivityLog,{events:[],formatTime:String,classes:{}}));
 assert.match(empty,/>\(0\)<\/span>/);assert.match(empty,/لا توجد أحداث بعد/);
});
test('event messages keep success, rejection, uncertainty and unknown codes distinct',()=>{
 assert.match(eventMessage('PUBLISHED',{}),/بنجاح/);
 assert.match(eventMessage('META_OUTCOME_UNKNOWN',{}),/لن يعاد النشر تلقائيًا/);
 assert.match(eventMessage('META_REJECTED_4',{state:'queued'}),/جُدولت/);
 assert.doesNotMatch(eventMessage('META_REJECTED_190',{state:'failed'}),/جُدولت|بنجاح/);
 assert.doesNotMatch(eventMessage('FUTURE_EVENT',{}),/FUTURE_EVENT|بنجاح/);
});
test('raw codes and JSON are only inside closed native details, with LTR diagnostics and escaped content',()=>{
 const html=renderToStaticMarkup(React.createElement(Events,{events:[{id:'test',code:'CONFIG_UPDATED',createdAt:'2026-10-17T06:19:00Z',details:{monitoring:true,autoPublish:true,note:'<script>alert(1)</script>'}}],formatTime:()=> '١٧ أكتوبر',classes:{events:'events',technical:'technical'}}));
 assert.match(html,/<p>حُفظت الإعدادات:/);
 assert.match(html,/<details class="technical"><summary>عرض التفاصيل التقنية<\/summary>/);
 assert.doesNotMatch(html,/<details[^>]*\bopen\b|<script>/);
 assert.match(html,/<pre dir="ltr">/);
 assert.match(html,/<time dateTime="2026-10-17T06:19:00Z">/);
 const visible=html.replace(/<details[\s\S]*?<\/details>/g,'');
 assert.doesNotMatch(visible,/CONFIG_UPDATED|autoPublish|monitoring/);
 assert.match(html,/&lt;script&gt;/);
 assert.match(renderToStaticMarkup(React.createElement(Events,{events:[],formatTime:String,classes:{events:'',technical:''}})),/لا توجد أحداث بعد/);
});
