export type SearchResult = {type:string;label:string;href:string};
export async function requestSearch(query:string,signal:AbortSignal,fetcher:typeof fetch=fetch):Promise<SearchResult[]> {
  const response=await fetcher(`/api/search?q=${encodeURIComponent(query)}`,{signal,cache:"no-store"});
  if(!response.ok)throw new Error("SEARCH_UNAVAILABLE");
  const body:unknown=await response.json();
  if(!body||typeof body!=="object"||!("results" in body)||!Array.isArray(body.results))throw new Error("SEARCH_INVALID_RESPONSE");
  const results=body.results.slice(0,50);
  if(!results.every(row=>row&&typeof row.type==="string"&&typeof row.label==="string"&&typeof row.href==="string"&&row.href.startsWith("/")&&!row.href.startsWith("//")))throw new Error("SEARCH_INVALID_RESPONSE");
  return results;
}
