const fetchOriginal=globalThis.fetch;
globalThis.fetch=async (url,o)=>{
 const host=new URL(url).hostname;
 if(host==='s.1688.com')return new Response('<script type="application/ld+json">'+JSON.stringify([123,456].map((id,i)=>({'@type':'Product',name:'墨镜 '+id,url:'https://detail.1688.com/offer/'+id+'.html',offers:{price:10+i,priceCurrency:'CNY'}})))+'</script>');
 if(host==='detail.1688.com'||host.endsWith('alicdn.com'))return new Response('unavailable',{status:403});
 if(host==='generativelanguage.googleapis.com'&&o.method==='POST'&&!JSON.parse(o.body).contents[0].parts[1]?.inlineData?.data)throw Error('Missing supplier pixels');
 return fetchOriginal(url,o);
};
