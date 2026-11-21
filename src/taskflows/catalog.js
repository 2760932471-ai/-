import {skillDefinitions} from '../workforce/skills.js';
export const flowCapabilities=[
 {id:'evidence.collect',name:'检索知识与外部线索',description:'自动检索目标知识库，并在搜索服务可用时查询网页。保留来源，不把网页摘要当成已核验事实。'},
 {id:'market.offers',name:'跨平台选品',description:'检索授权选品网关的商品并核对目标渠道、转售与履约条件。'},
 {id:'analysis.reason',name:'通用分析与方法设计',description:'根据当前问题和来源选择分析方法，输出有依据的判断、假设和缺口；需要可用模型。'},
 {id:'image.main',name:'生成主图',description:'调用配置的图片服务交付真实 PNG；概念图与实拍参考图明确区分。'},
 {id:'image.detail',name:'生成详情图片模块',description:'生成竖版详情图片模块，需要图片服务，不是整张详情长图。'},
 ...skillDefinitions.map(s=>({id:s.id,name:s.name,description:s.description})),
 {id:'result.compile',name:'核验并汇总结果',description:'汇总前序任务的真实交付物、来源和限制，不将未执行任务标为完成。'},
];
const node=(id,title,capability,dependsOn=[])=>({id,title,capability,dependsOn,objective:title,acceptance:'交付可检查的结果并说明来源与限制',required:true});
export const flowTemplates=[
 {id:'analysis',name:'证据驱动分析',description:'收集证据后，按问题选择分析方法，最后整合判断。',nodes:[node('evidence','收集相关证据','evidence.collect'),node('analysis','分析问题并验证结论','analysis.reason',['evidence']),node('summary','核验与汇总','result.compile',['analysis'])]},
 {id:'compare',name:'候选商品比较',description:'查找已有候选资料，比较参数和报价；不编造评分。',nodes:[node('evidence','查找候选资料','evidence.collect'),node('compare','比较商品参数与报价','product.compare',['evidence']),node('summary','汇总比较结果','result.compile',['compare'])]},
 {id:'content',name:'商品文案制作',description:'统一读取事实，标题和卖点并行产出，再汇总。',nodes:[node('evidence','整理商品来源','evidence.collect'),node('title','制作商品标题','copy.titles',['evidence']),node('selling','提炼商品卖点','copy.selling_points',['evidence']),node('summary','核验与汇总','result.compile',['title','selling'])]},
 {id:'images',name:'商品图片制作',description:'从可用来源整理商品资料，生成主图并交付。',nodes:[node('evidence','整理商品和参考素材','evidence.collect'),node('main','生成商品主图','image.main',['evidence']),node('summary','核验图片交付','result.compile',['main'])]},
];
export function flowDefaults(){return {revision:1,modelId:null,parallel:3,maxNodes:12,maxCalls:24};}
