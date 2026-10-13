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
