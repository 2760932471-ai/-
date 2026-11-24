// Copy slots are filled only from explicit campaign terms or product evidence.
export function mainImageLayout(brief,facts=[],productName='',hasReference=false){
 const fields=String(brief).split(/[，,；;。\n]/).map(v=>v.trim());
 const campaign=fields.map(v=>v.match(/^(?:活动名称|活动文案|活动)[：:]\s*([^。；]{1,16})$/)?.[1]).find(Boolean);
 const price=fields.map(v=>v.match(/^(?:确认售价|活动价|到手价)[：:\s]*[¥￥]?([1-9]\d{0,6}(?:\.\d{1,2})?|0\.\d{1,2})元?$/)?.[1]).find(Boolean);
 const points=facts.filter(f=>!f.startsWith('商品品类')&&f.length<=32).slice(0,2);
 const fact=points[0];
 let name='白底商品展示',layout='正方形构图，暖白或纯白背景，商品占画面约 76%，轮廓完整。使用柔和方向光和自然接触阴影，保留四周安全边距。';
 if(campaign||price){
  name='活动价格主图';layout='商品占上方约 75%，下方独立的信息带采用单一强调色。活动名左对齐、价格大字号右对齐；缺失的槽位留白。';
 }else if(fact||/卖点|功能展示|细节特写/.test(brief)){
  name='卖点特写主图';layout='商品在右侧占约三分之二，左侧留出标题和一处细节放大区。浅灰底搭配一种品牌色，层级清楚，缩小到手机列表大小仍可辨认。';
 }
 const listing=/淘宝|天猫|上架/.test(brief);
 const category=(productName+' '+brief).match(/太阳镜|墨镜|老花镜|近视眼镜|眼镜|花洒|水龙头|露营灯|角阀|灯具/)?.[0]||'';
 if(listing&&name==='白底商品展示'){
  name='淘宝商品封面';layout='商用方形封面：根据所附白底商品图抠出主体并重新排版。主体以最能辨识轮廓的角度占画面约 75%，搭配柔和投影及浅色有层次的台面。左上短标题，底部信息栏与商品错开。';
 }
 if(listing&&name==='卖点特写主图')layout+=' 采用石墨黑与暖金，或米白与朱红的单一配色；底部窄条只排一至两项有来源的信息。';
 const captions=points.map(p=>p.replace(/^(.+?)颜色[：:]\s*(.+)$/,'$2$1').replace(/^款式[：:]\s*/,''));
 const visual=listing&&hasReference&&!points.length?'另可从底图直接看清的轮廓、配色或结构中提炼一条最多八字的副标题；看不清就留白，不能推断防护功效、镜片度数或材质。':'';
 const copy=[listing&&category&&'品类标题「'+category+'」',campaign&&'活动名称「'+campaign+'」',price&&'零售价格「¥'+price+'」',...captions.map(p=>'商品特点「'+p+'」')].filter(Boolean);
 return {name,prompt:(listing?'基于所附白底图或商品原图，生成一张用于淘宝上架审核的商品主图。忠实保留实物轮廓、材质观感、颜色和配件；移除原背景干扰，优先采用无水印素材，独立设计广告排版。':'')+'淘宝主图模板 · '+name+'。'+layout+' 商品是视觉中心。标题在手机缩略图上清晰可读，文字和主体不得互相遮挡。参考样式只借鉴布局，不借用认证、清凉护目、防刮耐磨等未经证实的宣传语。'+(copy.length?'排版所用的已知文案：'+copy.join('、')+'，逐字排版。':'未提供主标题，留出商品展示空间。')+visual+'禁止把采购报价、预计售价、回购率、估算利润用作促销文案；不编造折扣、平台标识、赠品或配件。'};
}
