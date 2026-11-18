import test from 'node:test';
import assert from 'node:assert/strict';

const initialDocument = globalThis.document;
globalThis.document = {querySelector:()=>null};
const {createLoopMenu} = await import('./menu.js');
if (initialDocument === undefined) delete globalThis.document;
else globalThis.document = initialDocument;

function fixture(run) {
  const globals = ['window','document','matchMedia','getComputedStyle','requestAnimationFrame','cancelAnimationFrame','performance'];
  const prior = new Map(globals.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const captures = new Map(), frames = new Map(), pendingCaptureLoss = [];
  let now=0, sequence=0;
  class Target {
    constructor(parent=null) {this.parent=parent;this.listeners=new Map();this.dataset={};this.attrs=new Map();this.properties=new Map();this.style={setProperty:(k,v)=>this.properties.set(k,v),removeProperty:k=>this.properties.delete(k)};}
    addEventListener(name,fn,options) {const list=this.listeners.get(name)||[];list.push({fn,capture:options===true||options?.capture===true});this.listeners.set(name,list);}
    removeEventListener(name,fn) {this.listeners.set(name,(this.listeners.get(name)||[]).filter(entry=>entry.fn!==fn));}
    setAttribute(name,value) {this.attrs.set(name,String(value));}
    removeAttribute(name) {this.attrs.delete(name);if(name==='data-centered')delete this.dataset.centered;}
    toggleAttribute(name,value) {if(value)this.attrs.set(name,'');else this.attrs.delete(name);}
    contains(target) {for(let node=target;node;node=node.parent)if(node===this)return true;return false;}
    focus() {doc.activeElement=this;}
    setPointerCapture(id) {
      const previous=captures.get(id);captures.set(id,this);
      // Browsers dispatch lostpointercapture on the old owner when a pending
      // capture transfer is processed before the next pointer event. It bubbles
      // from that child even though the ancestor is now the capture owner.
      if(previous&&previous!==this)pendingCaptureLoss.push({target:previous,id});
    }
    hasPointerCapture(id) {return captures.get(id)===this;}
    releasePointerCapture(id) {if(this.hasPointerCapture(id)){captures.delete(id);emit(this,'lostpointercapture',{pointerId:id});}}
    getBoundingClientRect() {return {left:parseFloat(this.properties.get('--trigger-x')??(root.dataset.triggerSide==='left'?18:426)),top:parseFloat(this.properties.get('--trigger-y')??(root.dataset.triggerDock==='middle'?372:670)),width:56,height:56};}
    click() {return emit(this,'click');}
  }
  const root=new Target(),button=new Target(root),panel=new Target(root),gap=new Target(root),win=new Target(),doc=new Target();
  const names=['Home','CDG','Junya Watanabe','Noir','Stores','Subscribe','Recruitment'];
  const links=names.map(name=>{const link=new Target(panel);link.querySelector=()=>({textContent:name});return link;});
  panel.clientHeight=168;
  root.querySelector=selector=>selector==='.loop-toggle'?button:panel;
  root.querySelectorAll=()=>links;
  doc.querySelector=()=>null;doc.hidden=false;doc.activeElement=null;
  const mobile=new Target(),reduced=new Target();mobile.matches=true;reduced.matches=false;
  function emit(target,type,properties={}) {
    if(type.startsWith('pointer')&&type!=='pointerdown')flushCaptureChanges();
    const event={pointerId:1,isPrimary:true,button:0,clientX:454,clientY:670,timeStamp:now,detail:1,key:'',deltaY:0,deltaMode:0,ctrlKey:false,
      prevented:false,stopped:false,immediate:false,
      preventDefault(){this.prevented=true},stopPropagation(){this.stopped=true},stopImmediatePropagation(){this.stopped=true;this.immediate=true},...properties};
    if(type==='pointerdown'&&event.pointerType==='touch'&&!captures.has(event.pointerId))captures.set(event.pointerId,target);
    if(type.startsWith('pointer')&&type!=='pointerdown'&&captures.has(event.pointerId))target=captures.get(event.pointerId);
    event.target=target;
    const path=[];for(let node=target;node;node=node.parent)path.push(node);
    const visit=(node,capture)=>{for(const entry of [...(node.listeners.get(type)||[])]){if(entry.capture===capture){entry.fn(event);if(event.immediate)break;}}};
    for(const node of [...path].reverse()){visit(node,true);if(event.stopped)return event;}
    for(const node of path){visit(node,false);if(event.stopped)break;}
    return event;
  }
  function flushCaptureChanges() {
    while(pendingCaptureLoss.length){const {target,id}=pendingCaptureLoss.shift();emit(target,'lostpointercapture',{pointerId:id,pointerType:'touch'});}
  }
  const values={window:win,document:doc,matchMedia:query=>query.includes('prefers-reduced')?reduced:mobile,
    getComputedStyle:()=>({getPropertyValue:()=>'56px'}),requestAnimationFrame:fn=>{frames.set(++sequence,fn);return sequence;},cancelAnimationFrame:id=>frames.delete(id),performance:{now:()=>now}};
  for(const [name,value]of Object.entries(values))Object.defineProperty(globalThis,name,{value,configurable:true,writable:true});
  const controller=createLoopMenu(root);
  function advance(count=180){for(let step=0;step<count&&frames.size;step++){now+=16;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(now));}}
  const env={root,button,panel,gap,links,win,mobile,reduced,captures,frames,emit,advance,flushCaptureChanges,controller,
    open(){emit(button,'click');assert.equal(root.dataset.open,'true');},
    drag(target,{from=600,to=656,id=1}={}){emit(target,'pointerdown',{pointerId:id,clientY:from,timeStamp:0});emit(target,'pointermove',{pointerId:id,clientY:to,timeStamp:80});return emit(target,'pointerup',{pointerId:id,clientY:to,timeStamp:90});}};
  try {run(env);} finally {controller.destroy();for(const [name,descriptor]of prior){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}
}

test('open trigger, empty input band and link all drive one shared vertical menu gesture',()=>{
  for(const origin of ['button','gap','link'])fixture(env=>{
    env.open();const target=origin==='link'?env.links[0]:env[origin];
    env.emit(target,'pointerdown',{clientY:600,timeStamp:0});
    env.emit(target,'pointermove',{clientY:656,timeStamp:80});
    assert.equal(env.links[0].style.transform,'translate3d(0,56px,0)','one row, not duplicate pointer handlers');
    assert.equal(env.captures.get(1),env.root,'shared ancestor owns open capture');
    env.emit(target,'pointerup',{clientY:656,timeStamp:90});
    assert.equal(env.captures.size,0);
    assert.equal(env.root.dataset.triggerSide,'right');
    assert.equal(env.root.dataset.triggerDock,'bottom');
    const click=env.emit(target,'click');
    assert.equal(click.prevented,true);assert.equal(env.root.dataset.open,'true');
  });
});

test('fast final pointerup travel scrolls menu and suppresses trigger activation',()=>fixture(env=>{
  env.open();env.emit(env.button,'pointerdown',{clientY:600,timeStamp:0});
  env.emit(env.button,'pointerup',{clientY:656,timeStamp:15});
  assert.equal(env.links[0].style.transform,'translate3d(0,56px,0)');
  assert.equal(env.emit(env.button,'click').prevented,true);
  assert.equal(env.root.dataset.open,'true');
}));

test('touch implicit capture transfers from trigger, link and gap without canceling menu scrolling',()=>{
  for(const origin of ['button','link','gap'])fixture(env=>{
    env.open();const target=origin==='link'?env.links[0]:env[origin];
    const touch={pointerId:1,pointerType:'touch',clientY:600,timeStamp:0};
    env.emit(target,'pointerdown',touch);
    assert.equal(env.captures.get(1),target,'touch begins with implicit child capture');
    env.emit(target,'pointermove',{...touch,clientY:628,timeStamp:20});
    assert.equal(env.captures.get(1),env.root,'menu explicitly takes capture');
    env.flushCaptureChanges();
    assert.equal(env.captures.get(1),env.root,'bubbling loss from old child must not cancel new owner');
    env.emit(target,'pointermove',{...touch,clientY:656,timeStamp:40});
    assert.equal(env.links[0].style.transform,'translate3d(0,56px,0)','second touch sample continues the same scroll');
    env.emit(target,'pointerup',{...touch,clientY:656,timeStamp:50});
    assert.equal(env.captures.size,0);
    assert.equal(env.emit(target,'click').prevented,true);assert.equal(env.root.dataset.open,'true');
  });
});

test('genuine capture loss on the shared root still cancels its touch gesture safely',()=>fixture(env=>{
  env.open();const touch={pointerId:1,pointerType:'touch',clientY:600,timeStamp:0};
  env.emit(env.root,'pointerdown',touch);
  env.emit(env.root,'pointermove',{...touch,clientY:628,timeStamp:20});
  assert.equal(env.captures.get(1),env.root);
  env.emit(env.root,'lostpointercapture',{pointerId:1,pointerType:'touch'});
  assert.equal(env.captures.size,0);
  const stopped=env.links[0].style.transform;
  env.emit(env.root,'pointermove',{...touch,clientY:656,timeStamp:40});
  assert.equal(env.links[0].style.transform,stopped,'cancelled pointer cannot continue moving menu');
  assert.equal(env.emit(env.button,'click').prevented,true);assert.equal(env.root.dataset.open,'true');
}));

test('unrelated pointer cancellation leaves primary open scroll and capture intact',()=>fixture(env=>{
  env.open();env.emit(env.gap,'pointerdown',{clientY:600});
  env.emit(env.gap,'pointermove',{clientY:628,timeStamp:20});
  env.emit(env.root,'pointercancel',{pointerId:9});
  assert.equal(env.captures.get(1),env.root);
  env.emit(env.gap,'pointermove',{clientY:656,timeStamp:40});
  assert.equal(env.links[0].style.transform,'translate3d(0,56px,0)');
  env.emit(env.gap,'pointerup',{clientY:656,timeStamp:50});
}));

test('tap still toggles exactly once, while horizontal open drag never docks or toggles',()=>fixture(env=>{
  env.open();env.emit(env.button,'pointerdown',{clientX:454,clientY:600});
  env.emit(env.button,'pointerup',{clientX:454,clientY:600,timeStamp:50});
  assert.notEqual(env.emit(env.button,'click').prevented,true);
  assert.equal(env.root.dataset.open,'false');
  env.open();env.emit(env.button,'pointerdown',{clientX:454,clientY:600});
  env.emit(env.button,'pointerup',{clientX:200,clientY:600,timeStamp:70});
  assert.equal(env.emit(env.button,'click').prevented,true);
  assert.equal(env.root.dataset.open,'true');assert.equal(env.root.dataset.triggerSide,'right');
}));

test('wheel over button and blank band is contained, with pinch-wheel and closed input left native',()=>{
  for(const origin of ['button','gap'])fixture(env=>{
    assert.notEqual(env.emit(env[origin],'wheel',{deltaY:-56}).prevented,true);
    env.open();assert.equal(env.emit(env[origin],'wheel',{deltaY:-56}).prevented,true);
    env.advance();assert.equal(env.panel.dataset.centered,'CDG');
    assert.notEqual(env.emit(env[origin],'wheel',{deltaY:56,ctrlKey:true}).prevented,true);
  });
});

test('resize releases open capture, settles menu, and suppresses only the trailing drag click',()=>fixture(env=>{
  env.open();env.emit(env.button,'pointerdown',{clientY:600});
  env.emit(env.button,'pointermove',{clientY:640,timeStamp:30});
  env.emit(env.win,'resize');
  assert.equal(env.captures.size,0);assert.equal(env.frames.size,0);
  env.emit(env.button,'pointerup',{clientY:640,timeStamp:70});
  assert.equal(env.emit(env.button,'click').prevented,true);assert.equal(env.root.dataset.open,'true');
  env.emit(env.button,'pointerdown',{clientY:640,timeStamp:100});
  env.emit(env.button,'pointerup',{clientY:640,timeStamp:140});
  assert.notEqual(env.emit(env.button,'click').prevented,true);assert.equal(env.root.dataset.open,'false');
}));

test('genuine cancellation stops capture without letting the next drag click close the menu',()=>fixture(env=>{
  env.open();env.emit(env.gap,'pointerdown',{clientY:600});
  env.emit(env.gap,'pointermove',{clientY:640,timeStamp:30});env.emit(env.gap,'pointercancel');
  assert.equal(env.captures.size,0);assert.equal(env.emit(env.button,'click').prevented,true);
  assert.equal(env.root.dataset.open,'true');env.advance();assert.equal(env.frames.size,0);
}));

test('closed docking keeps its primary gesture when another pointer is pressed or canceled',()=>fixture(env=>{
  env.emit(env.button,'pointerdown',{clientX:454,clientY:670,pointerId:1});
  assert.equal(env.captures.get(1),env.button);
  env.emit(env.button,'pointerdown',{clientX:100,clientY:300,pointerId:2,isPrimary:true});
  env.emit(env.button,'pointercancel',{pointerId:2});
  assert.equal(env.captures.get(1),env.button);
  env.emit(env.button,'pointerup',{clientX:430,clientY:670,pointerId:1,timeStamp:15});
  assert.equal(env.root.dataset.triggerSide,'left');
  assert.equal(env.captures.size,0);
  assert.equal(env.emit(env.button,'click').prevented,true);
  assert.equal(env.root.dataset.open,'false');
}));

test('open band keeps its original capture when a different input reports itself primary',()=>fixture(env=>{
  env.open();
  env.emit(env.gap,'pointerdown',{pointerId:1,clientY:600});
  env.emit(env.gap,'pointermove',{pointerId:1,clientY:628,timeStamp:20});
  env.emit(env.button,'pointerdown',{pointerId:2,isPrimary:true,clientY:200,timeStamp:25});
  env.emit(env.button,'pointerup',{pointerId:2,isPrimary:true,clientY:260,timeStamp:30});
  assert.equal(env.captures.get(1),env.root);
  env.emit(env.gap,'pointermove',{pointerId:1,clientY:656,timeStamp:40});
  assert.equal(env.links[0].style.transform,'translate3d(0,56px,0)');
  env.emit(env.gap,'pointerup',{pointerId:1,clientY:656,timeStamp:50});
  assert.equal(env.captures.size,0);assert.equal(env.root.dataset.open,'true');
}));

test('destroy removes shared input and cancels capture/animation work',()=>fixture(env=>{
  env.open();env.emit(env.gap,'pointerdown',{clientY:600});env.emit(env.gap,'pointermove',{clientY:650,timeStamp:30});
  env.controller.destroy();assert.equal(env.captures.size,0);assert.equal(env.frames.size,0);
  assert.notEqual(env.emit(env.gap,'wheel',{deltaY:-56}).prevented,true);
}));
