import test from 'node:test';
import assert from 'node:assert/strict';
import {createSlidingTrigger, flickSide, flickDock} from './trigger-slide.js';

function fixture(run, {landscape:initialLandscape=false,reduced:initialReduced=false,side='right',dock='bottom'}={}) {
  const previous = globalThis.window;
  const previousMedia = globalThis.matchMedia;
  class Target {
    listeners = new Map();
    addEventListener(name, handler, options) {
      const list=this.listeners.get(name)||[]; list.push({handler,capture:options===true}); this.listeners.set(name,list);
    }
    removeEventListener(name, handler) {this.listeners.set(name,(this.listeners.get(name)||[]).filter(x=>x.handler!==handler));}
    emit(name, properties={}) {
      const event={target:this,pointerId:1,isPrimary:true,button:0,clientX:454,clientY:655,timeStamp:0,detail:1,
        preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true},...properties};
      for(const entry of [...(this.listeners.get(name)||[])].sort((a,b)=>Number(b.capture)-Number(a.capture))){
        entry.handler(event); if(event.stopped)break;
      }
      return event;
    }
  }
  const win=new Target(),button=new Target(),root={dataset:{triggerSide:side,triggerDock:dock}};
  const landscape=new Target(),reduced=new Target();
  landscape.matches=initialLandscape;reduced.matches=initialReduced;
  const styles=new Map(),capture=new Set();
  let enabled=true,open=false;
  button.style={setProperty:(k,v)=>styles.set(k,v),removeProperty:k=>styles.delete(k)};
  const endpoints={left:18,right:426,bottom:627,middle:350.5,top:74};
  let presentation=null;
  button.getBoundingClientRect=()=>{
    if(presentation){const rect=presentation;presentation=null;return rect;}
    return {left:styles.has('--trigger-x')?parseFloat(styles.get('--trigger-x')):endpoints[root.dataset.triggerSide||'right'],top:styles.has('--trigger-y')?parseFloat(styles.get('--trigger-y')):endpoints[root.dataset.triggerDock||'bottom'],width:56,height:56};
  };
  const animations=[];
  button.animate=(frames,options)=>{const animation={frames,options,canceled:false,cancel(){this.canceled=true}};animations.push(animation);return animation};
  button.setPointerCapture=id=>capture.add(id);
  button.hasPointerCapture=id=>capture.has(id);
  button.releasePointerCapture=id=>capture.delete(id);
  globalThis.window=win;
  globalThis.matchMedia=query=>query.includes('orientation')?landscape:reduced;
  const controller=createSlidingTrigger(root,button,{isEnabled:()=>enabled,isOpen:()=>open});
  const context={root,button,win,styles,capture,controller,endpoints,landscape,reduced,animations,
    presentNextRect:rect=>{presentation={width:56,height:56,...rect}},
    enable:value=>{enabled=value},open:value=>{open=value},
    drag(from,to,start=0,end=120){button.emit('pointerdown',{clientX:from,timeStamp:start});button.emit('pointermove',{clientX:to,timeStamp:end-10});button.emit('pointerup',{clientX:to,timeStamp:end})}};
  try{run(context)}finally{
    controller.destroy();if(previous===undefined)delete globalThis.window;else globalThis.window=previous;
    if(previousMedia===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=previousMedia;
  }
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
  assert.equal(styles.has('--trigger-x'),false);assert.equal(styles.has('--trigger-y'),false);
  assert.equal(capture.size,0);
  assert.equal(button.emit('click').prevented,true);assert.equal(opened,0);
}));
test('sliding back to the right retains one trigger and clears the drag offset',()=>fixture(({button,root,styles,drag})=>{
  drag(454,40);assert.equal(root.dataset.triggerSide,'left');
  drag(46,460,200,350);assert.equal(root.dataset.triggerSide,'right');
  assert.equal(styles.size,0);assert.equal(root.dataset.triggerDragging,undefined);
}));
test('open gestures are delegated without helper capture, movement or cancellation',()=>fixture(({button,root,styles,open,capture})=>{
  open(true);button.emit('pointerdown');
  assert.equal(capture.size,0,'the shared menu scroll band owns open gestures');
  assert.notEqual(button.emit('pointermove',{clientX:40,clientY:350,timeStamp:50}).prevented,true);
  button.emit('pointerup',{clientX:40,clientY:350,timeStamp:60});
  assert.equal(root.dataset.triggerSide,'right');assert.equal(root.dataset.triggerDock,'bottom');
  assert.equal(styles.size,0);assert.equal(root.dataset.triggerDragging,undefined);
  assert.notEqual(button.emit('click').prevented,true,'click suppression belongs to the open-menu controller');
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

test('an initially vertical path locks vertical movement despite a later inward curve',()=>fixture(({button,root})=>{
  button.emit('pointerdown',{clientX:454,clientY:655});
  button.emit('pointermove',{clientX:454,clientY:710,timeStamp:15});
  button.emit('pointermove',{clientX:434,clientY:750,timeStamp:30});
  assert.equal(button.getBoundingClientRect().left,426);
  button.emit('pointerup',{clientX:434,clientY:750,timeStamp:40});
  assert.equal(root.dataset.triggerSide,'right');assert.equal(root.dataset.triggerDock,'bottom');
  assert.equal(button.emit('click').prevented,true);
}));

test('a strongly vertical final sample changes only its vertical dock',()=>fixture(({button,root})=>{
  button.emit('pointerdown',{clientX:454,clientY:655});
  button.emit('pointerup',{clientX:438,clientY:255,timeStamp:25});
  assert.equal(root.dataset.triggerSide,'right');assert.equal(root.dataset.triggerDock,'middle');
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

test('fast pointerup while open is also left to the shared scroll controller',()=>fixture(({button,root,open,styles,capture})=>{
  let releases=0;button.addEventListener('pointerup',()=>releases++);
  open(true);button.emit('pointerdown',{clientX:454,timeStamp:0});
  button.emit('pointerup',{clientX:434,clientY:670,timeStamp:10});
  assert.equal(root.dataset.triggerSide,'right');assert.equal(root.dataset.triggerDock,'bottom');
  assert.equal(styles.size,0);assert.equal(capture.size,0);assert.equal(releases,1);
  assert.notEqual(button.emit('click').prevented,true);
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

test('vertical docking has a deliberate 24px toward-dock threshold',()=>{
  assert.equal(flickDock('bottom',23.99),'bottom');
  assert.equal(flickDock('bottom',24),'middle');
  assert.equal(flickDock('middle',24),'top');
  assert.equal(flickDock('middle',0,24),'bottom');
  assert.equal(flickDock('top',0,24),'middle');
  assert.equal(flickDock('middle',-40),'middle');
});

test('upward flick docks at the middle and downward flick returns to the bottom',()=>fixture(({button,root,styles})=>{
  button.emit('pointerdown',{clientX:454,clientY:655});
  button.emit('pointerup',{clientX:454,clientY:625,timeStamp:12});
  assert.equal(root.dataset.triggerSide,'right');assert.equal(root.dataset.triggerDock,'middle');
  assert.equal(button.getBoundingClientRect().top,350.5);
  button.emit('pointerdown',{clientX:454,clientY:378,timeStamp:100});
  button.emit('pointerup',{clientX:454,clientY:408,timeStamp:112});
  assert.equal(root.dataset.triggerSide,'right');assert.equal(root.dataset.triggerDock,'bottom');
  assert.equal(button.getBoundingClientRect().top,627);assert.equal(styles.size,0);
}));

test('vertical travel away from the other dock never changes level',()=>fixture(({button,root})=>{
  button.emit('pointerdown',{clientY:655});button.emit('pointerup',{clientY:700,timeStamp:10});
  assert.equal(root.dataset.triggerDock,'bottom');
  root.dataset.triggerDock='top';
  button.emit('pointerdown',{clientY:102,timeStamp:100});button.emit('pointerup',{clientY:30,timeStamp:110});
  assert.equal(root.dataset.triggerDock,'top');assert.equal(root.dataset.triggerSide,'right');
}));

test('a short vertical gesture below threshold suppresses a drag click but retains the dock',()=>fixture(({button,root})=>{
  button.emit('pointerdown',{clientY:655});button.emit('pointerup',{clientY:632,timeStamp:10});
  assert.equal(root.dataset.triggerDock,'bottom');assert.equal(root.dataset.triggerSide,'right');
  assert.equal(button.emit('click').prevented,true);
}));

test('diagonal flicks choose the dominant axis without changing both edge and dock',()=>fixture(({button,root})=>{
  button.emit('pointerdown',{clientX:454,clientY:655});
  button.emit('pointerup',{clientX:434,clientY:625,timeStamp:10});
  assert.equal(root.dataset.triggerSide,'right');assert.equal(root.dataset.triggerDock,'middle');
  button.emit('pointerdown',{clientX:454,clientY:378.5,timeStamp:100});
  button.emit('pointerup',{clientX:434,clientY:408.5,timeStamp:110});
  assert.equal(root.dataset.triggerSide,'right');assert.equal(root.dataset.triggerDock,'bottom');
}));

test('horizontal locking follows only x and clamps against its fixed side columns',()=>fixture(({button,root})=>{
  button.emit('pointerdown',{clientX:454,clientY:655});
  button.emit('pointermove',{clientX:80,clientY:400,timeStamp:20});
  assert.equal(button.getBoundingClientRect().left,52);assert.equal(button.getBoundingClientRect().top,627);
  button.emit('pointermove',{clientX:-200,clientY:-200,timeStamp:30});
  assert.equal(button.getBoundingClientRect().left,18);assert.equal(button.getBoundingClientRect().top,627);
  button.emit('pointerup',{clientX:-200,clientY:-200,timeStamp:40});
  assert.equal(root.dataset.triggerSide,'left');assert.equal(root.dataset.triggerDock,'bottom');
}));

test('vertical locking retains qualified vertical intent through a horizontal curve and pause',()=>fixture(({button,root})=>{
  button.emit('pointerdown',{clientX:454,clientY:655});
  button.emit('pointermove',{clientX:454,clientY:620,timeStamp:10});
  button.emit('pointermove',{clientX:434,clientY:650,timeStamp:80});
  button.emit('pointerup',{clientX:450,clientY:650,timeStamp:1500});
  assert.equal(root.dataset.triggerSide,'right');assert.equal(root.dataset.triggerDock,'middle');
}));

test('cancellation restores both original edge and original middle dock',()=>fixture(({button,root,capture,styles})=>{
  root.dataset.triggerSide='left';root.dataset.triggerDock='middle';
  button.emit('pointerdown',{clientX:46,clientY:378});
  button.emit('pointermove',{clientX:100,clientY:450,timeStamp:10});
  button.emit('pointercancel');
  assert.equal(root.dataset.triggerSide,'left');assert.equal(root.dataset.triggerDock,'middle');
  assert.equal(capture.size,0);assert.equal(styles.size,0);assert.equal(button.emit('click').prevented,true);
}));

test('resize remeasures resting endpoints while retaining the chosen middle/left dock',()=>fixture(({button,root,endpoints,win,styles})=>{
  root.dataset.triggerSide='left';root.dataset.triggerDock='middle';
  button.emit('pointerdown',{clientX:46,clientY:378});
  button.emit('pointermove',{clientX:100,clientY:420,timeStamp:10});
  endpoints.left=24;endpoints.right=500;endpoints.middle=420;endpoints.bottom=730;
  win.emit('resize');
  assert.equal(root.dataset.triggerSide,'left');assert.equal(root.dataset.triggerDock,'middle');
  assert.equal(button.getBoundingClientRect().left,24);assert.equal(button.getBoundingClientRect().top,420);
  assert.equal(styles.size,0);
  button.emit('pointerdown',{clientX:52,clientY:448,timeStamp:100});
  button.emit('pointermove',{clientX:800,clientY:900,timeStamp:110});
  assert.equal(button.getBoundingClientRect().left,500);assert.equal(button.getBoundingClientRect().top,420);
}));

test('keyboard docking changes level independently from edge and delegates while open',()=>fixture(({button,root,open,enable})=>{
  button.emit('keydown',{key:'ArrowLeft'});button.emit('keydown',{key:'ArrowUp'});
  assert.equal(root.dataset.triggerSide,'left');assert.equal(root.dataset.triggerDock,'middle');
  button.emit('keydown',{key:'ArrowRight'});
  assert.equal(root.dataset.triggerSide,'right');assert.equal(root.dataset.triggerDock,'middle');
  button.emit('keydown',{key:'ArrowDown'});
  assert.equal(root.dataset.triggerSide,'right');assert.equal(root.dataset.triggerDock,'bottom');
  open(true);
  for(const key of ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'])assert.notEqual(button.emit('keydown',{key}).prevented,true);
  assert.equal(root.dataset.triggerSide,'right');assert.equal(root.dataset.triggerDock,'bottom');
  open(false);enable(false);button.emit('keydown',{key:'ArrowUp'});
  assert.equal(root.dataset.triggerDock,'bottom');
}));

test('vertical docking advances one level per flick and stops at outer boundaries',()=>{
  assert.equal(flickDock('bottom',1000,0),'middle','a large upward flick cannot skip the middle');
  assert.equal(flickDock('middle',24,0),'top');
  assert.equal(flickDock('top',1000,0),'top');
  assert.equal(flickDock('top',0,1000),'middle','a large downward flick cannot skip the middle');
  assert.equal(flickDock('middle',0,24),'bottom');
  assert.equal(flickDock('bottom',0,1000),'bottom');
  assert.equal(flickDock('top',0,23.99),'top');
  assert.equal(flickDock('middle',23.99,23.99),'middle');
});

test('middle chooses the greater qualified peak with upward travel winning ties',()=>{
  assert.equal(flickDock('middle',35,30),'top');
  assert.equal(flickDock('middle',30,35),'bottom');
  assert.equal(flickDock('middle',24,24),'top');
  assert.equal(flickDock('middle',23.99,30),'bottom');
  assert.equal(flickDock('middle',30,23.99),'top');
  assert.equal(flickDock('bottom',24,1000),'middle','away travel cannot undo qualified upward intent');
  assert.equal(flickDock('top',1000,24),'middle','away travel cannot undo qualified downward intent');
});

test('keyboard can reach all six measured resting docks without coupling side and level',()=>fixture(({button,root,endpoints})=>{
  const seen=new Set();
  for(const side of ['left','right']){
    button.emit('keydown',{key:side==='left'?'ArrowLeft':'ArrowRight'});
    button.emit('keydown',{key:'ArrowDown'});button.emit('keydown',{key:'ArrowDown'});
    for(const dock of ['bottom','middle','top']){
      if(dock!=='bottom')button.emit('keydown',{key:'ArrowUp'});
      assert.equal(root.dataset.triggerSide,side);assert.equal(root.dataset.triggerDock,dock);
      assert.equal(button.getBoundingClientRect().left,endpoints[side]);
      assert.equal(button.getBoundingClientRect().top,endpoints[dock]);
      seen.add(`${side}/${dock}`);
    }
  }
  assert.equal(seen.size,6);
  button.emit('keydown',{key:'ArrowUp'});assert.equal(root.dataset.triggerDock,'top');
  button.emit('keydown',{key:'ArrowDown'});assert.equal(root.dataset.triggerDock,'middle');
  button.emit('keydown',{key:'ArrowDown'});assert.equal(root.dataset.triggerDock,'bottom');
  button.emit('keydown',{key:'ArrowDown'});assert.equal(root.dataset.triggerDock,'bottom');
}));

test('pointerup-only flick steps from middle to top then back through middle to bottom',()=>fixture(({button,root})=>{
  root.dataset.triggerDock='middle';
  button.emit('pointerdown',{clientY:378.5});button.emit('pointerup',{clientY:354.5,timeStamp:10});
  assert.equal(root.dataset.triggerDock,'top');assert.equal(button.getBoundingClientRect().top,74);
  button.emit('pointerdown',{clientY:102,timeStamp:100});button.emit('pointerup',{clientY:126,timeStamp:110});
  assert.equal(root.dataset.triggerDock,'middle');
  button.emit('pointerdown',{clientY:378.5,timeStamp:200});button.emit('pointerup',{clientY:402.5,timeStamp:210});
  assert.equal(root.dataset.triggerDock,'bottom');assert.equal(root.dataset.triggerSide,'right');
}));

test('top clamp limits direct dragging but a long upward flick still advances only one dock',()=>fixture(({button,root})=>{
  button.emit('pointerdown',{clientY:655});button.emit('pointermove',{clientY:-400,timeStamp:10});
  assert.equal(button.getBoundingClientRect().top,74);
  button.emit('pointerup',{clientY:-400,timeStamp:20});
  assert.equal(root.dataset.triggerDock,'middle');
  button.emit('pointerdown',{clientY:378.5,timeStamp:100});button.emit('pointerup',{clientY:0,timeStamp:110});
  assert.equal(root.dataset.triggerDock,'top');
  button.emit('pointerdown',{clientY:102,timeStamp:200});button.emit('pointerup',{clientY:-100,timeStamp:210});
  assert.equal(root.dataset.triggerDock,'top');assert.equal(button.getBoundingClientRect().top,74);
}));

test('horizontal mirroring at top retains its level and supports both edges',()=>fixture(({button,root})=>{
  root.dataset.triggerDock='top';
  button.emit('pointerdown',{clientX:454,clientY:102});
  button.emit('pointerup',{clientX:438,clientY:102,timeStamp:10});
  assert.equal(root.dataset.triggerSide,'left');assert.equal(root.dataset.triggerDock,'top');
  button.emit('pointerdown',{clientX:46,clientY:102,timeStamp:100});
  button.emit('pointerup',{clientX:62,clientY:102,timeStamp:110});
  assert.equal(root.dataset.triggerSide,'right');assert.equal(root.dataset.triggerDock,'top');
}));

test('middle curved gesture latches both peaks and honors the larger downward excursion',()=>fixture(({button,root})=>{
  root.dataset.triggerDock='middle';
  button.emit('pointerdown',{clientY:378.5});
  button.emit('pointermove',{clientY:348.5,timeStamp:10});
  button.emit('pointermove',{clientY:418.5,timeStamp:20});
  button.emit('pointerup',{clientY:378.5,timeStamp:1000});
  assert.equal(root.dataset.triggerDock,'bottom');
}));

test('canceling a diagonal departure from the top restores both original coordinates',()=>fixture(({button,root,capture,styles})=>{
  root.dataset.triggerSide='left';root.dataset.triggerDock='top';
  button.emit('pointerdown',{clientX:46,clientY:102});
  button.emit('pointermove',{clientX:90,clientY:150,timeStamp:10});
  button.emit('pointercancel');
  assert.equal(root.dataset.triggerSide,'left');assert.equal(root.dataset.triggerDock,'top');
  assert.equal(button.getBoundingClientRect().left,18);assert.equal(button.getBoundingClientRect().top,74);
  assert.equal(capture.size,0);assert.equal(styles.size,0);assert.equal(button.emit('click').prevented,true);
}));

test('resizing a top-dock gesture remeasures the top safe-area position without changing its dock',()=>fixture(({button,root,endpoints,win,capture,styles})=>{
  root.dataset.triggerDock='top';
  button.emit('pointerdown',{clientY:102});button.emit('pointermove',{clientY:150,timeStamp:10});
  endpoints.top=90;endpoints.middle=420;endpoints.bottom=750;endpoints.right=500;
  win.emit('resize');
  assert.equal(root.dataset.triggerDock,'top');assert.equal(root.dataset.triggerSide,'right');
  assert.equal(button.getBoundingClientRect().left,500);assert.equal(button.getBoundingClientRect().top,90);
  assert.equal(capture.size,0);assert.equal(styles.size,0);assert.equal(button.emit('click').prevented,true);
}));

test('foreign pointer events cannot cancel or overwrite the primary docking gesture',()=>fixture(({button,root,capture})=>{
  button.emit('pointerdown',{pointerId:1,clientY:655});
  button.emit('pointermove',{pointerId:1,clientY:625,timeStamp:10});
  button.emit('pointerdown',{pointerId:2,isPrimary:false,clientY:655,timeStamp:12});
  button.emit('pointercancel',{pointerId:2,timeStamp:14});
  assert.equal(capture.has(1),true);
  button.emit('pointerup',{pointerId:1,clientY:625,timeStamp:20});
  assert.equal(root.dataset.triggerDock,'middle');assert.equal(capture.size,0);
}));

test('nested dot implicit-capture loss cannot cancel an active middle or top gesture',()=>fixture(({button,root,capture})=>{
  const innerDot={className:'dot'};
  for(const [startDock,startY,endY,expectedDock] of [
    ['middle',378.5,348.5,'top'],['top',102,132,'middle']
  ]){
    root.dataset.triggerDock=startDock;root.dataset.triggerSide='right';
    button.emit('pointerdown',{target:innerDot,clientY:startY});
    assert.equal(capture.has(1),true);
    button.emit('lostpointercapture',{target:innerDot});
    assert.equal(capture.has(1),true,'child capture transfer must not release the button capture');
    button.emit('pointerup',{clientY:endY,timeStamp:20});
    assert.equal(root.dataset.triggerDock,expectedDock);
    assert.equal(capture.size,0);assert.equal(button.emit('click').prevented,true);
  }
}));

test('vertical locking previews only y and later x travel cannot switch sides',()=>fixture(({button,root})=>{
  button.emit('pointerdown',{clientX:454,clientY:655});
  button.emit('pointermove',{clientX:452,clientY:648,timeStamp:10});
  assert.equal(button.getBoundingClientRect().left,426);assert.equal(button.getBoundingClientRect().top,620);
  button.emit('pointermove',{clientX:100,clientY:615,timeStamp:20});
  assert.equal(button.getBoundingClientRect().left,426);assert.equal(button.getBoundingClientRect().top,587);
  button.emit('pointerup',{clientX:100,clientY:615,timeStamp:30});
  assert.equal(root.dataset.triggerSide,'right');assert.equal(root.dataset.triggerDock,'middle');
}));

test('horizontal locking survives a later strongly vertical curve',()=>fixture(({button,root})=>{
  button.emit('pointerdown',{clientX:454,clientY:655});
  button.emit('pointermove',{clientX:447,clientY:654,timeStamp:10});
  button.emit('pointermove',{clientX:434,clientY:200,timeStamp:20});
  assert.equal(button.getBoundingClientRect().top,627);
  button.emit('pointerup',{clientX:434,clientY:200,timeStamp:30});
  assert.equal(root.dataset.triggerSide,'left');assert.equal(root.dataset.triggerDock,'bottom');
}));

test('fast pointerup dominance selects exactly one axis and ties choose horizontal',()=>{
  for(const [dx,dy,side,dock] of [[-16,-10,'left','bottom'],[-12,-30,'right','middle'],[-24,-24,'left','bottom']]){
    fixture(({button,root})=>{
      button.emit('pointerdown',{clientX:454,clientY:655});
      button.emit('pointerup',{clientX:454+dx,clientY:655+dy,timeStamp:10});
      assert.equal(root.dataset.triggerSide,side);assert.equal(root.dataset.triggerDock,dock);
    });
  }
});

test('landscape initialization uses bottom only while preserving the chosen left edge',()=>fixture(({root,button})=>{
  assert.equal(root.dataset.triggerDock,'bottom');assert.equal(root.dataset.triggerSide,'left');
  assert.equal(button.getBoundingClientRect().left,18);assert.equal(button.getBoundingClientRect().top,627);
},{landscape:true,side:'left',dock:'top'}));

test('closed landscape vertical gestures cannot preview or release to a higher dock',()=>fixture(({button,root})=>{
  button.emit('pointerdown',{clientX:454,clientY:655});
  button.emit('pointermove',{clientX:450,clientY:500,timeStamp:10});
  assert.equal(button.getBoundingClientRect().left,426);assert.equal(button.getBoundingClientRect().top,627);
  button.emit('pointerup',{clientX:450,clientY:400,timeStamp:20});
  assert.equal(root.dataset.triggerDock,'bottom');assert.equal(root.dataset.triggerSide,'right');
  assert.equal(button.emit('click').prevented,true);
},{landscape:true}));

test('landscape retains horizontal flicking and ignores diagonal cross-axis vertical travel',()=>fixture(({button,root})=>{
  button.emit('pointerdown',{clientX:454,clientY:655});
  button.emit('pointerup',{clientX:424,clientY:635,timeStamp:10});
  assert.equal(root.dataset.triggerSide,'left');assert.equal(root.dataset.triggerDock,'bottom');
  button.emit('pointerdown',{clientX:46,clientY:655,timeStamp:100});
  button.emit('pointerup',{clientX:76,clientY:635,timeStamp:110});
  assert.equal(root.dataset.triggerSide,'right');assert.equal(root.dataset.triggerDock,'bottom');
},{landscape:true}));

test('landscape keyboard disables closed vertical docking and retains horizontal navigation',()=>fixture(({button,root,open})=>{
  for(const key of ['ArrowUp','ArrowDown'])button.emit('keydown',{key});
  assert.equal(root.dataset.triggerDock,'bottom');
  button.emit('keydown',{key:'ArrowLeft'});assert.equal(root.dataset.triggerSide,'left');
  button.emit('keydown',{key:'ArrowRight'});assert.equal(root.dataset.triggerSide,'right');
  open(true);
  for(const key of ['ArrowUp','ArrowDown'])assert.notEqual(button.emit('keydown',{key}).prevented,true,'open-menu scrolling still owns these keys');
},{landscape:true}));

test('rotating from top portrait to landscape returns to bottom and stays there on portrait restoration',()=>fixture(({root,landscape,button})=>{
  root.dataset.triggerDock='top';root.dataset.triggerSide='left';
  landscape.matches=true;landscape.emit('change');
  assert.equal(root.dataset.triggerDock,'bottom');assert.equal(root.dataset.triggerSide,'left');
  landscape.matches=false;landscape.emit('change');
  assert.equal(root.dataset.triggerDock,'bottom');assert.equal(root.dataset.triggerSide,'left');
  button.emit('keydown',{key:'ArrowUp'});assert.equal(root.dataset.triggerDock,'middle','portrait docking is available again');
}));

test('rotation during a drag releases capture, resets its dock, and suppresses its trailing click',()=>fixture(({button,root,landscape,capture,styles})=>{
  root.dataset.triggerDock='top';
  button.emit('pointerdown',{clientX:454,clientY:102});
  button.emit('pointermove',{clientX:430,clientY:104,timeStamp:10});
  landscape.matches=true;landscape.emit('change');
  button.emit('pointerup',{clientX:430,clientY:104,timeStamp:20});
  assert.equal(root.dataset.triggerSide,'right');assert.equal(root.dataset.triggerDock,'bottom');
  assert.equal(capture.size,0);assert.equal(styles.size,0);assert.equal(button.emit('click').prevented,true);
}));

test('rotation or resize cancels even a stationary pointer and suppresses the later click',()=>{
  for(const rotate of [false,true])fixture(({button,root,landscape,win,capture})=>{
    button.emit('pointerdown');
    if(rotate){landscape.matches=true;landscape.emit('change');}else win.emit('resize');
    assert.equal(capture.size,0);
    button.emit('pointerup');assert.equal(button.emit('click').prevented,true);
    assert.equal(root.dataset.triggerDock,'bottom');
    button.emit('pointerdown');button.emit('pointerup');assert.notEqual(button.emit('click').prevented,true,'the next intentional tap still works');
  });
});

test('rotation while open normalizes its dock without capturing or changing handedness',()=>fixture(({button,root,open,landscape,capture})=>{
  root.dataset.triggerSide='left';root.dataset.triggerDock='top';open(true);
  button.emit('pointerdown',{clientX:46,clientY:102});
  landscape.matches=true;landscape.emit('change');
  assert.equal(root.dataset.triggerSide,'left');assert.equal(root.dataset.triggerDock,'bottom');assert.equal(capture.size,0);
  button.emit('pointerup',{clientX:46,clientY:200});assert.notEqual(button.emit('click').prevented,true);
}));

test('orientation normalization also occurs on resize when disabled and cleanup removes media listeners',()=>fixture(({root,landscape,win,enable,controller})=>{
  root.dataset.triggerDock='top';enable(false);landscape.matches=true;win.emit('resize');
  assert.equal(root.dataset.triggerDock,'bottom');
  controller.destroy();root.dataset.triggerDock='top';landscape.emit('change');
  assert.equal(root.dataset.triggerDock,'top','destroyed controller no longer receives orientation changes');
}));

test('interrupted off-axis glide settles in two cardinal segments with one coordinate changing at a time',()=>{
  for(const key of ['ArrowLeft','ArrowUp'])fixture(({button,presentNextRect,animations})=>{
    presentNextRect({left:300,top:400});button.emit('keydown',{key});
    assert.equal(animations.length,1);
    const frames=animations[0].frames;
    assert.equal(frames.length,3);
    const coordinates=frames.map(frame=>frame.transform.match(/translate3d\(([-\d.]+)px,([-\d.]+)px,0\)/).slice(1).map(Number));
    assert.deepEqual(coordinates[0],[300,400]);
    assert.deepEqual(coordinates[2],key==='ArrowLeft'?[18,627]:[426,350.5]);
    for(let index=1;index<coordinates.length;index++){
      const before=coordinates[index-1],after=coordinates[index];
      assert.equal(Number(before[0]!==after[0])+Number(before[1]!==after[1]),1,'each animation segment is cardinal');
    }
    assert.deepEqual(coordinates[1],key==='ArrowLeft'?[18,400]:[300,350.5]);
  });
});

test('ordinary single-axis glides use no two-segment animation and reduced motion skips the fallback',()=>{
  fixture(({button,animations})=>{button.emit('keydown',{key:'ArrowLeft'});button.emit('keydown',{key:'ArrowUp'});assert.equal(animations.length,0);});
  fixture(({button,presentNextRect,animations})=>{
    presentNextRect({left:300,top:400});button.emit('keydown',{key:'ArrowLeft'});
    assert.equal(animations.length,0);assert.equal(button.getBoundingClientRect().left,18);assert.equal(button.getBoundingClientRect().top,627);
  },{reduced:true});
});

test('new input and resizing cancel an outstanding cardinal settling animation',()=>{
  for(const viaResize of [false,true])fixture(({button,win,presentNextRect,animations})=>{
    presentNextRect({left:300,top:400});button.emit('keydown',{key:'ArrowLeft'});
    const animation=animations[0];assert.equal(animation.canceled,false);
    if(viaResize)win.emit('resize');else button.emit('pointerdown',{clientX:46});
    assert.equal(animation.canceled,true);
  });
});

test('switching to reduced motion cancels active settling and stale finish cannot affect a later glide',()=>fixture(({button,root,reduced,presentNextRect,animations,controller,styles})=>{
  presentNextRect({left:300,top:400});button.emit('keydown',{key:'ArrowLeft'});
  const oldAnimation=animations[0];assert.equal(oldAnimation.canceled,false);
  reduced.matches=true;reduced.emit('change');
  assert.equal(oldAnimation.canceled,true);assert.equal(styles.size,0);
  assert.equal(root.dataset.triggerSide,'left');assert.equal(root.dataset.triggerDock,'bottom');
  assert.equal(button.getBoundingClientRect().left,18);assert.equal(button.getBoundingClientRect().top,627);
  reduced.matches=false;reduced.emit('change');
  presentNextRect({left:200,top:400});button.emit('keydown',{key:'ArrowRight'});
  const newAnimation=animations[1];assert.equal(newAnimation.canceled,false);
  oldAnimation.onfinish?.();
  controller.settle();
  assert.equal(newAnimation.canceled,true,'stale completion must not discard ownership of the active glide');
  assert.equal(button.getBoundingClientRect().left,426);assert.equal(button.getBoundingClientRect().top,627);
}));

test('destroy removes reduced-motion preference handling as well as orientation handling',()=>fixture(({controller,reduced,styles})=>{
  controller.destroy();styles.set('--trigger-x','123px');
  reduced.matches=true;reduced.emit('change');
  assert.equal(styles.get('--trigger-x'),'123px','a destroyed helper must not mutate later styles');
}));


