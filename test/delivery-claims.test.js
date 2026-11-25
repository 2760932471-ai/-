import test from 'node:test';
import assert from 'node:assert/strict';
import {createImages} from '../src/images.js';
import {prepareContent} from '../src/workforce/content-preparation.js';
import {reviewDeliverables,reviewText} from '../src/taskflows/review.js';

const sku='cup-1';
const confirmed=(text,overrides={})=>({kind:'offer',sku,source:'本款规格表',text,...overrides});

test('a public claim is supported by the correct product, measurement and source',()=>{
 const evidence=[
  confirmed('材质：316L不锈钢'),
  confirmed('保冷：12小时'),
  confirmed('食品级：是'),
  confirmed('保温时长：12小时（待核实）'),
  confirmed('额定容量：887ml',{sku:'another'}),
  confirmed('买一赠一')
 ];
 const prep={selectedSku:sku,evidence};
 assert.deepEqual(reviewText('316L钢，12h保冷',prep),[]);
 const omitted=reviewText('316钢，保温12小时，887ml，买一赠一，食品级，全网最低价',prep);
 assert.equal(omitted.length,6);
 assert.deepEqual(reviewText('食品级',{...prep,evidence:[confirmed('食品级',{kind:'material',source:'供应商检测报告'})]}),[]);
 assert.deepEqual(reviewText('买一赠一',prep,['商家确认：买一赠一']),[]);
 assert.deepEqual(reviewText('型号AB1304',prep),[]);
 assert.equal(reviewText('活动价89元',prep).length,1);
 assert.deepEqual(reviewText('活动价89元',prep,['到手价：¥89.00']),[]);
 assert.equal(reviewText('全网最低价',prep,['全网最低价']).length,1);
});

test('preparation binds the claim source to the chosen offer and returns usable facts',()=>{
 const goal={text:'为选中的商品生成淘宝主图',scope:{},skillData:{copyBrief:{
  confirmed:true,source:'另一款商品活动',productName:'雨伞',facts:['买一送三']
 }}};
 const data={materials:[],knowledge:{documents:[],bases:[]}};
 const candidate={sku,name:'316不锈钢 887ml 手柄杯',source:'本款详情',facts:['颜色：米白','容量：887ml']};
 const prepared=prepareContent(data,goal,{rankedCandidates:[candidate]});
 assert.equal(prepared.productName,'887ml 手柄杯');
 assert.deepEqual(prepared.facts,['颜色：米白','容量：887ml']);
 assert.deepEqual(prepared.claimOmissions.map(r=>r.claim),['316不锈钢']);
 assert(prepared.evidence.every(e=>e.sku===sku));
 assert.equal(prepared.candidate.name,candidate.name);
});

test('a listing image dispatch receives only assessed claims and preserves an explicit merchant edit',async()=>{
 const goal={id:'goal',text:'在淘宝上架手柄杯',version:1,artifacts:[],messages:[]};
 const data={goals:[goal],materials:[],sources:[],knowledge:{bases:[]},imageJobs:[],
  imageConfig:{enabled:true,revision:1,provider:'codex_local',model:'Codex'}};
 let sent;
 const images=createImages({
  getData:()=>data,transaction:async fn=>fn(data),
  knowledge:{search:async()=>({hits:[{title:'别款规格',ordinal:0,revision:1,text:'杯子全网最低，保温12h'}]}),assertRecall:()=>{}},
  imageReady:()=>true,
  imageCall:async(_,request)=>{sent=request.prompt;throw new Error('stop after capture');},
  files:{}
 });
 const preparation={productName:'手柄杯',selectedSku:sku,facts:['容量：887ml','材质：316钢'],evidence:[confirmed('容量：887ml')]};
 const job=await images.create({requestId:'test-public-main-image',goalId:goal.id,outputKind:'main',description:'淘宝商品图，保温12h、316钢、全网最低价，887ml',
  editNotes:['底部换成：双十二优惠 买一赠一'],mode:'concept',size:'1024x1024',confirmed:true},{preparation});
 await images.pump();
 assert.match(sent,/887ml/);
 assert.match(sent,/活动名称「双十二优惠 买一赠一」/);
 assert.doesNotMatch(sent,/保温12h|316钢|全网最低|别款规格/);
 assert(job.claimOmissions.some(issue=>issue.claim==='316钢'));
});

test('final review checks actual public text, keeps research separate and scopes image verification',()=>{
 const steps=[
  {capability:'research.compare',title:'参考资料',artifactIds:['research']},
  {capability:'copy.selling_points',title:'商品卖点',artifactIds:['copy'],preparation:{selectedSku:sku,evidence:[confirmed('容量：887ml')]}},
  {capability:'image.main',title:'主图',artifactIds:['img']}
 ];
 const files=[
  {id:'research',title:'市场假设',body:'竞品宣传全网最低'},
  {id:'copy',title:'商品卖点',body:'大容量887ml。不得直接承诺免费安装或无条件退换。\n资料来源：供应商自称全网最低'},
  {id:'img',title:'商品主图',imageJobId:'job'}
 ];
 const input={goal:{text:'在淘宝上架'},steps,files,imageJobs:[{id:'job',status:'succeeded',mode:'concept'}]};
 const ok=reviewDeliverables(input);
 assert.equal(ok.status,'succeeded');
 assert.match(ok.artifacts[0].body,/概念图.*请核对成图中的实际文字/);
 files[1].body='推荐文案：全网最低价，保温12小时。';
 const rejected=reviewDeliverables(input);
 assert.equal(rejected.status,'needs_input');
 assert.deepEqual(rejected.missing.map(x=>x.slice(0,4)),['商品卖点','商品卖点']);
 input.files=files.filter(f=>f.id!=='img');
 assert(reviewDeliverables(input).missing.some(issue=>issue.includes('缺少「主图」')));
});

test('workspace publication vocabulary is reusable across domains and tied to source revision',()=>{
 const records=[
  {kind:'knowledge',id:'p',revision:7,title:'品牌传播规范',source:'品牌部',body:'发布禁用词：至尊服务、极速过审'},
  {kind:'knowledge',id:'q',revision:2,title:'其他项目规范',source:'品牌部',sku:'other',body:'禁用词：协助办理'},
  {kind:'knowledge',id:'r',revision:1,title:'京东用语',source:'品牌部',body:'京东禁用词：蓝色'}
 ];
 const docs=records.map(entry=>({...entry,enabled:true,baseId:'kb'}));
 const goal={text:'为淘宝制作服务文案',scope:{},skillData:{}};
 const data={knowledge:{bases:[{id:'kb',enabled:true}],documents:docs},materials:[]};
 const prep=prepareContent(data,goal,{rankedCandidates:[{
  name:'办理协助',sku:'svc',source:'服务目录',facts:['内容：协助办理','颜色：蓝色','卖点：极速过审']
 }]});
 assert.deepEqual(prep.facts,['内容：协助办理','颜色：蓝色']);
 assert.deepEqual(prep.publishingRules.map(rule=>[rule.id,rule.revision]),[['p',7]]);
 assert.equal(prep.claimOmissions[0].reason,'发布禁用词，依据《品牌传播规范》');
});

test('conditional evidence does not justify the unconditional version of a claim',()=>{
 const prep={selectedSku:sku,evidence:[confirmed('在室温20℃条件下保温12h')]};
 assert(reviewText('保温12h',prep).length);
 assert.deepEqual(reviewText('在室温20℃条件下保温12h',prep),[]);
});
