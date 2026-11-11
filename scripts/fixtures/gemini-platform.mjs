// Browser test only: deterministic mock responses, never loaded by npm start.
import dns from 'node:dns/promises';import {syncBuiltinESMExports} from 'node:module';
const lookup=dns.lookup;dns.lookup=async(h,o)=>h==='generativelanguage.googleapis.com'?[{address:'8.8.8.8',family:4}]:lookup(h,o);syncBuiltinESMExports();
const request=globalThis.fetch;
globalThis.fetch=async(url,options)=>{const u=new URL(url);if(u.hostname!=='generativelanguage.googleapis.com')return request(url,options);if(!options.method||options.method==='GET')return Response.json({name:'models/gemini-2.5-flash-image',supportedGenerationMethods:['generateContent']});const body=JSON.parse(options.body);if(body.contents[0].parts[0].text.includes('服务拒绝测试'))return new Response('{}',{status:403});return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{inlineData:{mimeType:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/S1sAAAAASUVORK5CYII='}}]}}]});};
