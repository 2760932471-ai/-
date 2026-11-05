import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom,sendMessage,tickRoom} from '../src/chat.js';
test('group supports human interruptions and directed replies in order',async()=>{
 const room=createRoom('新品方案',['product','content']);
 sendMessage(room,'请先考虑小预算','content');
 assert.equal(room.messages.filter(m=>m.role==='human').length,2);
 await tickRoom(room);await tickRoom(room);await tickRoom(room);
 const replies=room.messages.filter(m=>m.role==='agent');assert.deepEqual(replies.map(m=>m.agent),['product','content','content']);assert.match(replies[2].text,/小预算/);assert.equal(room.queue.length,0);
});
test('pause retains messages and queue; mentions route only to members',async()=>{
 const room=createRoom('活动',['product','content']);room.paused=true;
 sendMessage(room,'@内容营销 优化文案');assert.equal(room.queue.length,3);
 await tickRoom(room);assert.equal(room.artifacts.length,0);
 room.paused=false;await tickRoom(room);assert.equal(room.artifacts.length,1);
 assert.throws(()=>sendMessage(room,'测试','service'));assert.throws(()=>sendMessage(room,' '));assert.throws(()=>createRoom('目标',[]));
});
