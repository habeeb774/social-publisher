import test from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { leadEditSchema, leadUpdateValues } from "../src/services/leads-model";
import { LEAD_STAGES } from "../src/services/leads-stages";
const base={name:"متابع",contact:null,status:"new",notes:null,expectedUpdatedAt:"2026-10-07 10:00:00.123456+00"};
test("CRM edits accept every required stage and retain the exact concurrency version",()=>{
  for(const status of LEAD_STAGES)assert.equal(leadEditSchema.parse({...base,status}).expectedUpdatedAt,base.expectedUpdatedAt);
});
test("CRM edits reject arbitrary fields, missing versions, invalid states and oversized notes",()=>{
  for(const patch of [{workspaceId:"another"},{status:"publishing"},{expectedUpdatedAt:"invalid"},{expectedUpdatedAt:undefined},{notes:"x".repeat(10001)},{name:" "}])assert.equal(leadEditSchema.safeParse({...base,...patch}).success,false);
});
test("CRM values are parameters and can clear nullable fields",()=>{
  const input=leadEditSchema.parse({...base,name:"'; drop table leads;--",notes:"ملاحظة"});
  const query=new PgDialect().sqlToQuery(leadUpdateValues(input));
  assert.equal(query.sql,"name=$1,contact=$2,status=$3,notes=$4,updated_at=now()");
  assert.deepEqual(query.params,[input.name,null,"new","ملاحظة"]);
  assert.equal(query.sql.includes(input.name),false);
});
