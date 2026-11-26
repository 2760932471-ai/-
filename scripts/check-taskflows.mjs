import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {once} from 'node:events';import {mkdtemp,rm,readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),offline=process.argv.includes('--offline'),dir=await mkdtemp('/tmp/taskflow-ui-'),base='http://127.0.0.1:3091';let child,browser;const errors=[];
try{
 if(!offline){child=spawn(process.execPath,['src/server.js'],{env:{...process.env,PORT:'3091',DATA_DIR:dir,CODESPACES:'true',PLATFORM_TOKEN:'old-token'},stdio:['ignore','pipe','pipe']});await once(child.stdout,'data');}
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1440,height:960}});page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.setDefaultTimeout(8000);
 if(offline){const html=await readFile('deliverables/ai-platform-preview.html','utf8');await page.route(base+'/**',r=>r.fulfill({contentType:'text/html',body:html}));await page.context().setOffline(true);}
 await page.goto(base+'/#flows/skills');
 await page.locator('[data-launch-skill="web.search"]').waitFor();
 assert.equal(new URL(page.url()).hash,'#ai-config/skills');
 if(offline){
  await page.locator('[data-launch-skill="web.read"]').click();
  const dialog=page.locator('.quick-skill-dialog');
  await dialog.getByLabel('网页地址').fill('https://example.org/');
  await dialog.getByRole('button',{name:'运行技能'}).click();
  await dialog.getByRole('alert').filter({hasText:'在完整服务版中使用网页搜索和读取'}).waitFor();
  await dialog.getByRole('button',{name:'关闭技能'}).click();
 }
 await page.goto(base+'/#employees');
 await page.getByRole('heading',{name:'数字员工',exact:true}).waitFor();
 assert.equal(new URL(page.url()).hash,'#employees');
 const primaryNav=page.locator('.sidebar nav');
 assert.deepEqual(await primaryNav.locator('[data-view]').evaluateAll(items=>items.slice(0,3).map(item=>item.dataset.view)),['overview','employees','flows']);
 const sidebar=await page.locator('.sidebar').boundingBox(), main=await page.locator('#main').boundingBox();
 assert(sidebar.x<main.x && sidebar.x+sidebar.width<=main.x+1);
 const analyst=page.locator('#main a[href="#employees/employee-profit"]').first();
 await analyst.click();
 await page.locator('#main a[href="#employees/employee-profit/settings"]').click();
 await page.locator('[data-employee-test="employee-profit"]').click();
 await page.waitForFunction(()=>{
   try{return JSON.parse(document.querySelector('#run-output')?.textContent||'{}').status==='succeeded';}
   catch{return false;}
 },null,{timeout:16000});
 const result=JSON.parse(await page.locator('#run-output').textContent());
 assert.equal(result.result.executionType,'rules');
 assert.equal(result.result.metrics.profit,1600);
 assert(result.result.trace.some(step=>step.skillId==='finance.calculate' && step.status==='succeeded'));
 await page.locator('#close-run').click();
 await primaryNav.locator('[data-view=overview]').click();
 await page.waitForFunction(()=>document.querySelector('#connection-state').textContent.includes('已'));await page.locator('#main [data-new]:visible').first().click();assert.equal(await page.locator('#goal-advanced').isVisible(),false);await page.locator('#goal').fill('为水龙头制作标题和卖点');assert.equal(await page.locator('#create-engine').inputValue(),'flow');assert.equal(await page.locator('#manual-team-options').isVisible(),false);await page.locator('#submit-task').click();await page.locator('#task-dialog').waitFor({state:'hidden'});await page.locator('.chat-log').waitFor();await page.locator('.goal-tabs [data-tab=tasks]').click();await page.locator('[data-flow-node=summary]').waitFor();
 await page.locator('.goal-tabs [data-tab=discussion]').click();const human=await page.locator('.chat-message.human .avatar').first().boundingBox(),ai=await page.locator('.chat-message.coordinator .avatar').first().boundingBox();assert(human.x>ai.x+100);await page.locator('#chat-input').fill('保留这条尚未发送的输入');await page.waitForTimeout(2200);assert.equal(await page.locator('#chat-input').inputValue(),'保留这条尚未发送的输入');
 await page.locator('.goal-tabs [data-tab=tasks]').click();await page.screenshot({path:'/tmp/taskflows-desktop.png'});
 if(!offline){
  await page.locator('.sidebar-create').click();
  await page.locator('#goal').fill('请帮我处理一下这个');
  await page.locator('#submit-task').click();
  await page.locator('#task-dialog').waitFor({state:'hidden'});
  const question=page.locator('.discussion-task[data-task-destination="reply"]');
  await question.waitFor();
  assert.match(await question.innerText(),/处理什么对象/);
  await question.click();
  assert(await page.locator('#chat-input').evaluate(input=>document.activeElement===input));
  await page.locator('#chat-input').fill('比较两套 CRM 方案。重点看迁移成本与权限，给出采购建议。');
  await page.locator('#chat-form button[type=submit]').click();
  const missing=page.locator('.discussion-task').filter({hasText:'查看缺少的资料'});
  await missing.waitFor({timeout:20000});
  await missing.click();
  const action=page.locator('[data-flow-intervention]').filter({hasText:'补充比较资料'});
  assert(await action.getByRole('button',{name:'从此步继续'}).isEnabled());
  assert.equal(await action.getByRole('button',{name:'选择分析模型'}).count(),0);
  const researchStep=page.locator('[data-flow-node][data-status=succeeded]').filter({hasText:'本次调查尚未取得可引用的来源'});
  await researchStep.locator('summary').click();
  assert(await researchStep.getByText('本次调查尚未取得可引用的来源。').isVisible());
  await action.getByRole('button',{name:'补充比较资料'}).click();
  await page.getByRole('heading',{name:'知识库',exact:true}).waitFor();
 }
 await page.locator('.sidebar [data-view=flows]').click();await page.getByRole('heading',{name:'任务流与总控',exact:true}).waitFor();assert.equal(await page.locator('#flow-settings-form').count(),1);await page.locator('[name=parallel]').fill('2');await page.locator('#flow-settings-form button[type=submit]').click();await page.waitForTimeout(400);assert.equal(await page.locator('[name=parallel]').inputValue(),'2');
 await page.locator('.sidebar-create').click();await page.locator('#goal').fill('找一款划算的水龙头，选品后直接上架');await page.locator('#submit-task').click();await page.locator('#task-dialog').waitFor({state:'hidden'});
 const quoteAction=page.locator('.discussion-task[data-task-destination="intervention"]');
 await quoteAction.waitFor({timeout:16000});
 const nodeId=await quoteAction.getAttribute('data-step-id');
 assert(nodeId);
 await quoteAction.click();
 await page.waitForFunction(id=>document.activeElement?.dataset.flowIntervention===id,nodeId);
 const intervention=page.locator('[data-flow-intervention="'+nodeId+'"]');
 await intervention.getByRole('button',{name:'读取或补入候选报价'}).click();
 const quotes=page.getByRole('dialog',{name:'比较候选报价'});for(let i=0;i<2;i++){const row=quotes.locator('fieldset').nth(i);await row.locator('[name=sku]').fill('龙头-'+i);await row.locator('[name=price]').fill(String(25+i));await row.locator('[name=source]').fill('测试报价单 '+i);}
 await quotes.getByRole('button',{name:'保存并继续比较'}).click();
 await quotes.waitFor({state:'hidden'});
 await page.locator('[data-flow-node="'+nodeId+'"][data-status=succeeded]').waitFor();
 // The quotes complete the comparison. Publishing to a shop is a separate external action.
 await page.locator('[data-flow-node][data-status=needs_capability]').filter({hasText:'上架'}).waitFor();
 assert.equal(await page.locator('[data-flow-node=summary]').getAttribute('data-status'),'pending');
 if(offline){
  await page.locator('.sidebar-create').click();
  await page.locator('#goal').fill('在1688选猫粮，新店小批量测款，首批最多10袋。比较候选利润，给首选款制作淘宝主图和卖点。');
  await page.locator('#submit-task').click();
  await page.locator('#task-dialog').waitFor({state:'hidden'});
  await page.locator('.goal-tabs [data-tab=tasks]').click();
  for(const node of ['pick1688','profit','main','selling','summary']){
   await page.locator('[data-flow-node="'+node+'"]').waitFor();
  }
  assert.equal(await page.locator('[data-flow-node=main]').getAttribute('data-status'),'pending');
  await primaryNav.locator('[data-view=overview]').click();
  await page.locator('.inbox-row').filter({hasText:'四名员工协作准备角阀上新资料'}).click();
 }else{
  await primaryNav.locator('[data-view=employees]').click();
  await page.locator('[data-employee-goal="employee-coordination"]').click();
  await page.locator('#goal').fill('整理本轮任务交付摘要');await page.locator('#submit-task').click();
  await page.locator('#task-dialog').waitFor({state:'hidden'});
 }
 const assignment=page.locator('.team-assignment[data-tone=complete]');
 await assignment.waitFor({timeout:18000});
 assert.equal(await assignment.evaluate(el=>el.open),false);
 const summary=assignment.locator('summary');await summary.focus();await summary.press('Enter');
 const duties=assignment.locator('.assignment-duty');
 assert.equal(await duties.count(),offline?4:1);
 for(const duty of await duties.all())assert((await duty.locator('small').innerText()).trim());
 await assignment.getByRole('button',{name:/^预览/}).first().click();
 await page.locator('#artifact-dialog').waitFor();assert((await page.locator('#artifact-body').innerText()).trim());
 await page.locator('#close-artifact').click();
 const reviewAction=page.locator('.discussion-task[data-tab=review]');
 await reviewAction.click();
 await page.getByRole('tab',{selected:true,name:'复盘'}).waitFor();
 assert(await page.locator('#task-section [data-action=complete]').isEnabled());
 // Opening the review leaves acceptance to the task owner.
 await page.locator('.sidebar [data-view=flows]').click();
 await page.setViewportSize({width:375,height:812});await page.locator('[data-nav-more]').click();
 const drawer=page.locator('#navigation-dialog');
 await drawer.locator('[data-view=employees]').click();
 await drawer.waitFor({state:'hidden'});
 await page.getByRole('heading',{name:'数字员工',exact:true}).waitFor();
 await page.locator('#nav-open').click();
 await drawer.locator('[data-view=flows]').click();
 await drawer.waitFor({state:'hidden'});
 await page.screenshot({path:'/tmp/taskflows-mobile.png'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.reload();await page.getByRole('heading',{name:'任务流与总控',exact:true}).waitFor();assert.equal(await page.locator('[name=parallel]').inputValue(),'2');await page.locator('#nav-open').click();await page.locator('#navigation-dialog [data-view=overview]').click();await page.locator('.inbox-row').filter({hasText:'找一款划算的水龙头'}).click();await page.locator('.goal-tabs [data-tab=tasks]').click();await page.locator('.flow-panel').waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);console.log('PASS '+(offline?'offline':'server')+' employee navigation and goal-first flow creation, task graph, unsent context preservation, settings persistence, 375px layout');
}finally{await browser?.close();if(child&&child.exitCode===null){child.kill();await once(child,'exit');}await rm(dir,{recursive:true,force:true});}
