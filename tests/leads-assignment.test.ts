import test from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { leadAssigneeEligible,leadAssigneesQuery,leadBulkAssigneeEligible,listLeadAssigneesForPages } from "../src/services/leads-assignment";
import { leadAssignmentSchema } from "../src/services/leads-model";
import { can } from "../src/services/rbac";
const id="acf36f18-958e-49d2-bd78-93ab243a9457";
test("bulk assignment requires permission on every selected page",()=>{
  const other="148b497b-bf2b-4d70-887d-47da50e32086";
  const pages=[{pageId:id,remotePageId:"remote"},{pageId:other,remotePageId:"other"}];
  const partial=JSON.stringify({unrestricted:false,pageIds:[id]});
  assert.equal(leadBulkAssigneeEligible("editor",partial,pages,[]),false);
  assert.equal(leadBulkAssigneeEligible("editor",partial,[...pages].reverse(),[]),false);
  assert.equal(leadBulkAssigneeEligible("editor",JSON.stringify({unrestricted:false,pageIds:[id,other]}),pages,[]),true);
  assert.equal(leadBulkAssigneeEligible("editor",JSON.stringify({unrestricted:false,pageIds:[id],accountIds:["account"]}),pages,[{id:"account",pageIds:["other"],instagramIds:[]}]),true);
  assert.equal(leadBulkAssigneeEligible("editor","{",pages,[]),false);
  assert.equal(leadBulkAssigneeEligible("viewer",null,pages,[]),false);
  assert.equal(leadBulkAssigneeEligible("admin",null,pages,[]),true);
  assert.equal(leadBulkAssigneeEligible("editor",partial,[...pages.slice(0,1),{pageId:null,remotePageId:null}],[]),false);
});
test("bulk candidate lookup rejects empty and oversized selections before database access",async()=>{
  const page={pageId:id,remotePageId:"remote"};
  for(const pages of [[],Array(51).fill(page)]){
    assert.equal(leadBulkAssigneeEligible("admin",null,pages,[]),false);
    await assert.rejects(listLeadAssigneesForPages(pages,"",null),/LEAD_ASSIGNMENT_SELECTION_INVALID/);
  }
  assert.equal(leadBulkAssigneeEligible("editor",null,Array(50).fill(page),[]),true);
});
test("assignment validates exact versions and rejects untrusted fields",()=>{
  const body={assignedTo:id,expectedUpdatedAt:"2026-10-07 10:00:00.123456+00"};
  assert.deepEqual(leadAssignmentSchema.parse(body),body);
  assert.equal(leadAssignmentSchema.parse({...body,assignedTo:null}).assignedTo,null);
  for(const patch of [{assignedTo:"env-admin"},{expectedUpdatedAt:undefined},{pageId:id}])assert.equal(leadAssignmentSchema.safeParse({...body,...patch}).success,false);
  assert.equal(can("viewer","leads.assign"),false);assert.equal(can("reviewer","leads.assign"),false);assert.equal(can("editor","leads.assign"),true);
});
test("assignment choices deny corrupt, restricted, and read-only candidates",()=>{
  assert.equal(leadAssigneeEligible("editor","{",id,"remote",[]),false);
  assert.equal(leadAssigneeEligible("viewer",null,id,"remote",[]),false);
  assert.equal(leadAssigneeEligible("editor",JSON.stringify({unrestricted:false,pageIds:[]}),id,"remote",[]),false);
  assert.equal(leadAssigneeEligible("editor",JSON.stringify({unrestricted:false,pageIds:[id]}),id,"remote",[]),true);
  assert.equal(leadAssigneeEligible("editor",JSON.stringify({unrestricted:false,pageIds:[id]}),null,null,[]),false);
  assert.equal(leadAssigneeEligible("admin",null,null,null,[]),true);
});
test("account-based assignments require matching connected remote page",()=>{
  const scope=JSON.stringify({unrestricted:false,accountIds:["account"]});
  const accounts=[{id:"account",pageIds:["remote"],instagramIds:[]}];
  assert.equal(leadAssigneeEligible("editor",scope,id,"remote",accounts),true);
  assert.equal(leadAssigneeEligible("editor",scope,id,"another",accounts),false);
});
test("candidate lookup joins scopes in one bounded query and never selects credentials",()=>{
  const query=new PgDialect().sqlToQuery(leadAssigneesQuery("%_",id));
  assert.match(query.sql,/left join settings/);assert.match(query.sql,/is_active=true/);assert.match(query.sql,/limit 21/);
  assert.equal(query.sql.includes("password"),false);assert.equal(query.sql.includes("email"),false);
  assert.equal(query.params.includes("%\\%\\_%"),true);assert.equal(query.params.includes(id),true);
});
