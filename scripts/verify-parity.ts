import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const results=[];
for(const writes of [false,true]){
 const client=new Client({name:"parity-verification",version:"1"});
 try{
 const env=Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>entry[1]!==undefined));
 env.VALA_MCP_ENABLE_WRITES=writes ? "1":"0";
 await client.connect(new StdioClientTransport({command:`${process.cwd()}/vala`,args:["serve"],env,stderr:"pipe"}));
 const names=(await client.listTools()).tools.map(t=>t.name);
 if(names.includes("absent")!==writes) throw new Error("Write discovery gate failed");
 const invalid=await client.callTool({name:"events",arguments:{from:"2026-10-21",to:"2026-10-20"}});
 if(!invalid.isError) throw new Error("Range refusal failed");
 if(writes){const refusal=await client.callTool({name:"absent",arguments:{childId:1,absenceTypeId:1,date:"2026-10-20",confirm:false}});if(!refusal.isError)throw new Error("Confirmation refusal failed");}
 if(writes && !(await client.callTool({name:"set_default_child",arguments:{childId:1,confirm:false}})).isError) throw new Error("Local write confirmation refusal failed");
 const read=await client.callTool({name:"kids",arguments:{}});
 results.push({writes,initialize:true,tools:names,rangeRefusal:true,confirmationRefusal:writes?true:null,liveRead:read.isError?"blocked-auth-or-api":"passed"});
 }finally{await client.close();}
}
console.log(JSON.stringify(results,null,2));
