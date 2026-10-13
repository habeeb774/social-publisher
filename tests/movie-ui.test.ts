import {strict as assert} from "node:assert";
import {test} from "node:test";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {MoviesClient} from "../src/app/movies/movies-client";
test("disabled movie section never offers working upload or publish controls",()=>{
  const html=renderToStaticMarkup(createElement(MoviesClient,{enabled:false,canWrite:true,pages:[]}));
  assert.match(html,/القسم في مرحلة التجهيز/);
  assert.match(html,/<fieldset[^>]*disabled/);
  assert.ok(!html.includes('type="file"'));
  assert.match(html,/رفع الفيديو والمعالجة السحابية والنشر غير مفعّلة/);
});
test("read-only viewer cannot see registration form",()=>{
  const html=renderToStaticMarkup(createElement(MoviesClient,{enabled:false,canWrite:false,pages:[]}));
  assert.ok(!html.includes("<form"));
  assert.match(html,/الأفلام المسجّلة/);
});
test("registration requires page, evidence and explicit declarations",()=>{
  const html=renderToStaticMarkup(createElement(MoviesClient,{enabled:true,canWrite:true,pages:[{id:"page",name:"صفحة الاختبار"}]}));
  assert.match(html,/صفحة الاختبار/);
  for(const name of ["title","page","evidence","facebook","excerpts","declaration"])assert.match(html,new RegExp(`name="${name}"[^>]*required|[^>]*required[^>]*name="${name}"`));
  assert.match(html,/هذا الإقرار ليس موافقة نشر/);
});
import {parseCaptions,formatCaptions,CLIP_STATUS,PUBLICATION_STATUS} from "../src/app/movies/movie-detail";
test("caption editor round-trips timed Arabic lines and rejects malformed input",()=>{
  const cues=[{start:0,end:2.5,text:"مرحبا بكم"},{start:3,end:5,text:"الجزء الأول"}];
  assert.deepEqual(parseCaptions(formatCaptions(cues)),cues);
  assert.throws(()=>parseCaptions("بدون توقيت"),/السطر 1/);
  assert.deepEqual(parseCaptions("\n\n"),[]);
});
test("every clip and publication state has an Arabic label including unknown outcomes",()=>{
  for(const status of ["pending_approval","approved","excluded","scheduled","published","render_failed"])assert.ok(CLIP_STATUS[status]);
  assert.match(PUBLICATION_STATUS.outcome_unknown,/تحقق من الصفحة/);
});
test("enabled section shows the explicit publishing guard instead of the disabled notice",()=>{
  const html=renderToStaticMarkup(createElement(MoviesClient,{enabled:true,canWrite:true,canReview:true,canPublish:true,pages:[]}));
  assert.match(html,/النشر التلقائي يعمل فقط بعد تفعيله صراحة/);
});
