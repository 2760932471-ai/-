import '../src/environment.js';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {accounts} from '../src/accounts.js';
const dir=process.env.DATA_DIR||fileURLToPath(new URL('../.data',import.meta.url));
await mkdir(dir,{recursive:true});
const auth=await accounts(dir,process.env,{reset:true});
auth.close();console.log('管理员密码已更新；已有会话已失效。');
