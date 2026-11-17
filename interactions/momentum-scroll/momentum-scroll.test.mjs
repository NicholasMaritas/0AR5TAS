import test from 'node:test';
import assert from 'node:assert/strict';
import {predominantIndex,alignmentTarget,springPosition,createMomentumScroll} from './momentum-scroll.js';

test('predominant visible pixels choose the two-thirds item in either direction',()=>{
  assert.equal(predominantIndex([{top:-330,bottom:670},{top:670,bottom:1670}],0,1000),0);
  assert.equal(predominantIndex([{top:-670,bottom:330},{top:330,bottom:1330}],0,1000),1);
  assert.equal(predominantIndex([{top:0,bottom:900},{top:900,bottom:1000}],0,1000),0);
});
test('alignment respects ends, inset containers, and freely readable oversized items',()=>{
  assert.equal(alignmentTarget({top:200,bottom:1200,height:1000},100,1000,900,5000),1000);
  assert.equal(alignmentTarget({top:-300,bottom:1700,height:2000},0,1000,300,5000),300);
  assert.equal(alignmentTarget({top:300,bottom:1300,height:1000},0,1000,4900,5000),5000);
});
test('spring starts at native position/velocity and converges without a synthetic fling',()=>{
  assert.equal(springPosition(320,1000,30,0),320);
  const derivative=(springPosition(320,1000,30,1e-7)-320)/1e-7;
  assert(Math.abs(derivative-30)<.01);
  let previous=320;
  for(let t=1/120;t<=1.25;t+=1/120){const next=springPosition(320,1000,30,t);assert(next>=previous);assert(next<=1000);previous=next;}
  assert(Math.abs(previous-1000)<.01);
});

function environment(reduce=false){
  const names=['window','performance','requestAnimationFrame','cancelAnimationFrame','matchMedia','ResizeObserver'];
  const originals=Object.fromEntries(names.map(n=>[n,globalThis[n]]));
  let now=0,id=0;const frames=new Map();
  const target=()=>({events:{},addEventListener(n,f){this.events[n]=f},removeEventListener(n){delete this.events[n]}});
  const win=target(),container=Object.assign(target(),{scrollTop:0,scrollHeight:6000,clientHeight:1000,clientTop:0,attrs:{},getAttribute(n){return this.attrs[n]??null},setAttribute(n,v){this.attrs[n]=v},removeAttribute(n){delete this.attrs[n]},getBoundingClientRect(){return {top:0,height:1000}}});
  const items=Array.from({length:6},(_,i)=>({getBoundingClientRect(){return {top:i*1000-container.scrollTop,bottom:(i+1)*1000-container.scrollTop,height:1000}}}));
  container.querySelectorAll=()=>items;
  Object.assign(globalThis,{window:win,performance:{now:()=>now},requestAnimationFrame:f=>{frames.set(++id,f);return id},cancelAnimationFrame:i=>frames.delete(i),matchMedia:()=>({matches:reduce}),ResizeObserver:class{observe(){}disconnect(){}}});
  return {container,frames,step(ms){for(let end=now+ms;now<end;){now+=16;const current=[...frames.values()];frames.clear();current.forEach(f=>f(now));}},scroll(y){container.scrollTop=y;container.events.scroll?.()},restore(){for(const n of names)if(originals[n]===undefined)delete globalThis[n];else globalThis[n]=originals[n]}};
}
test('no alignment while finger remains down; release selects predominant item',()=>{
  const e=environment();try{const c=createMomentumScroll(e.container);e.container.events.touchstart({touches:[{}]});e.scroll(600);e.step(900);assert.equal(e.container.scrollTop,600);e.container.events.touchend({touches:[]});e.step(1800);assert.equal(e.container.scrollTop,1000);c.destroy();assert.equal(e.frames.size,0);}finally{e.restore()}
});
test('high native velocity can cross several items before alignment',()=>{
  const e=environment();try{const c=createMomentumScroll(e.container);e.container.events.wheel();for(let y=50;y<=3600;y+=50){e.scroll(y);e.step(16);assert.notEqual(e.container.attrs['data-momentum-scroll'],'snapping')}e.step(1800);assert.equal(e.container.scrollTop,4000);c.destroy()}finally{e.restore()}
});
test('new wheel input immediately interrupts an in-progress snap',()=>{
  const e=environment();try{const c=createMomentumScroll(e.container);e.scroll(600);e.step(160);assert.equal(e.container.attrs['data-momentum-scroll'],'snapping');e.step(64);const top=e.container.scrollTop;e.container.events.wheel();assert.equal(e.container.attrs['data-momentum-scroll'],'ready');e.scroll(top-20);e.step(32);assert.equal(e.container.scrollTop,top-20);c.destroy()}finally{e.restore()}
});
test('reduced motion aligns after settling without a spring',()=>{
  const e=environment(true);try{const c=createMomentumScroll(e.container);e.scroll(600);e.step(160);assert.equal(e.container.scrollTop,1000);assert.equal(e.container.attrs['data-momentum-scroll'],'ready');c.destroy()}finally{e.restore()}
});
