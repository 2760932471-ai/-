export function readBusinessTable(raw,{maxRows=200,maxChars=80000}={}){
 if(typeof raw!=='string'||!raw.trim()||raw.length>maxChars)throw new Error('请提供不超过 '+maxChars+' 字符的 CSV');
 const text=raw.replace(/^\uFEFF/,'');
 const rows=[];
 let row=[],cell='',quoted=false,closed=false;
 function finishRow(){
  row.push(cell.trim());
  if(row.some(Boolean))rows.push(row);
  row=[];cell='';closed=false;
 }
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(quoted){
   if(ch!=='"')cell+=ch;
   else if(text[i+1]==='"'){cell+='"';i++;}
   else{quoted=false;closed=true;}
  }else if(ch==='"'){
   if(cell||closed)throw new Error('CSV 引号格式错误');
   quoted=true;
  }else if(ch===','){
   row.push(cell.trim());cell='';closed=false;
  }else if(ch==='\n'||ch==='\r'){
   finishRow();
   if(ch==='\r'&&text[i+1]==='\n')i++;
  }else{
   if(closed&&ch.trim())throw new Error('CSV 闭合引号后只能是分隔符');
   cell+=ch;
  }
 }
 if(quoted)throw new Error('CSV 引号未闭合');
 finishRow();
 if(!rows.length||rows.length>maxRows+1)throw new Error('CSV 需要表头，最多可导入 '+maxRows+' 条数据');
 const header=rows.shift();
 if(new Set(header).size!==header.length||header.length>30)throw new Error('CSV 表头重复或过多');
 for(const [i,values] of rows.entries()){
  if(values.length!==header.length)throw new Error(`第 ${i+2} 行列数与表头不同`);
 }
 return {header,rows};
}
