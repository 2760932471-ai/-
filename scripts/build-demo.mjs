import {Script} from 'node:vm';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const read=file=>readFile(new URL(file,root),'utf8');
function moduleBundle(name,source,prelude=''){
 const names=[...source.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map(m=>m[1]);
 return `const ${name}=(()=>{\n${prelude}\n${source.replace(/^import .*;\n/gm,'').replace(/^export /gm,'')}\nreturn {${names.join(',')}};\n})();`;
}
const builtins=moduleBundle('previewBuiltins',await read('src/agents/builtins.js'));
const goals=moduleBundle('previewGoals',await read('src/goals.js'),'const goalUUID=previewUUID;');
const registrySource=await read('src/agents/registry.js');
// Keep production configuration/output validators; omit server DNS, credentials and HTTP transport.
const registry=moduleBundle('previewRegistry',registrySource.slice(registrySource.indexOf('export function validateConfig'),registrySource.indexOf('function publicAddress'))+registrySource.slice(registrySource.indexOf('export function validateOutput'),registrySource.indexOf('export async function invokeAgent'))+`
export function defaultConfigs(){return structuredClone(seeds);}
export async function invokeAgent(config,input){if(!config.enabled)throw new Error('Agent已停用');if(config.adapter!=='builtin')throw new Error('外部Agent需要运行完整后端；免安装预览不会发送网络请求');return validateOutput(await builtins[config.id](input,config));}
`,"const {builtins,seeds}=previewBuiltins;const process={env:{}};const isIP=s=>s.includes(':')?6:/^\\d+(?:\\.\\d+){3}$/.test(s)?4:0;");
const catalog=moduleBundle('previewCatalog',await read('src/workforce/catalog.js'));
const commerce=moduleBundle('previewCommerce',await read('src/workforce/commerce.js'));
const external=moduleBundle('previewExternal',await read('src/workforce/external.js'),'const process={env:{}};');
const starter=moduleBundle('previewStarter',await read('src/workforce/starter-skills.js'));
const conversation=moduleBundle('previewConversation',await read('src/workforce/conversation.js'));
const discussionUI=moduleBundle('previewDiscussionUI',await read('public/discussion.js'));
const content=moduleBundle('previewContent',await read('src/workforce/content.js'));
const contentUI=moduleBundle('previewContentUI',await read('public/content.js'));
const skills=moduleBundle('previewSkills',await read('src/workforce/skills.js'),'const {contentDefinitions,contentSample,executeContent}=previewContent;const {productAgent,insightAgent}=previewBuiltins;const {starterDefinitions,starterSample,executeStarter}=previewStarter;const {commerceDefinitions,commerceSample,executeCommerce}=previewCommerce;');
const employees=moduleBundle('previewEmployees',await read('src/workforce/employees.js'),'const {contentPacks}=previewContent;const {roles,capabilities}=previewCatalog;const {skillDefinitions,skillSample}=previewSkills;const {externalDefinitions,externalBlockers}=previewExternal;');
const modelSource=await read('src/workforce/model.js');
const model=moduleBundle('previewModel',modelSource.slice(modelSource.indexOf('export function validateModel'),modelSource.indexOf('export async function callModel'))+`export async function callModel(){throw new Error('静态预览不能调用模型，请运行完整后端并配置连接');}`,'const process={env:{}};');
const runtime=moduleBundle('previewEmployeeRuntime',await read('src/workforce/runtime.js'),'const {executeSkill,skillDefinitions}=previewSkills;const {callModel}=previewModel;');
const planning=moduleBundle('previewPlanning',await read('src/workforce/planning.js'),'const randomUUID=previewUUID;const {skillDefinitions,executeSkill}=previewSkills;const {publicModel}=previewModel;const {publicExternal,externalDefinitions}=previewExternal;const {employeeReadiness}=previewEmployees;');
const planningUI=moduleBundle('previewPlanningUI',await read('public/planning.js'));
const matching=moduleBundle('previewMatching',await read('src/workforce/matching.js'),'const {isSelectionGoal}=previewBuiltins;const {skillDefinitions}=previewSkills;const {employeeReadiness}=previewEmployees;const {publicModel}=previewModel;const {publicExternal}=previewExternal;const {matchingRecipes}=previewCommerce;');
const research=moduleBundle('previewResearch',await read('src/workforce/research.js'),'const {bm25}=previewKnowledgeRetrieval;const {materialProblem}=previewSources;const {parseBusinessCsv}=previewCommerce;');
const team=moduleBundle('previewTeam',await read('src/workforce/team.js'),'const {isResearchGoal,researchQuestion,collectResearch,researchSummary}=previewResearch;const {matchMembers,matchingKey}=previewMatching;const {validateCopyBrief}=previewContent;const randomUUID=previewUUID;const {assertPlanCurrent,planningSignature,validatePlan,checkTeamInputs}=previewPlanning;const {discussionMembers,contextSettings,mentionedEmployees,mentionsEveryone,selectConversation,updateContext}=previewConversation;const {createGoal}=previewGoals;const {validateEmployee,employeeReadiness,workforceView}=previewEmployees;const {validateModel,publicModel}=previewModel;const {skillSample,skillDefinitions,skillInputHint}=previewSkills;const {financeFields,isSelectionGoal}=previewBuiltins;const {validateExternal,publicExternal,externalDefinitions,externalBlockers}=previewExternal;const {recipes,matchingRecipes}=previewCommerce;');
const workforceUI=moduleBundle('previewWorkforceUI',await read('public/workforce.js'));
const sources=moduleBundle('previewSources',await read('src/sources.js'),`const randomUUID=previewUUID;const process={env:{}};const pullSource=async()=>{throw Object.assign(new Error('静态预览不访问外部来源；请运行完整后端配置授权接口'),{sourceSafe:true});};`);
const sourcesUI=moduleBundle('previewSourcesUI',await read('public/sources.js'));
const knowledgeRetrieval=moduleBundle('previewKnowledgeRetrieval',await read('src/knowledge-retrieval.js'));
const starters=moduleBundle('previewStarters',await read('src/knowledge-starters.js'));
const knowledge=moduleBundle('previewKnowledge',await read('src/knowledge.js'),`const {knowledgeStarters}=previewStarters;const randomUUID=previewUUID;const {chunkText,bm25,cosine,validateVectors}=previewKnowledgeRetrieval;const embeddingConfiguration=()=>({configured:false,model:'',signature:''});const embedTexts=async()=>{throw new Error('静态预览不能调用 Embedding，请使用完整后端');};`);
const knowledgeUI=moduleBundle('previewKnowledgeUI',await read('public/knowledge.js'));
const businessUI=moduleBundle('previewBusinessUI',await read('public/business.js'));
const storeOperations=moduleBundle('previewStoreOperations',await read('src/store-operations.js'),`const randomUUID=previewUUID;const nativeStoreTransport=async()=>{throw Object.assign(new Error('免安装预览不能操作真实店铺，请启动完整后端并配置应用授权'),{code:'PREVIEW_ONLY'});};`);
const storeUI=moduleBundle('previewStoreUI',await read('public/store-operations.js'));
const integrations=moduleBundle('previewIntegrations',await read('src/integrations.js'),`const nativeStoreTransport=async()=>{throw Object.assign(new Error('免安装预览不能核验店铺授权，请运行完整后端'),{code:'PREVIEW_ONLY'});};const randomUUID=previewUUID;const process={env:{}};const searchTransport=async()=>{throw Object.assign(new Error('免安装预览不调用外部搜索，请运行完整后端'),{code:'PREVIEW_ONLY'});};const storeTransport=async()=>{throw Object.assign(new Error('免安装预览不能核验店铺授权，请运行完整后端'),{code:'PREVIEW_ONLY'});};`);
const setupUI=moduleBundle('previewSetupUI',await read('public/setup.js'),`const {createStoreUI}=previewStoreUI;`);
const platform=moduleBundle('previewPlatform',await read('src/platform.js'),`const {createStoreOperations}=previewStoreOperations;const {createIntegrations}=previewIntegrations;const {createResearchManager,researchInputs,assertResearch,collectResearch,isResearchGoal}=previewResearch;const {contentPacks,validateCopyBrief}=previewContent;const randomUUID=previewUUID;const {readFile,mkdir,writeFile,rename}=previewFS;const path={join:(...parts)=>parts.join('/')};const {createGoal,goalAction,tickGoal}=previewGoals;const {defaultConfigs,publicConfig,validateConfig,invokeAgent}=previewRegistry;const {financeFields,testSample}=previewBuiltins;const {defaultEmployees}=previewEmployees;const {createTeamManager}=previewTeam;const {createPlanningManager,assertPlanCurrent}=previewPlanning;const {discussionMembers,contextSettings,selectConversation}=previewConversation;const {runEmployee}=previewEmployeeRuntime;const {callModel}=previewModel;const {executeSkill,skillDefinitions}=previewSkills;const {externalDefinitions,externalBlockers,publicExternal}=previewExternal;const invokeExternal=async()=>{throw new Error('静态预览不能调用外部 Agent，请启动完整后端');};const {initialSources,createSourceManager}=previewSources;const {initialKnowledge,createKnowledgeManager}=previewKnowledge;`);
const workspaces=moduleBundle('previewWorkspaces',await read('src/workspaces.js'),`const randomUUID=previewUUID;const {readFile,writeFile,mkdir,rename}=previewFS;const path={join:(...parts)=>parts.join('/')};const {createPlatform}=previewPlatform;`);
const bootstrap=`
const workspaceManager=await previewWorkspaces.createWorkspaceManager('/preview');
const localPlatform=await workspaceManager.get('default');
if(!localPlatform.goals().length){
 const g=await localPlatform.create({requestId:'preview-seed-listing',text:'【演示样例】四名员工协作准备角阀上新资料，交付后由我验收',kind:'listing',employeeIds:['employee-merchandise','employee-creative','employee-profit','employee-coordination'],permission:'draft'});
 await localPlatform.action(g.id,{kind:'facts',expectedVersion:g.version,facts:previewBuiltins.testSample('product').facts,confirmed:true});
 const saved=localPlatform.goals()[0];await localPlatform.action(g.id,{kind:'plan',expectedVersion:saved.version});
 for(let i=0;i<4;i++)await localPlatform.pump();
}
const previewAPI=async(route,options={})=>{
 const method=options.method||'GET',input=options.body?JSON.parse(options.body):{};const [resource,id,action]=route.split('/');
 if(resource==='workspaces')return method==='GET'?workspaceManager.list():workspaceManager.save(id,input);
 const localPlatform=await workspaceManager.get(previewSession.getItem('workspaceId')||'default');
 if(resource==='integrations'){
  if(!id)return localPlatform.integrations.view();
  if(id==='search')return action?localPlatform.integrations[action==='test'?'testSearch':'query'](input):localPlatform.integrations.saveSearch(input);
  if(id==='stores'){const [, ,shop,type,operationId,operation]=route.split('/');if(type==='products')return localPlatform.storeOperations.list(shop,input);if(type==='operations')return operationId?localPlatform.storeOperations[operation](shop,operationId,input):options?.method==='POST'?localPlatform.storeOperations.prepare(shop,input):localPlatform.storeOperations.history(shop);return type==='test'?localPlatform.integrations.testStore(action):localPlatform.integrations.saveStore(action,input);}
 }

 if(resource==='knowledge'){
  if(!id)return localPlatform.knowledge.view();
  if(id==='search')return localPlatform.knowledge.search(input);
  if(id==='preview')return previewKnowledgeRetrieval.chunkText(input.body,{size:Number(input.size),overlap:Number(input.overlap)});
  const op=route.split('/')[3];
  if(method==='DELETE')return localPlatform.knowledge[id==='bases'?'deleteBase':'deleteDocument'](action,input);
  if(id==='documents'&&op)return localPlatform.knowledge[op](action,input);
  if(id==='documents'&&action&&method==='GET')return localPlatform.knowledge.document(action);
  return localPlatform.knowledge[id==='bases'?'saveBase':'saveDocument'](action,input);
 }
 if(resource==='sources'||resource==='materials'){
  if(resource==='sources'&&method==='GET')return localPlatform.sources.view();
  if(action==='sync'&&method==='POST')return localPlatform.sources.sync(id);
  if(action==='review'&&method==='POST')return localPlatform.sources.review(id,input);
  if(['POST','PUT'].includes(method))return localPlatform.sources[resource==='sources'?'saveSource':'saveMaterial'](id,input);
 }
 if(resource==='workforce'){if(id==='install')return localPlatform.workforce.install(input.recipeId);if(id==='recommend')return localPlatform.workforce.recommend(input.text);return localPlatform.workforce.view();}
 if(resource==='external-skills'){if(action==='test')return localPlatform.workforce.testExternal(id,input.input);return localPlatform.workforce.saveExternal(id,input);}
 if(['employees','models','skills'].includes(resource)){
  if(action==='test')return resource==='employees'?localPlatform.workforce.testEmployee(id):resource==='models'?localPlatform.workforce.testModel(id):localPlatform.workforce[id.startsWith('external_')?'testExternal':'testSkill'](id,input.input);
  if(['POST','PUT'].includes(method)&&resource!=='skills')return localPlatform.workforce[resource==='employees'?'saveEmployee':'saveModel'](id,input);
 }
 if(resource==='agents'){
  if(!id&&method==='GET')return localPlatform.agents();
  if(id&&method==='PUT'){if(input.adapter==='http')throw new Error('免安装预览只运行内置代码Agent。请启动完整版后配置外部HTTP接口。');return localPlatform.saveAgent(id,input);}
  if(action==='sample')return localPlatform.sample(id);
  if(action==='test'&&method==='POST')return localPlatform.testAgent(id,input.input);
 }
 if(resource==='goals'){
  if(!id)return method==='POST'?localPlatform.create(input):localPlatform.goals();
  if(action?.split('?')[0]==='context'&&method==='GET')return localPlatform.workforce.context(id,new URLSearchParams(action.split('?')[1]||'').get('question'));
  if(action==='planning'&&method==='POST')return localPlatform.planning.propose(id,input);
  if(action==='actions'&&method==='POST')return localPlatform.action(id,input);
 }
 if(resource==='runs'&&method==='GET')return id?localPlatform.run(id):localPlatform.runs();
 if(resource==='goal-preview'&&method==='POST')return previewBuiltins.previewGoal(input.text);
 throw new Error('预览中未提供此操作');
};
setInterval(()=>workspaceManager.pump().catch(error=>{previewBar.textContent='本地运行未完成：'+error.message;}),300);
`;
let app=await read('public/app.js');
if(!/^async function api\(route, options\).*$/m.test(app))throw new Error('API binding changed; review preview builder');
app=app.replace(/^import .*;\n/gm,'').replace(/^async function api\(route, options\).*$/m,'async function api(route,options){return structuredClone(await previewAPI(route,options));}').replaceAll('sessionStorage','previewSession');
const copyReplacements=[['外部 Agent 可通过 HTTP 适配器接入','完整版可通过 HTTP 适配器接入外部 Agent；预览仅运行内置能力'],['代码 Agent 与统一 HTTP 接口已接入；业务连接逐项建设。','此文件使用本地代码 Agent；真实服务请使用完整启动包。'],['访问令牌可由服务端 PLATFORM_TOKEN 启用，当前仍是单工作空间。','预览没有联网鉴权或多人同步；完整版可配置访问令牌。'],['在 Agent 配置中选择 HTTP 适配器，设置 HTTPS 地址、服务端密钥变量名与允许域名。','请运行完整后端，再设置 HTTPS 接口、密钥环境变量与允许域名。'],['服务已连接','本地预览已就绪'],['目标、任务与协作空间已保存到服务端','目标、任务与协作空间已保存到当前浏览器'],['服务端持久化','浏览器本地保存'],['使用服务端已保存的配置','使用当前浏览器已保存的配置'],['后端自动执行','浏览器规则执行'],['数据保存在后端','数据保存在当前浏览器'],['等待后端执行','等待本地执行'],['代码 / HTTP 能力','本地代码能力']];
let code=[await read('scripts/preview-runtime.js'),builtins,goals,registry,catalog,commerce,external,starter,conversation,discussionUI,content,contentUI,skills,employees,model,runtime,planning,planningUI,matching,sources,knowledgeRetrieval,research,team,workforceUI,sourcesUI,starters,knowledge,knowledgeUI,businessUI,storeOperations,storeUI,integrations,setupUI,platform,workspaces,bootstrap,'const {createSetupUI}=previewSetupUI;const {createContentUI}=previewContentUI;const {createDiscussionUI}=previewDiscussionUI;const {createPlanningUI}=previewPlanningUI;const {createWorkforceUI}=previewWorkforceUI;const {createSourcesUI}=previewSourcesUI;const {createKnowledgeUI}=previewKnowledgeUI;const {createBusinessUI}=previewBusinessUI;',app].join('\n');
for(const [from,to]of copyReplacements)code=code.replaceAll(from,to);
let html=await read('public/index.html');const css=await read('public/style.css');
html=html.replace('<link rel="stylesheet" href="/style.css">',()=>`<style>${css}\n.preview-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 28px;background:var(--tint);border-bottom:1px solid var(--line);font-size:12px;color:var(--ink)}.preview-bar p{color:var(--ink)}.preview-bar button{white-space:nowrap;min-height:44px}.preview-bar~main{min-height:calc(100dvh - 164px)}@media(max-width:760px){.preview-bar{padding:8px 12px;font-size:11px}.preview-bar p{line-height:1.7}}\n</style>`)
 .replace('<script type="module" src="/app.js"></script>','')
 .replace('</header><main','</header><div class="preview-bar"><p id="preview-status" role="status">正在打开本地预览…</p><button class="text-button" id="preview-reset">重置样例</button></div><main')
 .replace('服务端工作空间','免安装预览')
 .replace('团队目标交付草案 · 店铺上下架在商品管理中逐项确认','免安装预览 · 本地规则运行 · 模型连接需完整后端 · 无真实业务写入')
 .replace('<option value="http">外部 HTTP Agent</option>','<option value="http" disabled>外部 HTTP Agent（完整版可用）</option>')
 .replace('这里只保存变量名。密钥值由服务器环境提供；域名需加入服务端 AGENT_ALLOWED_HOSTS。','外部 Agent 配置与密钥仅在完整后端中使用，预览不发送网络请求。');
html=html.replace('</body>',()=>`<noscript><p>请用支持 JavaScript 的浏览器打开此文件。</p></noscript><script>\n(async()=>{\n${code.replace(/<\/script/gi,'<\\/script')}\n})().catch(error=>{document.querySelector('#preview-status').textContent='预览未能加载：'+error.message+'。可点击“重置样例”清理此预览的本地数据后重试。';});\n</script></body>`);
new Script(html.match(/<script>([\s\S]*?)<\/script>/)[1],{filename:'preview-inline.js'});
await mkdir(new URL('deliverables/',root),{recursive:true});
for(const file of ['ai-platform-preview.html','AI数字员工协作工作台.html','慕雅居-交互演示.html'])await writeFile(new URL('deliverables/'+file,root),html);
console.log(`Built current offline preview: ${Buffer.byteLength(html)} bytes; no network or backend required. Historical V1 stays archived.`);
