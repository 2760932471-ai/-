// Copy slots are filled only from explicit campaign terms or product evidence.
export function mainImageLayout(brief,facts=[]){
 const fields=String(brief).split(/[，,；;。\n]/).map(v=>v.trim());
 const campaign=fields.map(v=>v.match(/^(?:活动名称|活动文案|活动)[：:]\s*([^。；]{1,16})$/)?.[1]).find(Boolean);
 const price=fields.map(v=>v.match(/^(?:确认售价|活动价|到手价)[：:\s]*[¥￥]?([1-9]\d{0,6}(?:\.\d{1,2})?|0\.\d{1,2})元?$/)?.[1]).find(Boolean);
 const fact=facts.find(f=>!f.startsWith('商品品类')&&f.length<=32);
 let name='白底商品展示',layout='正方形构图，暖白或纯白背景，商品占画面约 76%，轮廓完整。使用柔和方向光和自然接触阴影，保留四周安全边距。';
 if(campaign||price){
  name='活动价格主图';layout='商品占上方约 75%，下方独立的信息带采用单一强调色。活动名左对齐、价格大字号右对齐；缺失的槽位留白。';
 }else if(fact||/卖点|功能展示|细节特写/.test(brief)){
  name='卖点特写主图';layout='商品在右侧占约三分之二，左侧留出标题和一处细节放大区。浅灰底搭配一种品牌色，层级清楚，缩小到手机列表大小仍可辨认。';
 }
 const copy=[campaign&&'活动名称「'+campaign+'」',price&&'零售价格「¥'+price+'」',fact&&'商品特点「'+fact+'」'].filter(Boolean);
 return {name,prompt:'淘宝主图模板 · '+name+'。'+layout+' 商品是视觉中心。'+(copy.length?'允许上图的文案仅有：'+copy.join('、')+'，逐字排版。':'画面仅展示商品，不放文字或数字。')+'禁止把采购报价、预计售价、回购率、估算利润用作促销文案；不编造折扣、平台标识、赠品或配件。'};
}
