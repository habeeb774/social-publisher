import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createGuard } from "../src/services/api-guard";
import { approvalActionPermission, type ApprovalAction } from "../src/services/approval-permissions";
import type { Role } from "../src/services/request-auth";

test("approval actions require current author or reviewer permission, never historical cookie role",async()=>{
  const request=new NextRequest("https://qa.example.test/api/posts/qa/approval",{method:"POST",headers:{origin:"https://qa.example.test"}});
  for(const role of ["viewer","editor","reviewer","admin"] as Role[]) {
    const guard=createGuard({readSession:async()=>({userId:"qa-user",role:"admin"}),readUser:async()=>({id:"qa-user",email:"qa@example.test",name:"QA",role}),bindActor:()=>{}});
    for(const action of ["submit","approve","reject","changes"] as ApprovalAction[]) {
      const allowed=role==="admin" || (action==="submit"?role==="editor":role==="reviewer");
      const response=await guard(request,true,approvalActionPermission(action));
      assert.equal(response?.status??200,allowed?200:403,`${role}: ${action}`);
    }
  }
});

test("all approval actions reject cross-origin writes before reading account data", async () => {
  let accountReads = 0;
  const guard = createGuard({
    readSession: async () => ({ userId: "qa-user", role: "admin" }),
    readUser: async () => {
      accountReads++;
      return { id: "qa-user", email: "qa@example.test", name: "QA", role: "admin" };
    },
    bindActor: () => {},
  });
  for (const action of ["submit", "approve", "reject", "changes"] as ApprovalAction[]) {
    const request = new NextRequest("https://qa.example.test/api/posts/qa/approval", {
      method: "POST",
      headers: { origin: "https://foreign.example.test" },
    });
    assert.equal((await guard(request, true, approvalActionPermission(action)))?.status, 403);
  }
  assert.equal(accountReads, 0);
});
