import assert from "node:assert/strict";
import test from "node:test";
import { parseMcpResponse } from "../src/services/mcp-response";
import { publishWindsorPost } from "../src/services/windsor-mcp";

test("MCP response parser ignores later progress notifications and unrelated IDs",()=>{
  const stream='event: message\ndata: {"jsonrpc":"2.0","id":"other","result":{}}\n\n'+
    'event: message\ndata: {"jsonrpc":"2.0","id":"request",\ndata: "result":{"id":"post-1"}}\n\n'+
    'event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\n\n';
  assert.deepEqual(parseMcpResponse(stream,"request").result,{id:"post-1"});
  assert.throws(()=>parseMcpResponse(stream,"missing"),/matching response missing/);
  assert.throws(()=>parseMcpResponse("","request"),/matching response missing/);
});

test("uncertain write results never trigger a second execute_action",async()=>{
  const originalFetch=globalThis.fetch;
  const previousKey=process.env.WINDSOR_API_KEY;
  process.env.WINDSOR_API_KEY="test-only";
  try {
    for(const scenario of ["timeout","missing_id","tool_error","success"]) {
      let writes=0;
      globalThis.fetch=async(_url,init)=>{
        const request=JSON.parse(String(init?.body));
        const name=request.params?.name;
        let result:unknown={};
        if(name==="get_connectors")result={structuredContent:{result:[{id:"facebook_organic",accounts:[{id:"page-1"}]}]}};
        if(name==="list_actions")result={structuredContent:{result:[{id:"create_post"}]}};
        if(name==="execute_action") {
          writes++;
          assert.equal(request.params.arguments.account,"page-1");
          assert.equal(request.params.arguments.params.message,"مرحبا");
          if(scenario==="timeout")throw new DOMException("timeout","TimeoutError");
          result=scenario==="tool_error"?{isError:true}: {structuredContent:{result:scenario==="success"?{id:"post-1"}:{accepted:true}}};
        }
        return new Response(JSON.stringify({jsonrpc:"2.0",id:request.id,result}));
      };
      if(scenario==="success")assert.equal((await publishWindsorPost({pageId:"page-1",content:"مرحبا"},false)).id,"post-1");
      else await assert.rejects(publishWindsorPost({pageId:"page-1",content:"مرحبا"},false),/MCP_PUBLISH_OUTCOME_UNKNOWN/);
      assert.equal(writes,1,scenario);
    }
  }finally {
    globalThis.fetch=originalFetch;
    if(previousKey===undefined)delete process.env.WINDSOR_API_KEY;else process.env.WINDSOR_API_KEY=previousKey;
  }
});
