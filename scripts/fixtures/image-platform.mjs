// Explicit browser-test preload only. npm start never loads this module.
import dns from 'node:dns/promises';import {syncBuiltinESMExports} from 'node:module';
const lookup=dns.lookup;dns.lookup=async(host,options)=>host==='api.openai.com'?[{address:'8.8.8.8',family:4}]:lookup(host,options);syncBuiltinESMExports();
const request=globalThis.fetch;
globalThis.fetch=async(url,options)=>{if(new URL(url).hostname!=='api.openai.com')return request(url,options);const p=JSON.parse(options.body);if(p.prompt.includes('服务拒绝测试'))return new Response('{}',{status:403});return Response.json({data:[{b64_json:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/S1sAAAAASUVORK5CYII='}]});};
