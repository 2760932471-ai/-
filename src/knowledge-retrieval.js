const fail=message=>{throw new Error(message);};
export function chunkText(value,{size=700,overlap=100}={}){
 if(typeof value!=='string'||!value.trim()||value.length>80000)fail('文档正文需为 1–80000 字符');
 if(!Number.isInteger(size)||size<200||size>1600||!Number.isInteger(overlap)||overlap<0||overlap>Math.floor(size/2))fail('切片长度为 200–1600，重叠为 0 至切片长度的一半');
 const text=value.replace(/\r\n?/g,'\n').replace(/^\uFEFF/,'');if(text.includes('\0'))fail('文件包含二进制内容，请使用 UTF-8 TXT 或 Markdown');
 const chunks=[];let start=0;
 while(start<text.length){
  let end=Math.min(start+size,text.length);
  if(end<text.length){const segment=text.slice(start,end);const breaks=[...segment.matchAll(/\n\n|[。！？!?]\s*|\n/g)].map(m=>m.index+m[0].length);const boundary=breaks.filter(n=>n>=size*.6).at(-1);if(boundary)end=start+boundary;if(/[\uDC00-\uDFFF]/.test(text[end]))end--;}
  const body=text.slice(start,end);if(body.trim())chunks.push({ordinal:chunks.length+1,start,end,text:body});
  if(end===text.length)break;start=Math.max(start+1,end-overlap);if(/[\uDC00-\uDFFF]/.test(text[start]))start++;
 }
 return {text,chunks};
}
export function tokenize(text){
 const tokens=[];for(const match of String(text).normalize('NFKC').toLowerCase().matchAll(/[a-z0-9]+(?:[-_.][a-z0-9]+)*|[\p{Script=Han}]+/gu)){
  const s=match[0];if(/\p{Script=Han}/u.test(s)){if(s.length===1)tokens.push(s);else for(let i=0;i<s.length-1;i++)tokens.push(s.slice(i,i+2));}else tokens.push(s);
 }return tokens;
}
export function bm25(query,rows){
 const terms=[...new Set(tokenize(query))];if(!terms.length||!rows.length)return [];
 const bags=rows.map(r=>{const tokens=tokenize(r.title+'\n'+r.text),counts=new Map();for(const t of tokens)counts.set(t,(counts.get(t)||0)+1);return {counts,length:tokens.length};});
 const avg=bags.reduce((a,b)=>a+b.length,0)/bags.length||1,df=new Map(terms.map(t=>[t,bags.filter(b=>b.counts.has(t)).length]));
 return rows.map((row,i)=>{const b=bags[i];let score=0;for(const t of terms){const f=b.counts.get(t)||0;if(f)score+=Math.log(1+(rows.length-df.get(t)+.5)/(df.get(t)+.5))*f*2.2/(f+1.2*(.25+.75*b.length/avg));}return {...row,score,lexicalScore:score};}).filter(r=>r.score>0).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
}
export function cosine(a,b){
 if(a.length!==b.length)throw new Error('向量维度不一致，请重建索引');
 let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}return aa&&bb?dot/Math.sqrt(aa*bb):0;
}
export function validateVectors(vectors,count){
 if(!Array.isArray(vectors)||vectors.length!==count)fail('Embedding 返回数量不匹配');
 const dimension=vectors[0]?.length;if(!Number.isInteger(dimension)||dimension<1||dimension>4096)fail('Embedding 维度必须为 1–4096');
 if(vectors.some(v=>!Array.isArray(v)||v.length!==dimension||v.some(x=>typeof x!=='number'||!Number.isFinite(x))||!v.some(x=>x!==0)))fail('Embedding 向量格式无效或包含零向量');return vectors;
}
