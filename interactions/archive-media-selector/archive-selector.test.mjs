import test from 'node:test';
import assert from 'node:assert/strict';
import {createArchiveSelector} from './archive-selector.js';

class Element {
  constructor(tag='div',attributes={}) {
    this.tagName=tag;this.attributes=new Map();this.children=[];this.parentElement=null;
    this.listeners=new Map();this.writes=new Map();this.classes=new Set();
    this.classList={add:(...names)=>names.forEach(name=>this.classes.add(name)),remove:(...names)=>names.forEach(name=>this.classes.delete(name)),contains:name=>this.classes.has(name),toggle:(name,value)=>{const next=value??!this.classes.has(name);if(next)this.classes.add(name);else this.classes.delete(name);return next;}};
    for(const [name,value]of Object.entries(attributes)){if(name==='class')String(value).split(/\s+/).forEach(v=>this.classes.add(v));else this.setAttribute(name,value);}
  }
  setAttribute(name,value){this.attributes.set(name,String(value));this.writes.set(name,(this.writes.get(name)||0)+1);}
  getAttribute(name){return this.attributes.has(name)?this.attributes.get(name):null;}
  removeAttribute(name){this.attributes.delete(name);}
  append(...children){for(const child of children){child.parentElement=this;this.children.push(child);}return this;}
  contains(node){for(let at=node;at;at=at.parentElement)if(at===this)return true;return false;}
  matches(selector){
    if(selector.startsWith('['))return this.attributes.has(selector.slice(1,-1));
    if(selector.startsWith('.'))return this.classes.has(selector.slice(1));
    const [tag,className]=selector.split('.');return this.tagName===tag&&(!className||this.classes.has(className));
  }
  querySelectorAll(selector){const choices=selector.split(',');const results=[];const visit=node=>{for(const child of node.children){if(choices.some(choice=>child.matches(choice.trim())))results.push(child);visit(child);}};visit(this);return results;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  closest(selector){for(let at=this;at;at=at.parentElement)if(at.matches(selector))return at;return null;}
  addEventListener(type,handler){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(handler);}
  removeEventListener(type,handler){this.listeners.get(type)?.delete(handler);}
}
const node=(tag,attrs)=>new Element(tag,attrs);
function emit(target,type,extra={}){
  const event={type,target,prevented:false,preventDefault(){this.prevented=true;},...extra};
  for(let at=target;at;at=at.parentElement)for(const handler of [...(at.listeners.get(type)||[])])handler(event);
  return event;
}
const visible=element=>element.classList.contains('is-visible');
const active=element=>element.classList.contains('is-active');
const flush=async()=>{await Promise.resolve();await Promise.resolve();};

async function fixture(run,{owned=true}={}){
  const savedSet=globalThis.setTimeout,savedClear=globalThis.clearTimeout;
  let time=0,sequence=0;const timers=new Map();
  globalThis.setTimeout=(fn,delay)=>{timers.set(++sequence,{fn,at:time+delay});return sequence;};
  globalThis.clearTimeout=id=>timers.delete(id);
  const root=node('section',{class:owned?'':'archive-media-selector'}),ticker=node('div',{class:owned?'ticker':'ticker is-ready'});
  const resetControl=node('button');const shifts=[];
  const defaultBackground=node('div',{'data-default-background':''});
  const defaultPicture=node('picture',{class:'lazy'}),defaultImage=node('img',{'data-src':'poster-default.jpg'});
  defaultPicture.append(defaultImage);defaultBackground.append(defaultPicture);
  root.append(ticker,defaultBackground);
  function background(id,{video=false}={}){
    const element=node('div',{'data-ticker-background':'','data-id':id});
    const picture=node('picture',{class:'lazy'}),image=node('img',{'data-src':`poster-${id}.jpg`}),source=node('source',{'data-srcset':`wide-${id}.jpg 1200w`});
    picture.append(source,image);element.append(picture);root.append(element);
    if(video){
      const media=node('video'),mediaSource=node('source',{'data-src':`clip-${id}.mp4`});media.append(mediaSource);element.append(media);
      Object.assign(media,{readyState:0,loadCount:0,playCount:0,pauseCount:0,paused:true,
        load(){this.loadCount++;},play(){this.playCount++;this.paused=false;return this.playResult?this.playResult():Promise.resolve();},pause(){this.pauseCount++;this.paused=true;}});
      return {element,picture,image,source,video:media,videoSource:mediaSource};
    }
    return {element,picture,image,source};
  }
  function caption(id){
    const element=node('div',{'data-ticker-caption':'','data-id':id,'data-type':'ticker_archive_item'}),thumbs=node('div'),zoom=node('div',{'data-zoom':''});
    const thumbImages=[0,1].map(i=>node('img',{'data-src':`thumb-${id}-${i}.jpg`}));
    const thumbNodes=thumbImages.map(image=>node('div',{'data-thumb':''}).append(image));
    const zoomImages=[0,1].map(i=>node('img',{'data-src':`zoom-${id}-${i}.jpg`}));
    thumbs.append(...thumbNodes);zoom.append(...zoomImages);element.append(thumbs,zoom);root.append(element);
    return {element,thumbNodes,thumbImages,zoom,zoomImages};
  }
  const capA=caption('a'),capD=caption('d');
  const bgA=background('a'),bgB=background('b'),bgC=background('c'),bgVideo=background('video',{video:true});
  const items={};for(const id of ['a','b','c','d','video']){const item=node('div',{'data-ticker-item':'','data-id':id});item.append(node('img'));ticker.append(item);items[id]=item;}
  const controller=createArchiveSelector(root,{resetControl,onShift:value=>shifts.push(value)});
  const env={root,ticker,resetControl,defaultBackground,defaultPicture,defaultImage,capA,capD,bgA,bgB,bgC,bgVideo,items,controller,shifts,timers,
    advance(amount){time+=amount;for(const [id,timer]of [...timers])if(timer.at<=time){timers.delete(id);timer.fn();}}};
  try{await run(env);}finally{controller.destroy();globalThis.setTimeout=savedSet;globalThis.clearTimeout=savedClear;}
}

test('mount prepares static carrier and default background without selecting an archive',()=>fixture(env=>{
  assert(env.root.classList.contains('archive-media-selector'));assert(env.ticker.classList.contains('is-ready'));
  assert(active(env.defaultBackground));assert(!active(env.bgA.element));assert(!visible(env.capA.element));
  assert.equal(env.defaultImage.getAttribute('src'),'poster-default.jpg');assert.equal(env.defaultImage.getAttribute('data-src'),null);
  assert(env.defaultPicture.classList.contains('lazy-loaded'));assert.equal(env.shifts.length,0);
}));

test('delegated nested item click selects matching caption/background, hydrates media once and shifts ticker',()=>fixture(env=>{
  const click=emit(env.items.a.children[0],'click');assert(click.prevented);
  assert(visible(env.capA.element));assert(active(env.bgA.element));assert(!active(env.defaultBackground));
  assert(env.ticker.classList.contains('shift-up'));assert.deepEqual(env.shifts,[true]);
  assert.equal(env.bgA.source.getAttribute('srcset'),'wide-a.jpg 1200w');assert.equal(env.bgA.image.getAttribute('src'),'poster-a.jpg');
  assert.equal(env.capA.thumbImages[1].getAttribute('src'),'thumb-a-1.jpg');assert.equal(env.capA.zoomImages[1].getAttribute('src'),'zoom-a-1.jpg');
  env.controller.select('b');env.controller.select('a');
  assert.equal(env.bgA.image.writes.get('src'),1);assert.equal(env.capA.thumbImages[0].writes.get('src'),1);assert.equal(env.capA.zoomImages[0].writes.get('src'),1);
}));

test('hover and touch preload thumbnails only, without changing selection or fetching zoom/background',()=>fixture(env=>{
  emit(env.items.a,'mouseover');emit(env.items.a.children[0],'mouseover',{relatedTarget:env.items.a});emit(env.items.a,'touchstart');
  assert.equal(env.capA.thumbImages[0].getAttribute('src'),'thumb-a-0.jpg');assert.equal(env.capA.thumbImages[0].writes.get('src'),1);
  assert.equal(env.capA.zoomImages[0].getAttribute('src'),null);assert.equal(env.bgA.image.getAttribute('src'),null);
  assert(!visible(env.capA.element));assert(active(env.defaultBackground));assert.equal(env.shifts.length,0);
}));

test('successive background-only IDs work when captions are missing, and caption-only item retains default',()=>fixture(env=>{
  env.controller.select('a');assert(env.controller.select('b'));assert(!visible(env.capA.element));assert(active(env.bgB.element));
  assert(!env.ticker.classList.contains('shift-up'));assert(env.controller.select('c'));assert(!active(env.bgB.element));assert(active(env.bgC.element));
  assert(env.controller.select('d'));assert(!active(env.bgC.element));assert(active(env.defaultBackground));assert(visible(env.capD.element));
  assert.equal(env.controller.select('does-not-exist'),false);assert(visible(env.capD.element));
}));

test('thumbnail sibling selects corresponding zoom; image closes immediately and overlay closes after200ms',()=>fixture(env=>{
  env.controller.select('a');emit(env.capA.thumbImages[1],'click');
  assert(visible(env.capA.zoom));assert(!visible(env.capA.zoomImages[0]));assert(visible(env.capA.zoomImages[1]));
  emit(env.capA.zoomImages[1],'click');assert(!visible(env.capA.zoomImages[1]));assert(visible(env.capA.zoom));
  env.advance(199);assert(visible(env.capA.zoom));env.advance(1);assert(!visible(env.capA.zoom));
}));

test('selecting another thumbnail cancels stale zoom close, and changing archive clears overlay/timer',()=>fixture(env=>{
  env.controller.select('a');emit(env.capA.thumbNodes[0],'click');emit(env.capA.zoom,'click');env.advance(100);
  emit(env.capA.thumbNodes[1],'click');env.advance(200);assert(visible(env.capA.zoom));assert(visible(env.capA.zoomImages[1]));
  emit(env.capA.zoom,'click');assert.equal(env.timers.size,1);env.controller.select('b');assert.equal(env.timers.size,0);
  assert(!visible(env.capA.zoom));assert(!visible(env.capA.element));env.advance(300);assert(active(env.bgB.element));
}));

test('explicit reset control clears selection, restores default and leaves unrelated header controls alone',()=>fixture(env=>{
  env.controller.select('a');emit(env.capA.thumbNodes[0],'click');
  assert(emit(env.resetControl,'click').prevented);assert(!visible(env.capA.element));assert(!visible(env.capA.zoom));
  assert(!active(env.bgA.element));assert(active(env.defaultBackground));assert(!env.ticker.classList.contains('shift-up'));
  assert.deepEqual(env.shifts,[true,false]);
}));

test('background video hydrates once, waits for canplay, loops muted inline and pauses when hidden',()=>fixture(async env=>{
  const {video,videoSource,element}=env.bgVideo;
  env.controller.select('video');assert.equal(video.loadCount,1);assert.equal(video.playCount,0);
  assert.equal(videoSource.getAttribute('src'),'clip-video.mp4');assert.equal(videoSource.getAttribute('data-src'),null);
  assert(video.muted&&video.loop&&video.playsInline);emit(video,'canplay');await flush();
  assert(element.classList.contains('video-loaded'));assert.equal(video.playCount,1);assert.equal(video.paused,false);
  env.controller.select('a');assert.equal(video.paused,true);assert.equal(video.listeners.get('canplay')?.size,0);
  env.controller.select('video');assert.equal(video.loadCount,1);assert.equal(video.playCount,2);
}));

test('hidden canplay cannot restart video and blocked autoplay keeps picture poster visible',()=>fixture(async env=>{
  const {video,element}=env.bgVideo;video.playResult=()=>Promise.reject(new Error('autoplay denied'));
  env.controller.select('video');env.controller.select('a');emit(video,'canplay');assert.equal(video.playCount,0);
  video.readyState=4;env.controller.select('video');await flush();assert(active(element));assert(!element.classList.contains('video-loaded'));
  assert(env.bgVideo.picture.classList.contains('lazy-loaded'));
}));

test('first show hydrates lazy video sources even when video was already ready for an earlier source',()=>fixture(env=>{
  const {video,videoSource}=env.bgVideo;video.readyState=4;
  env.controller.select('video');
  assert.equal(videoSource.getAttribute('src'),'clip-video.mp4');assert.equal(videoSource.getAttribute('data-src'),null);
  assert.equal(video.loadCount,1);assert.equal(video.playCount,0,'wait for refreshed source canplay');
  emit(video,'canplay');assert.equal(video.playCount,1);
}));

test('late playback rejection from old selection cannot hide a newer successful playback',()=>fixture(async env=>{
  const {video,element}=env.bgVideo;let reject;
  video.playResult=()=>new Promise((resolve,rejectPlay)=>{reject=rejectPlay;});
  env.controller.select('video');emit(video,'canplay');
  env.controller.select('a');video.playResult=()=>Promise.resolve();env.controller.select('video');await flush();
  reject(new Error('stale autoplay rejection'));await flush();assert(element.classList.contains('video-loaded'));
}));

test('same-ID selection is source-like no-op and destroy cancels zoom/media/listeners without late work',()=>fixture(env=>{
  env.controller.select('a');assert(env.controller.select('a'));assert.deepEqual(env.shifts,[true]);
  emit(env.capA.thumbNodes[0],'click');emit(env.capA.zoom,'click');env.controller.destroy();
  assert.equal(env.timers.size,0);assert(!env.root.classList.contains('archive-media-selector'));assert(!env.ticker.classList.contains('is-ready'));
  assert(!visible(env.capA.element));assert(!visible(env.capA.zoom));env.advance(500);
  emit(env.items.a,'click');assert(!visible(env.capA.element));assert.equal(env.controller.select('a'),false);
  assert.equal(env.root.listeners.get('click').size,0);assert.equal(env.resetControl.listeners.get('click').size,0);
}));

test('destroy preserves root scope and carrier readiness that existed before mounting',()=>fixture(env=>{
  env.controller.destroy();assert(env.root.classList.contains('archive-media-selector'));assert(env.ticker.classList.contains('is-ready'));
},{owned:false}));
