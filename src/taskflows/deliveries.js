import {moneyRange,describeComparison} from '../../public/market-comparison.js';

export function selectionCheckpoint(row,basis){
 const {sku,url:source,cost,retail,expenses,margin,periodMargin}=row;
 return {sku,source,cost,retail,expenses,margin,periodMargin,basis};
}

export function profitComparison(rows,selected,basis){
 const money=value=>Number.isFinite(value)?'¥'+value.toFixed(2):'待核实';
 const comparisons=rows.map(row=>{
  const saleSource=basis.retail!=null?'目标售价假设':row.salesBasis?.source;
  const lines=[row.title+' · SKU '+row.sku,'采购报价 '+money(row.price)+' '+row.terms+'，折合销售单位成本 '+money(row.cost),
   '售价 '+money(row.retail)+(saleSource?'（'+saleSource+'）':''),'单件其他费用 '+money(row.expenses)];
  if(row.assumedSaleUnit)lines.push('页面未注明报价单位，暂按一份报价对应一件销售商品试算');
  if(basis.fees)lines.push('费用按运费 '+money(basis.fees.shipping)+'、平台费率 '+basis.fees.service+'%、推广费率 '+basis.fees.promotion+'% 试算');
  if(row.margin!=null)lines.push('估算单件收益 '+money(row.margin));
  else if(row.market?.margin)lines.push('按展示价情景试算单件收益 '+moneyRange(...row.market.margin));
  else lines.push('收益待核算。需要核实'+[row.cost==null?'采购规格或报价冲突':'',row.retail==null?'同规格零售价':'',row.expenses==null?'履约、平台、推广等单件费用':''].filter(Boolean).join('、'));
  if(row.market?.priceRange){
   const sources=[...new Set(row.market.prices.map(item=>item.url||item.source||item.title))].filter(Boolean);
   lines.push((row.market.prices[0].scope==='exact'?'同款':'相近款')+'零售展示价 '+moneyRange(...row.market.priceRange)+'（'+sources.join('、')+'），成交价待核对');
   if(row.expenses==null&&!basis.fees&&row.market.feeCeiling)lines.push('按展示价扣除采购价，可承担其他费用 '+moneyRange(...row.market.feeCeiling));
  }
  if(row.market?.breakEvenSale!=null)lines.push('含给定费用的估算保本售价 '+money(row.market.breakEvenSale));
  if(row.market?.sample){
   const {value,unit,period,source}=row.market.sample;
   lines.push(period+' 实销 '+value+unit+'（'+source+'）');
   if(row.market.contribution)lines.push('按同期销量试算贡献 '+moneyRange(...row.market.contribution));
  }
  if(basis.periodGoal)lines.push('同期间贡献 '+money(row.periodMargin)+(row.salesBasis?'（'+row.salesBasis.period+'，'+row.salesBasis.units+' 件）':''));
  if(row.eligibilityReasons?.length)lines.push(row.eligibilityReasons.join('，'));
  return lines.join(' · ')+'\n'+row.url;
 });
 const comparable=rows.filter(row=>row.eligibility!=='excluded');
 const metric=basis.periodGoal?'periodMargin':'margin';
 const complete=comparable.every(row=>row.eligibility!=='unverified'&&!row.assumedSaleUnit&&row[metric]!=null&&(!basis.periodGoal||row.salesBasis?.period===selected.salesBasis?.period));
 const marketComplete=!basis.demandGoal||comparable.every(row=>row.market?.sample?.strength==='document'&&row.market?.contribution);
 const evidence=describeComparison(rows,selected,basis);
 const conclusion=complete&&marketComplete?'按上述售价及费用测算，当前选择「'+selected.title+'」。':'暂定「'+selected.title+'」，资料尚不足以证明利润最高。每单实收需超过同规格采购成本和其余单件费用才能盈利。';
 return {title:'候选商品利润测算',body:[conclusion,evidence].filter(Boolean).join('\n\n')+'\n\n估算单件收益 = 售价 − 同规格采购成本 − 单件其他费用。\n\n'+comparisons.join('\n\n'),evidence:'采购报价见商品链接。目标假设、销售记录和查到的零售展示价按候选分别注明。',sku:selected.sku};
}

export function deliveryFiles(goal,node){
 return goal.artifacts.filter(file=>node.artifactIds?.includes(file.id)&&file.version===goal.version&&file.status!=='superseded'&&
  (node.imageJobId?file.imageJobId===node.imageJobId:file.taskId===node.id));
}

// Invalidate the affected branches only after their outstanding external work is recorded.
export function invalidateBranches(goal,roots,newId,keepSku){
 const affected=new Set(roots);
 const nodes=goal.flow.nodes;
 for(let size=-1;size!==affected.size;){
  size=affected.size;
  for(const node of nodes)if(node.dependsOn.some(id=>affected.has(id)))affected.add(node.id);
 }
 const branch=nodes.filter(node=>affected.has(node.id));
 if(branch.some(node=>node.status==='running'||node.status==='waiting_external'))return false;
 for(const node of branch){
  if(keepSku&&!roots.includes(node.id)&&node.status==='succeeded'&&/^(image|copy)\./.test(node.capability)&&node.preparation?.candidate?.sku===keepSku&&deliveryFiles(goal,node).length)continue;
  for(const file of deliveryFiles(goal,node))file.status='superseded';
  if(node.imageJobId&&!node.imageUnconfirmed){delete node.imageJobId;node.imageRetryId=newId();}
  for(const key of ['selection','preparation','recall','investigation','detailDeadline','photoAttempts','nextPhotoTry','decisionCheck'])delete node[key];
  Object.assign(node,{status:node.imageUnconfirmed?'failed':'pending',error:node.imageUnconfirmed?node.error:null,missing:[],artifactIds:[]});
 }
 return true;
}
