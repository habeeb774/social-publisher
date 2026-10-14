"""Read-only HEAD probes for the two approved public sources. No cookies or retries."""
import json
import urllib.request
import urllib.error
from catalog_import import SOURCES
for source in SOURCES.values():
    for agent in (None,"SocialPublisher-LicensedCatalogue/1.0"):
        request=urllib.request.Request(source,method="HEAD",headers={"User-Agent":agent} if agent else {})
        try:
            with urllib.request.urlopen(request,timeout=20) as response:
                print(json.dumps({"source":source,"agent":agent,"status":response.status,"length":response.headers.get("Content-Length")}))
        except urllib.error.HTTPError as error:
            print(json.dumps({"source":source,"agent":agent,"status":error.code,"server":error.headers.get("Server"),"challenge":error.headers.get("cf-mitigated"),"body":error.read(200).decode(errors="replace")}))
