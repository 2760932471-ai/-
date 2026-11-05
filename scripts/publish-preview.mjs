// Publish only the self-contained preview, never source docs, credentials or runtime data.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const git=(args,input)=>execFileSync('git',args,{cwd:root,input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
try {
 execFileSync(process.execPath,['scripts/build-demo.mjs'],{cwd:root,stdio:'inherit'});
 const refs=git(['ls-remote','--heads','origin','refs/heads/gh-pages']);
 let parent='';
 if(refs){
  git(['fetch','origin','refs/heads/gh-pages']);
  parent=git(['rev-parse','FETCH_HEAD']);
  const files=git(['ls-tree','-r','--name-only',parent]).split('\n');
  if(files.some(name=>!['index.html','.nojekyll'].includes(name)))throw new Error('Existing gh-pages contains other files. Review its contents before publishing; nothing was overwritten.');
 }
 const html=readFileSync(new URL('../deliverables/ai-platform-preview.html',import.meta.url));
 const htmlHash=git(['hash-object','-w','--stdin'],html);
 const emptyHash=git(['hash-object','-w','--stdin'],'');
 const tree=git(['mktree'],`100644 blob ${emptyHash}\t.nojekyll\n100644 blob ${htmlHash}\tindex.html\n`);
 if(parent&&git(['rev-parse',parent+'^{tree}'])===tree){console.log('Remote gh-pages already contains this preview. Enable Pages once in repository settings if needed.');process.exit(0);}
 const commit=git(['commit-tree',tree,...(parent?['-p',parent]:[]),'-m','Publish self-contained AI employee preview']);
 // Ordinary push is intentional: concurrent changes must reject instead of being overwritten.
 execFileSync('git',['push','origin',`${commit}:refs/heads/gh-pages`],{cwd:root,stdio:'inherit'});
 console.log(`Preview branch saved: ${commit}. This does not enable GitHub Pages or prove the live site is deployed.`);
} catch(error) {
 console.error(error.stderr?.toString().trim()||error.message);
 process.exitCode=1;
}
