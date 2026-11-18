import test from 'node:test';
import assert from 'node:assert/strict';
import {createSlidingTrigger, flickSide} from './trigger-slide.js';

function fixture(run) {
  const previous = globalThis.window;
  class Target {
    listeners = new Map();
    addEventListener(name, handler, options) {
      const list=this.listeners.get(name)||[]; list.push({handler,capture:options===true}); this.listeners.set(name,list);
    }
    removeEventListener(name, handler) {this.listeners.set(name,(this.listeners.get(name)||[]).filter(x=>x.handler!==handler));}
    emit(name, properties={}) {
      const event={pointerId:1,isPrimary:true,button:0,clientX:454,clientY:655,timeStamp:0,detail:1,
        preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true},...properties};
      for(const entry of [...(this.listeners.get(name)||[])].sort((a,b)=>Number(b.capture)-Number(a.capture))){
        entry.handler(event); if(event.stopped)break;
      }
      return event;
    }
  }
  const win=new Target(),button=new Target(),root={dataset:{}};
  const styles=new Map(),capture=new Set();
  let enabled=true,open=false;
  button.style={setProperty:(k,v)=>styles.set(k,v),removeProperty:k=>styles.delete(k)};
  button.getBoundingClientRect=()=>({left:styles.has('--trigger-offset')?18+parseFloat(styles.get('--trigger-offset')):root.dataset.triggerSide==='left'?18:426,width:56});
  button.setPointerCapture=id=>capture.add(id);
  button.hasPointerCapture=id=>capture.has(id);
  button.releasePointerCapture=id=>capture.delete(id);
  globalThis.window=win;
  const controller=createSlidingTrigger(root,button,{isEnabled:()=>enabled,isOpen:()=>open});
  const context={root,button,win,styles,capture,controller,
    enable:value=>{enabled=value},open:value=>{open=value},
    drag(from,to,start=0,end=120){button.emit('pointerdown',{clientX:from,timeStamp:start});button.emit('pointermove',{clientX:to,timeStamp:end-10});button.emit('pointerup',{clientX:to,timeStamp:end})}};
  try{run(context)}finally{controller.destroy();if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
}

test('a short inward flick chooses the opposite edge without a midpoint or speed requirement',()=>{
  assert.equal(flickSide('right',11.99),'right');
  assert.equal(flickSide('right',12),'left');
  assert.equal(flickSide('left',12),'right');
  assert.equal(flickSide('left',-20),'left');
});
test('closed trigger follows horizontal dragging, changes side and suppresses accidental opening',()=>fixture(({button,root,styles,capture})=>{
  let opened=0;button.addEventListener('click',()=>opened++);
  button.emit('pointerdown',{clientX:454});
  button.emit('pointermove',{clientX:80,timeStamp:100});
  assert.equal(button.getBoundingClientRect().left,52);
  assert.equal(root.dataset.triggerDragging,'true');
  button.emit('pointerup',{clientX:80,timeStamp:120});
  assert.equal(root.dataset.triggerSide,'left');
  assert.equal(styles.has('--trigger-offset'),false);
  assert.equal(capture.size,0);
  assert.equal(button.emit('click').prevented,true);assert.equal(opened,0);
}));
test('sliding back to the right retains one trigger and clears the drag offset',()=>fixture(({button,root,styles,drag})=>{
  drag(454,40);assert.equal(root.dataset.triggerSide,'left');
  drag(46,460,200,350);assert.equal(root.dataset.triggerSide,'right');
  assert.equal(styles.size,0);assert.equal(root.dataset.triggerDragging,undefined);
}));
test('open menu locks position and a drag attempt neither moves nor toggles it',()=>fixture(({button,root,styles,open})=>{
  open(true);button.emit('pointerdown');button.emit('pointermove',{clientX:40,timeStamp:50});button.emit('pointerup',{clientX:40,timeStamp:60});
  assert.equal(root.dataset.triggerSide,'right');assert.equal(styles.size,0);
  assert.equal(root.dataset.triggerDragging,undefined);
  assert.equal(button.emit('click').prevented,true);
}));
test('a normal tap remains a normal click, including when open',()=>fixture(({button,open})=>{
  for(const isOpen of [false,true]){open(isOpen);button.emit('pointerdown');button.emit('pointerup',{timeStamp:60});assert.notEqual(button.emit('click').prevented,true);}
}));
test('vertical gestures do not switch sides or accidentally activate the menu',()=>fixture(({button,root})=>{
  button.emit('pointerdown');button.emit('pointermove',{clientX:450,clientY:710,timeStamp:40});button.emit('pointerup',{timeStamp:100});
  assert.equal(root.dataset.triggerSide,'right');assert.equal(button.emit('click').prevented,true);
}));
test('canceled dragging restores the original edge and releases capture',()=>fixture(({button,root,capture})=>{
  button.emit('pointerdown');button.emit('pointermove',{clientX:40,timeStamp:50});button.emit('pointercancel');
  assert.equal(root.dataset.triggerSide,'right');assert.equal(capture.size,0);
}));
test('keyboard side switching works only when closed and enabled',()=>fixture(({button,root,open,enable})=>{
  assert.equal(button.emit('keydown',{key:'ArrowLeft'}).prevented,true);assert.equal(root.dataset.triggerSide,'left');
  open(true);button.emit('keydown',{key:'ArrowRight'});assert.equal(root.dataset.triggerSide,'left');
  open(false);enable(false);button.emit('keydown',{key:'ArrowRight'});assert.equal(root.dataset.triggerSide,'left');
  enable(true);button.emit('keydown',{key:'ArrowRight'});assert.equal(root.dataset.triggerSide,'right');
}));
test('resize or opening settles the trigger at its chosen edge and cleanup removes handlers',()=>fixture(({button,root,win,controller,styles})=>{
  button.emit('pointerdown');button.emit('pointermove',{clientX:250,timeStamp:50});win.emit('resize');
  assert.equal(root.dataset.triggerSide,'right');assert.equal(styles.size,0);
  controller.settle();assert.equal(button.getBoundingClientRect().left,426);
  controller.destroy();button.emit('keydown',{key:'ArrowLeft'});assert.equal(root.dataset.triggerSide,'right');
}));

test('a short fast flick near the starting edge commits without reaching the midpoint',()=>fixture(({button,root})=>{
  button.emit('pointerdown',{clientX:454,timeStamp:0});
  button.emit('pointermove',{clientX:434,timeStamp:8});
  button.emit('pointerup',{clientX:434,timeStamp:12});
  assert.equal(root.dataset.triggerSide,'left');
  assert.equal(button.emit('click').prevented,true);
}));

test('pointerup alone can supply the fast flick final position',()=>fixture(({button,root,capture})=>{
  button.emit('pointerdown',{clientX:454,timeStamp:0});
  button.emit('pointerup',{clientX:439,timeStamp:10});
  assert.equal(root.dataset.triggerSide,'left');
  assert.equal(capture.size,0);
  assert.equal(button.emit('click').prevented,true);
}));

test('pointerup includes travel beyond the last small move sample',()=>fixture(({button,root})=>{
  button.emit('pointerdown',{clientX:454,timeStamp:0});
  button.emit('pointermove',{clientX:451,timeStamp:4});
  button.emit('pointerup',{clientX:434,timeStamp:9});
  assert.equal(root.dataset.triggerSide,'left');
}));

test('an initially vertical path may become a qualifying inward diagonal flick',()=>fixture(({button,root})=>{
  button.emit('pointerdown',{clientX:454,clientY:655,timeStamp:0});
  button.emit('pointermove',{clientX:454,clientY:710,timeStamp:15});
  button.emit('pointermove',{clientX:434,clientY:750,timeStamp:30});
  button.emit('pointerup',{clientX:434,clientY:750,timeStamp:40});
  assert.equal(root.dataset.triggerSide,'left');
  assert.equal(button.emit('click').prevented,true);
}));

test('a very diagonal flick qualifies from its inward travel without an axis ratio gate',()=>fixture(({button,root})=>{
  button.emit('pointerdown',{clientX:454,clientY:655,timeStamp:0});
  button.emit('pointerup',{clientX:438,clientY:255,timeStamp:25});
  assert.equal(root.dataset.triggerSide,'left');
  assert.equal(button.emit('click').prevented,true);
}));

test('small jitter remains a tap and does not change handedness',()=>fixture(({button,root})=>{
  button.emit('pointerdown',{clientX:454,clientY:655});
  button.emit('pointermove',{clientX:450,clientY:658,timeStamp:20});
  button.emit('pointerup',{clientX:450,clientY:658,timeStamp:45});
  assert.equal(root.dataset.triggerSide,'right');
  assert.notEqual(button.emit('click').prevented,true);
}));

test('pausing after qualifying inward travel still commits and preserves peak intent',()=>fixture(({button,root})=>{
  button.emit('pointerdown',{clientX:454,timeStamp:0});
  button.emit('pointermove',{clientX:430,timeStamp:15});
  button.emit('pointermove',{clientX:448,timeStamp:100});
  button.emit('pointerup',{clientX:448,timeStamp:1500});
  assert.equal(root.dataset.triggerSide,'left');
  assert.equal(button.emit('click').prevented,true);
}));

test('short final-position flicks work from either edge',()=>fixture(({button,root})=>{
  button.emit('pointerdown',{clientX:454});
  button.emit('pointerup',{clientX:438,timeStamp:12});
  assert.equal(root.dataset.triggerSide,'left');
  button.emit('pointerdown',{clientX:46,timeStamp:100});
  button.emit('pointerup',{clientX:62,timeStamp:112});
  assert.equal(root.dataset.triggerSide,'right');
  assert.equal(button.emit('click').prevented,true);
}));

test('a locked open trigger detects fast pointerup travel without accidentally clicking',()=>fixture(({button,root,open,styles,capture})=>{
  let toggles=0;button.addEventListener('click',()=>toggles++);
  open(true);button.emit('pointerdown',{clientX:454,timeStamp:0});
  button.emit('pointerup',{clientX:434,clientY:670,timeStamp:10});
  assert.equal(root.dataset.triggerSide,'right');
  assert.equal(styles.size,0);
  assert.equal(capture.size,0);
  assert.equal(button.emit('click').prevented,true);
  assert.equal(toggles,0);
}));

test('genuine pointer cancellation discards a qualifying flick and suppresses its click',()=>fixture(({button,root,capture,styles})=>{
  button.emit('pointerdown',{clientX:454});
  button.emit('pointermove',{clientX:434,timeStamp:10});
  button.emit('pointercancel');
  button.emit('pointerup',{clientX:434,timeStamp:20});
  assert.equal(root.dataset.triggerSide,'right');
  assert.equal(capture.size,0);
  assert.equal(styles.size,0);
  assert.equal(button.emit('click').prevented,true);
}));

test('lost capture cancels a genuine gesture without committing its qualified side',()=>fixture(({button,root,capture})=>{
  button.emit('pointerdown',{clientX:454});
  button.emit('pointermove',{clientX:434,timeStamp:10});
  button.emit('lostpointercapture');
  assert.equal(root.dataset.triggerSide,'right');
  assert.equal(capture.size,0);
  assert.equal(button.emit('click').prevented,true);
}));

test('resizing during a qualifying flick restores the chosen resting edge',()=>fixture(({button,root,win,capture,styles})=>{
  button.emit('pointerdown',{clientX:454});
  button.emit('pointermove',{clientX:434,timeStamp:10});
  win.emit('resize');
  button.emit('pointerup',{clientX:434,timeStamp:20});
  assert.equal(root.dataset.triggerSide,'right');
  assert.equal(capture.size,0);
  assert.equal(styles.size,0);
}));

test('resize mid-drag suppresses the following pointerup click instead of opening navigation',()=>fixture(({button,root,win})=>{
  let toggles=0;button.addEventListener('click',()=>toggles++);
  button.emit('pointerdown',{clientX:454});
  button.emit('pointermove',{clientX:434,timeStamp:10});
  win.emit('resize');
  button.emit('pointerup',{clientX:434,timeStamp:20});
  assert.equal(root.dataset.triggerSide,'right');
  assert.equal(button.emit('click').prevented,true);
  assert.equal(toggles,0);
  // Suppression is one-shot; an intentional subsequent tap still works.
  button.emit('pointerdown',{clientX:454,timeStamp:100});
  button.emit('pointerup',{clientX:454,timeStamp:130});
  assert.notEqual(button.emit('click').prevented,true);
  assert.equal(toggles,1);
}));

