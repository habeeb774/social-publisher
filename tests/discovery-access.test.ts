import test from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { posts } from "../src/db/schema";
import { dashboardActivityScope,discoveryPageScope,discoveryMediaScope,discoveryCampaignScope } from "../src/services/discovery-access";
import { can } from "../src/services/rbac";
const page="8a79eb88-d269-44de-bee6-243ca0391432";
const dialect=new PgDialect();
test("discovery scopes deny empty assignments and bind page identifiers",()=>{
  for(const scope of [discoveryPageScope(new Set(),posts.pageId),discoveryMediaScope(new Set()),discoveryCampaignScope(new Set()),dashboardActivityScope(new Set(),true)])assert.equal(dialect.sqlToQuery(scope).sql,"false");
  for(const scope of [discoveryPageScope(new Set([page]),posts.pageId),discoveryMediaScope(new Set([page])),discoveryCampaignScope(new Set([page])),dashboardActivityScope(new Set([page]),true)]){
    const query=dialect.sqlToQuery(scope);assert.equal(query.sql.includes(page),false);assert.ok(query.params.includes(page));
  }
});
test("scoped media and campaigns must have a non-deleted post in an accessible page",()=>{
  const media=dialect.sqlToQuery(discoveryMediaScope(new Set([page])));
  assert.match(media.sql,/post_media pm join posts p/);assert.match(media.sql,/pm.url=/);assert.match(media.sql,/p.deleted_at is null/);assert.match(media.sql,/p.page_id in/);
  const campaign=dialect.sqlToQuery(discoveryCampaignScope(new Set([page])));
  assert.match(campaign.sql,/p.campaign_id=/);assert.match(campaign.sql,/p.deleted_at is null/);assert.match(campaign.sql,/p.page_id in/);
});
test("non-admin activity remains entity scoped even with unrestricted page access",()=>{
  for(const allowed of [null,new Set([page])]){
    const query=dialect.sqlToQuery(dashboardActivityScope(allowed));
    assert.match(query.sql,/='post'/);assert.match(query.sql,/='lead'/);assert.match(query.sql,/p.id="activity_logs"\."entity_id"/);assert.match(query.sql,/exists\(select 1 from leads/);
    assert.notEqual(query.sql,"true");
  }
  assert.equal(dialect.sqlToQuery(dashboardActivityScope(null,true)).sql,"true");
  assert.notEqual(dialect.sqlToQuery(dashboardActivityScope(new Set([page]),true)).sql,"true");
  assert.equal(can("admin","audit.read"),true);
  for(const role of ["editor","reviewer","viewer"] as const)assert.equal(can(role,"audit.read"),false);
});
