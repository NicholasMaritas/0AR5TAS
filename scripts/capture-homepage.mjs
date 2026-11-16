// Rules P1-P9, B1-B7: only homepages; no policy/about/legal-page visits; record verified DOM/assets; no design approximation; equal viewport comparison; report unverified states.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const base = 'reference';
await fs.mkdir(base, {recursive:true});
const checks = [
  {id:'supreme-desktop',url:'https://supreme.com/',viewport:{width:1440,height:900},original:true},
  {id:'clone-desktop',url:'https://nicholasmaritas.github.io/0AR5TAS/',viewport:{width:1440,height:900},original:false},
  {id:'supreme-mobile',url:'https://supreme.com/',viewport:{width:390,height:844},original:true},
  {id:'clone-mobile',url:'https://nicholasmaritas.github.io/0AR5TAS/',viewport:{width:390,height:844},original:false}
];
const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
const summary = [];
for (const target of checks) {
 const page = await browser.newPage({viewport:target.viewport,deviceScaleFactor:1,locale:'en-US',timezoneId:'America/New_York'});
 const errors = [];
 page.on('pageerror',error=>errors.push('page:'+error.message.slice(0,240)));
 page.on('requestfailed',request=>errors.push('request:'+request.url().slice(0,160)+' '+(request.failure()?.errorText||'')));
 let response = null, loadError = null;
 try { response=await page.goto(target.url,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForTimeout(6500); }
 catch(e){loadError=String(e);}
 const observation=await page.evaluate(()=>{
  const attrs=(el)=>Object.fromEntries([...el.attributes].map(a=>[a.name,a.value]));
  const styleKeys=['display','position','top','right','bottom','left','zIndex','width','height','minWidth','maxWidth','minHeight','maxHeight','margin','marginTop','marginRight','marginBottom','marginLeft','padding','paddingTop','paddingRight','paddingBottom','paddingLeft','fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing','textAlign','textTransform','textDecoration','color','background','backgroundColor','backgroundImage','backgroundSize','backgroundPosition','objectFit','overflow','flex','flexDirection','alignItems','justifyContent','gap','gridTemplateColumns','border','borderRadius','opacity','transform','visibility'];
  const nodes=[...document.querySelectorAll('body *')].filter(el=>el.tagName!=='SCRIPT'&&el.tagName!=='STYLE').slice(0,500).map((el,i)=>{
   const st=getComputedStyle(el),r=el.getBoundingClientRect();const computed={};
   for(const k of styleKeys)computed[k]=st[k]||'';
   return {index:i,tag:el.tagName.toLowerCase(),attrs:attrs(el),directText:[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim().slice(0,160),rect:{x:r.x,y:r.y,width:r.width,height:r.height},computed};
  });
  const sheets=[...document.styleSheets].map(s=>({href:s.href,owner:s.ownerNode?.outerHTML?.slice(0,600),rules:(()=>{try{return [...s.cssRules].map(r=>r.cssText).join('\\n').slice(0,250000);}catch{return null;}})()}));
  const copy=document.documentElement.cloneNode(true);copy.querySelectorAll('script,noscript,iframe').forEach(el=>el.remove());copy.querySelectorAll('link[rel="preload"][as="script"]').forEach(el=>el.remove());
  const extra=document.createElement('base');extra.setAttribute('href','https://supreme.com/');copy.querySelector('head')?.prepend(extra);
  return {url:location.href,title:document.title,bodyText:document.body.innerText.slice(0,25000),readyState:document.readyState,bodyBackground:getComputedStyle(document.body).backgroundColor,htmlBackground:getComputedStyle(document.documentElement).backgroundColor,fonts:[...document.fonts].map(f=>({family:f.family,style:f.style,weight:f.weight,status:f.status})),images:[...document.images].map(i=>({src:i.currentSrc||i.src,width:i.naturalWidth,height:i.naturalHeight,alt:i.alt})),links:[...document.querySelectorAll('a')].map(a=>({text:a.innerText.trim(),href:a.href})),resources:performance.getEntriesByType('resource').map(r=>({name:r.name,initiatorType:r.initiatorType})).slice(0,1000),nodes,stylesheets:sheets,snapshot:'<!doctype html>\\n'+copy.outerHTML};
 });
 await page.screenshot({path:path.join(base,target.id+'.jpg'),type:'jpeg',quality:85,fullPage:false}).catch(e=>errors.push('screenshot:'+String(e)));
 const snapshot=observation.snapshot;delete observation.snapshot;
 await fs.writeFile(path.join(base,target.id+'.json'),JSON.stringify({...observation,httpStatus:response?.status()||null,loadError,errors:errors.slice(0,80),viewport:target.viewport},null,2));
 if(target.original)await fs.writeFile(path.join(base,target.id+'.html'),snapshot);
 summary.push({id:target.id,status:response?.status()||null,loadError,title:observation.title,bodyText:observation.bodyText.slice(0,600),nodes:observation.nodes.length,images:observation.images.length,links:observation.links.length,cssSheets:observation.stylesheets.length,errors:errors.slice(0,10)});
 await page.close();
}
await browser.close();
await fs.writeFile(path.join(base,'capture-summary.json'),JSON.stringify({testedViewports:[{width:1440,height:900},{width:390,height:844}],results:summary,accuracyClaim:'unverified; no visual comparison or correction was performed by this capture step'},null,2));
