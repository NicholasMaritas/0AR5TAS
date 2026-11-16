// Rules P1-P9, B1-B7: only matched 1440x900 and 390x844 captures, verified data, measured differences, no unverified accuracy claim.
import fs from 'node:fs/promises';
import sharp from 'sharp';
const output = {};
for (const viewport of ['desktop','mobile']) {
  const p = 'reference/';
  const src = JSON.parse(await fs.readFile(p+'supreme-'+viewport+'.json','utf8'));
  const dst = JSON.parse(await fs.readFile(p+'clone-'+viewport+'.json','utf8'));
  const imgA = await sharp(p+'supreme-'+viewport+'.jpg').removeAlpha().raw().toBuffer({resolveWithObject:true});
  const imgB = await sharp(p+'clone-'+viewport+'.jpg').removeAlpha().raw().toBuffer({resolveWithObject:true});
  const sameSize = imgA.info.width===imgB.info.width && imgA.info.height===imgB.info.height;
  let meanAbsoluteError = null, pixelMismatchAbove15 = null, pixelMismatchAbove5 = null;
  if(sameSize) {
    let total=0,bad15=0,bad5=0;const count=imgA.info.width*imgA.info.height;const a=imgA.data,b=imgB.data;
    for(let i=0;i<count;i++){
      let max=0;
      for(let c=0;c<3;c++){const v=Math.abs(a[i*3+c]-b[i*3+c]);total+=v;max=Math.max(max,v);}
      if(max>15)bad15++;
      if(max>5)bad5++;
    }
    meanAbsoluteError=total/(count*3);
    pixelMismatchAbove15=bad15/count;
    pixelMismatchAbove5=bad5/count;
  }
  const items = {
    nav:n=>n.tag==='nav'&&n.attrs['data-testid']==='header',
    logo:n=>n.tag==='a'&&n.attrs['aria-label']==='Supreme Home',
    main:n=>n.tag==='main',
    footer:n=>n.tag==='footer',
    firstMenu:n=>n.tag==='a'&&n.attrs['aria-label']==='news'
  };
  const rectComparisons={};
  for (const [name,predicate] of Object.entries(items)) {
    const a=src.nodes.find(predicate);
    const b=dst.nodes.find(predicate);
    rectComparisons[name]=a&&b
      ? Object.fromEntries(['x','y','width','height'].map(k=>[k,Math.round((b.rect[k]-a.rect[k])*1000)/1000]))
      : {matched:false,originalFound:!!a,cloneFound:!!b};
  }
  output[viewport]={viewport:src.viewport,originalHttpStatus:src.httpStatus,cloneHttpStatus:dst.httpStatus,originalTitle:src.title,cloneTitle:dst.title,originalText:src.bodyText.slice(0,160),cloneText:dst.bodyText.slice(0,160),originalNodeCount:src.nodes.length,cloneNodeCount:dst.nodes.length,sameScreenshotDimensions:sameSize,meanAbsoluteError,pixelMismatchAbove15,pixelMismatchAbove5,rectDifferencesInPixels:rectComparisons,missingResourceErrors:dst.errors.filter(e=>e.startsWith('request:')),fontFamilies:[...new Set(dst.nodes.filter(n=>n.computed.fontFamily).map(n=>n.computed.fontFamily))]};
}
const observed = Object.values(output).every(v=>v.originalHttpStatus===200&&v.cloneHttpStatus===200&&v.cloneText.includes('fall/winter 2026 preview')&&v.sameScreenshotDimensions);
await fs.writeFile('reference/comparison.json',JSON.stringify({date:'2026-11-16',method:'Supreme and GitHub Pages captured by same Playwright Chromium browser at identical viewport sizes; JPEG screenshots decoded with sharp and RGB compared pixelwise; element positions from getBoundingClientRect',status:observed?'both_sites_rendered_and_compared':'comparison_incomplete',measurements:output,limitations:['Clock may change between captures','JPEG encoding introduces small pixel errors','Computed layouts are browser- and time-specific','This measures the homepage only, not interactive secondary pages']},null,2));
if(!observed)process.exitCode=1;
