/** Test suites mutate shared tables. Require an explicitly designated disposable host. */
export function assertDisposableDatabase(testUrl:string|undefined,disposableHost:string|undefined,productionUrl?:string) {
  if(!testUrl||!disposableHost)throw new Error("DISPOSABLE_TEST_DATABASE_HOST must explicitly identify the isolated test database");
  let target:URL;
  try {target=new URL(testUrl);}catch {throw new Error("Invalid test database URL");}
  if(!["postgres:","postgresql:"].includes(target.protocol)||target.hostname!==disposableHost.trim().toLowerCase())throw new Error("Test database does not match the designated disposable host");
  if(productionUrl){
    let production:URL;
    try {production=new URL(productionUrl);}catch {throw new Error("Cannot verify database isolation");}
    // Neon pooled/direct endpoints belong to the same compute.
    const canonical=(host:string)=>host.replace(/-pooler(?=\.)/,"");
    if(canonical(target.hostname)===canonical(production.hostname))throw new Error("Refusing integration tests against the application database host");
  }
}
