import {afterEach,expect,test,vi} from "vitest";
vi.mock("../_generated/server",()=>({env:{TYPESAFE_API_KEY:"test-typesafe-secret",AI_PROCESSOR_APPROVED:"true"}}));
import {requestJev} from "../ai/typesafe";
afterEach(()=>vi.unstubAllGlobals());
test("TypeSafe uses its own endpoint and credential and returns typed decisions",async()=>{
 const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({answers:{next:{type:"choice",choice:"pace",probabilities:{pace:1},confidence:1}}}),{status:200}));vi.stubGlobal("fetch",fetchMock);
 await expect(requestJev({goal:"Strength"},{next:{type:"choice",instructions:"Next question?",criteria:{pace:"Rest preference"}}})).resolves.toMatchObject({next:{choice:"pace"}});
 const [url,options]=fetchMock.mock.calls[0];expect(url).toBe("https://api.typesafe.ai/v1/systemone");expect(options.headers.Authorization).toBe("Bearer test-typesafe-secret");expect(JSON.parse(options.body)).toMatchObject({model:"jev-latest",state:{goal:"Strength"}});
});
test("provider failure never falls back to OpenRouter",async()=>{
 const fetchMock=vi.fn().mockResolvedValue(new Response("Unavailable",{status:529}));vi.stubGlobal("fetch",fetchMock);
 await expect(requestJev({}, {safe:{type:"noul",instructions:"Safe?"}})).rejects.toThrow("TypeSafe AI is busy");expect(fetchMock).toHaveBeenCalledTimes(1);
});
test("unrecognized choice and invalid confidence are rejected",async()=>{
 for(const answer of [{type:"choice",choice:"invented",probabilities:{invented:1},confidence:1},{type:"choice",choice:"pace",probabilities:{pace:1},confidence:2}]){
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({answers:{next:answer}}),{status:200})));
 await expect(requestJev({}, {next:{type:"choice",instructions:"Next?",criteria:{pace:null}}})).rejects.toThrow("incomplete decision");
 }
});
