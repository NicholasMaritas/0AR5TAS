import test from 'node:test';
import assert from 'node:assert/strict';
import {predominantIndex,createMomentumScroll} from './momentum-scroll.js';

test('visible-item observation uses predominant area in either scroll direction',()=>{
  assert.equal(predominantIndex([{top:-330,bottom:670},{top:670,bottom:1670}],0,1000),0);
  assert.equal(predominantIndex([{top:-670,bottom:330},{top:330,bottom:1330}],0,1000),1);
  assert.equal(predominantIndex([{top:200,bottom:1800}],200,800),0);
  assert.equal(predominantIndex([{top:1200,bottom:1600}],0,1000),-1);
});

function environment({end=true,snap=true,supported=true}={}) {
  const names=['CSS','IntersectionObserver','ResizeObserver','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout'];
  const original=Object.fromEntries(names.map(name=>[name,globalThis[name]]));
  const frames=new Map(),timers=new Map(),events=new Map();
  let top=0,id=0,writes=0,intersection,resize;
  const container={clientTop:0,clientHeight:1000,attrs:new Map(),
    get scrollTop(){return top},set scrollTop(value){writes++;throw Error('Observers must never drive scrolling')},
    scrollTo(){writes++;throw Error('Observers must never drive scrolling')},
    getBoundingClientRect:()=>({top:0,height:1000}),
    getAttribute(name){return this.attrs.get(name)??null},setAttribute(name,value){this.attrs.set(name,value)},removeAttribute(name){this.attrs.delete(name)},
    addEventListener(name,fn,options){events.set(name,{fn,options})},removeEventListener(name){events.delete(name)}
  };
  if(end)container.onscrollend=null;
  if(snap)container.onscrollsnapchange=null;
  let items=Array.from({length:6},(_,index)=>({getBoundingClientRect:()=>({top:index*1000-top,bottom:(index+1)*1000-top})}));
  container.querySelectorAll=()=>items;
  Object.assign(globalThis,{
    CSS:{supports:()=>supported},
    IntersectionObserver:class {constructor(fn){intersection=fn}observe(){}disconnect(){}},
    ResizeObserver:class {constructor(fn){resize=fn}observe(){}disconnect(){}},
    requestAnimationFrame(fn){frames.set(++id,fn);return id},cancelAnimationFrame(i){frames.delete(i)},
    setTimeout(fn){timers.set(++id,fn);return id},clearTimeout(i){timers.delete(i)}
  });
  return {container,events,frames,timers,get writes(){return writes},
    flush(){const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn())},
    emit(name,event={}){events.get(name)?.fn(event)},
    position(value){top=value},observe(){intersection()},resize(){resize()},items:()=>items,
    restore(){for(const name of names)if(original[name]===undefined)delete globalThis[name];else globalThis[name]=original[name]}
  };
}

test('native mode has no gesture interception, polling loop, or scrolling writes',()=>{
  const e=environment();try{
    const c=createMomentumScroll(e.container);e.flush();
    assert.equal(e.container.getAttribute('data-momentum-scroll'),'native');
    for(const event of ['wheel','touchstart','touchmove','pointerdown','keydown'])assert(!e.events.has(event));
    for(let n=0;n<30;n++){e.position(n*5);e.emit('scroll');e.flush()}
    assert.equal(e.container.scrollTop,145);assert.equal(e.writes,0);assert.equal(e.frames.size,0);assert.equal(e.timers.size,0);
    assert.equal(e.events.get('scroll').options.passive,true);c.destroy();
  }finally{e.restore()}
});

test('native snap events update settled item without launching another animation',()=>{
  const e=environment();try{
    const changes=[];const c=createMomentumScroll(e.container,{onActiveChange:state=>changes.push(state.index)});e.flush();
    e.position(4000);e.emit('scroll');e.emit('scrollsnapchange',{snapTargetBlock:e.items()[4]});e.emit('scrollend');e.flush();
    assert.deepEqual(changes,[0,4]);assert.equal(e.container.getAttribute('data-scroll-state'),'idle');assert.equal(e.writes,0);assert.equal(e.frames.size,0);c.destroy();
  }finally{e.restore()}
});

test('intersection fallback and resize observe majority without repositioning content',()=>{
  const e=environment({snap:false});try{
    const changes=[];const c=createMomentumScroll(e.container,{onActiveChange:state=>changes.push(state.index)});e.flush();
    e.position(680);e.observe();e.observe();assert.equal(e.frames.size,1);e.flush();assert.equal(changes.at(-1),1);
    e.position(300);e.resize();e.flush();assert.equal(changes.at(-1),0);assert.equal(e.container.scrollTop,300);assert.equal(e.writes,0);c.destroy();
  }finally{e.restore()}
});

test('older-browser timer only settles status; it never corrects the scroll position',()=>{
  const e=environment({end:false,snap:false,supported:false});try{
    const c=createMomentumScroll(e.container);e.flush();assert.equal(e.container.getAttribute('data-momentum-scroll'),'free');
    e.position(160);e.emit('scroll');const first=[...e.timers.keys()][0];e.emit('scroll');assert(!e.timers.has(first));
    const callbacks=[...e.timers.values()];e.timers.clear();callbacks.forEach(fn=>fn());e.flush();
    assert.equal(e.container.getAttribute('data-scroll-state'),'idle');assert.equal(e.container.scrollTop,160);assert.equal(e.writes,0);c.destroy();
  }finally{e.restore()}
});

test('refresh and idempotent destruction clean observers, callbacks and owned attributes',()=>{
  const e=environment({end:false});try{
    e.container.setAttribute('data-momentum-scroll','existing');const c=createMomentumScroll(e.container);e.flush();
    c.refresh();e.emit('scroll');assert(e.frames.size&&e.timers.size);c.destroy();c.destroy();
    assert.equal(e.events.size,0);assert.equal(e.frames.size,0);assert.equal(e.timers.size,0);
    assert.equal(e.container.getAttribute('data-momentum-scroll'),'existing');assert.equal(e.container.getAttribute('data-active-index'),null);
    e.observe();e.resize();c.refresh();assert.equal(e.frames.size,0);
  }finally{e.restore()}
});
