// Node 24; APK real, ADB separado, sem alterar fontes nem executar Vite/build.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile,readFile,copyFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {parseFocusedWindowDiagnostics,parseNativeWebViewBounds} from './qa-mobile-visual-parsers.mjs';

if(Number(process.versions.node.split('.')[0])<24)throw new Error('Execute com Node 24 ou superior.');

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const qa = join(root, '.tools.local/visual-qa');
const adb = join(qa, 'sdk/platform-tools/adb.exe');
const serial = 'emulator-5580';
const apk = resolve(process.argv[2] ?? join(root, '.tools.local/entrega/excalisidian-android-viabilidade.apk'));
const runId = new Date().toISOString().replaceAll(':','-');
const output = join(qa, 'results', runId);
const nativePresentation=[];
const lifecycleEvidence=[];
const report = {startedAt:new Date().toISOString(),apk,sha256:'',device:{},checks:[],captures:[],nativePresentation,lifecycleEvidence,errors:[]};
const sleep = ms => new Promise(r=>setTimeout(r,ms));
await mkdir(output,{recursive:true});
const apkSnapshot=join(output,'apk-under-test.apk');
await copyFile(apk,apkSnapshot);
report.sha256=createHash('sha256').update(await readFile(apkSnapshot)).digest('hex');
const command = async (args,timeout=60000) => (await exec('rtk',['proxy',adb,'-P','5047','-s',serial,...args],{encoding:'buffer',maxBuffer:24*1024*1024,timeout})).stdout;
const quoteShell = value => `'${String(value).replaceAll("'", "'\"'\"'")}'`;
const shell = async (...args) => (await command(['shell',args.map(quoteShell).join(' ')])).toString().replaceAll('\r\n','\n').trim();
const check = (name,passed,evidence) => {
  report.checks.push({name,passed:Boolean(passed),evidence});
  console.log(`${passed?'PASS':'FAIL'} ${name}`);
};
async function until(operation,description,timeout=45000) {
  const deadline=Date.now()+timeout;let last;
  while(Date.now()<deadline){try {const result=await operation();if(result)return result;}catch(error){last=error;}await sleep(1000);}
  throw new Error(`Timeout: ${description}${last?`: ${last.message}`:''}`);
}

let socket;let nextId=0;let nativeWebView={x:0,y:0};const pending=new Map();
async function connect() {
  if(socket)socket.close();
  const pid=await until(async()=>{const value=await shell('pidof','com.excalisidian.app');return /^\d+$/.test(value)?value:false;},'processo do APK',90000);
  if(!/^\d+$/.test(pid))throw new Error('Processo do APK indisponivel.');
  await command(['forward','tcp:9335',`localabstract:webview_devtools_remote_${pid}`]);
  const target=await until(async()=>{
    const targets=await (await fetch('http://127.0.0.1:9335/json',{signal:AbortSignal.timeout(4000)})).json();
    return targets.find(t=>t.type==='page'&&t.webSocketDebuggerUrl);
  },'WebView depuravel do APK',90000);
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok,no)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',no,{once:true});});
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.method==='Runtime.exceptionThrown')report.errors.push(message.params.exceptionDetails);
    const request=pending.get(message.id);
    if(request){pending.delete(message.id);clearTimeout(request.timer);message.error?request.reject(new Error(message.error.message)):request.resolve(message.result);}
  });
  await cdp('Runtime.enable');await cdp('Page.enable');
  await until(async()=>evaluate('Boolean(document.querySelector(".mobile-app"))'),'interface mobile');
  const windowPath=`/sdcard/excalisidian-qa-window-${runId}-${nextId}.xml`;
  try {await shell('uiautomator','dump',windowPath);}catch(error){
    // Android pode encerrar o helper apos gravar; o XML exclusivo ainda precisa ser valido.
    report.device.nativeDumpWarning=error.message;
  }
  const hierarchy=await shell('cat',windowPath);
  if(!hierarchy.includes('</hierarchy>'))throw new Error('Hierarquia nativa incompleta.');
  await writeFile(join(output,`native-window-${nextId}.xml`),hierarchy);
  nativeWebView=parseNativeWebViewBounds(hierarchy);
  if(!nativeWebView){
    const packages=[...new Set([...hierarchy.matchAll(/\bpackage="([^"]+)"/g)].map(match=>match[1]))];
    const classes=[...new Set([...hierarchy.matchAll(/\bclass="([^"]+)"/g)].map(match=>match[1]))];
    const visibleText=[...hierarchy.matchAll(/\btext="([^"]+)"/g)].map(match=>match[1]).filter(Boolean);
    throw new Error(`WebView nativa ausente na hierarquia; packages=${packages.join(',')}; classes=${classes.join(',')}; textos=${visibleText.join('|')}`);
  }
}
function cdp(method,params={}) {
  return new Promise((resolve,reject)=>{
    const id=++nextId;
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timeout: ${method}`));},15000);
    pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression) {
  const result=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});
  if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);
  return result.result.value;
}
async function click(labels,selector='button') {
  const found=await evaluate(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(selector)})].find(b=>${JSON.stringify(labels)}.includes(b.textContent.trim()));if(!b||b.disabled)return false;b.click();return true;})()`);
  if(!found)throw new Error(`Controle indisponivel: ${labels.join('/')}`);
  await sleep(450);
}
async function fillInput(text) {
  await evaluate(`(()=>{const input=document.querySelector('.mobile-app__input');if(!input)throw Error('Input ausente');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(text)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await sleep(250);
}

async function inspectVaultCreateAfterNativeScroll() {
  const swipeX=Math.round(nativeWebView.width/2);
  await shell('input','swipe',String(swipeX),String(Math.round(nativeWebView.height*0.86)),String(swipeX),String(Math.round(nativeWebView.height*0.4)),'500');
  await sleep(350);
  const result=await evaluate(`(()=>{const e=[...document.querySelectorAll('.mobile-app__button')].find(item=>item.textContent.trim()==='Create vault');if(!e)return null;const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,inside=x>=0&&y>=0&&x<innerWidth&&y<innerHeight,hit=inside?document.elementFromPoint(x,y):null;let scroller=e.parentElement;while(scroller&&scroller!==document.body){const s=getComputedStyle(scroller);if(scroller.scrollHeight>scroller.clientHeight+1&&/(auto|scroll)/.test(s.overflowY))break;scroller=scroller.parentElement}return{label:e.textContent.trim(),x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,viewport:{width:innerWidth,height:innerHeight},centerHit:inside&&Boolean(hit&&(hit===e||e.contains(hit))),hitLabel:hit?.textContent?.trim()||null,scrollContainer:scroller&&scroller!==document.body?{className:typeof scroller.className==='string'?scroller.className:'',scrollTop:scroller.scrollTop,scrollHeight:scroller.scrollHeight,clientHeight:scroller.clientHeight,overflowY:getComputedStyle(scroller).overflowY}:null}})()`);
  await writeFile(join(output,'vault-create-after-native-scroll.json'),JSON.stringify(result,null,2));
  await writeFile(join(output,'vault-create-after-native-scroll-android.png'),await command(['exec-out','screencap','-p']));
  check('vault Create vault acessivel apos rolagem nativa documentada',Boolean(result&&result.width>=44&&result.height>=44&&result.centerHit&&result.x>=0&&result.y>=0&&result.right<=result.viewport.width+1&&result.bottom<=result.viewport.height+1&&result.scrollContainer),result);
  const navInset=nativePresentation.find(item=>item.name==='01-vaults-375-claro')?.insets?.find(inset=>inset.type==='navigationBars');
  const safeBottom=navInset?Math.max(0,(navInset.top-nativeWebView.y)/nativePresentation.find(item=>item.name==='01-vaults-375-claro').dpr):null;
  const actions=await evaluate(`(async()=>{const visible=e=>e.getClientRects().length>0;const controls=[...document.querySelectorAll('.mobile-app__button,.mobile-app__input')].filter(visible);const output=[];for(const e of controls){const label=e.getAttribute('aria-label')||e.getAttribute('placeholder')||e.textContent.trim();let scroller=e.parentElement;while(scroller&&scroller!==document.body){const style=getComputedStyle(scroller);if(scroller.scrollHeight>scroller.clientHeight+1&&/(auto|scroll)/.test(style.overflowY))break;scroller=scroller.parentElement}if(scroller===document.body)scroller=null;const before=e.getBoundingClientRect();e.scrollIntoView({block:'center',inline:'nearest'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=x>=0&&y>=0&&x<innerWidth&&y<innerHeight?document.elementFromPoint(x,y):null,port=scroller?.getBoundingClientRect(),portTop=port?port.top+scroller.clientTop:0,portBottom=port?portTop+scroller.clientHeight:${safeBottom??'innerHeight'};output.push({label,tag:e.tagName,x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,centerHit:Boolean(hit&&(hit===e||e.contains(hit))),insideScrollport:x>=0&&x<innerWidth&&y>=Math.max(0,portTop)&&y<=Math.min(innerHeight,portBottom),scrollport:scroller?{className:typeof scroller.className==='string'?scroller.className:'',scrollTop:scroller.scrollTop,scrollHeight:scroller.scrollHeight,clientHeight:scroller.clientHeight,overflowY:getComputedStyle(scroller).overflowY,top:portTop,bottom:portBottom}:null,initial:{x:before.x,y:before.y}})}return{safeBottom:${safeBottom??'null'},controls:output}})()`);
  await writeFile(join(output,'vault-actions-after-scroll.json'),JSON.stringify(actions,null,2));
  check('vault lista: cada controle alcancavel no scrollport e fora da barra do sistema',actions.controls.length>0&&actions.controls.every(action=>action.width>=44&&action.height>=44&&action.centerHit&&action.insideScrollport&&action.bottom<=actions.safeBottom+1),actions);
}
async function capture(name) {
  await sleep(500);
  await writeFile(join(output,`${name}-android.png`),await command(['exec-out','screencap','-p']));
  const screenshot=await cdp('Page.captureScreenshot');
  await writeFile(join(output,`${name}-webview.png`),Buffer.from(screenshot.data,'base64'));
  const geometry=await evaluate(`(()=>{
    const vv=window.visualViewport;const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}};const scrollAncestor=e=>{let p=e.parentElement;while(p&&p!==document.body){const s=getComputedStyle(p);if(p.scrollHeight>p.clientHeight+1&&/(auto|scroll)/.test(s.overflowY))return p;p=p.parentElement}return null};const intersects=(r)=>r.right>0&&r.bottom>0&&r.x<innerWidth&&r.y<innerHeight;
    const controls=[...document.querySelectorAll('.mobile-app__button,.mobile-app__row')].filter(e=>e.getClientRects().length).map(e=>({text:e.textContent.trim(),...rect(e),disabled:e.disabled}));
    const allButtons=[...document.querySelectorAll('button,[role="button"],label:has(input[type="radio"])')].filter(e=>e.getClientRects().length).map(e=>{const r=rect(e),scroller=scrollAncestor(e),port=scroller?.getBoundingClientRect(),portTop=port?port.top+scroller.clientTop:0,portBottom=port?portTop+scroller.clientHeight:innerHeight;return{label:e.getAttribute('aria-label')||e.title||e.textContent.trim(),...r,inScrollableContent:Boolean(scroller),intersectsViewport:intersects(r),insideScrollport:r.y+r.height/2>=Math.max(0,portTop)&&r.y+r.height/2<=Math.min(innerHeight,portBottom),scrollContainer:scroller?{className:typeof scroller.className==='string'?scroller.className:'',scrollHeight:scroller.scrollHeight,clientHeight:scroller.clientHeight,overflowY:getComputedStyle(scroller).overflowY,top:portTop,bottom:portBottom}:null}});
    const actionable=[...document.querySelectorAll('button,[role="button"],input:not([type="radio"]),textarea,[role="menuitem"],label:has(input[type="radio"])')]
      .filter(e=>e.getClientRects().length)
      .filter(e=>{const s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0})
      .filter(e=>!e.parentElement?.closest('button,[role="button"],[role="menuitem"]'))
       .map(e=>{const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,inside=x>=0&&y>=0&&x<innerWidth&&y<innerHeight,hit=inside?document.elementFromPoint(x,y):null,scroll=scrollAncestor(e),port=scroll?.getBoundingClientRect(),portTop=port?port.top+scroll.clientTop:0,portBottom=port?portTop+scroll.clientHeight:innerHeight;return{label:e.getAttribute('aria-label')||e.title||e.getAttribute('placeholder')||e.textContent.trim(),tag:e.tagName,classes:typeof e.className==='string'?e.className:'',...rect(e),inScrollableContent:Boolean(scroll),intersectsViewport:intersects(rect(e)),insideScrollport:y>=Math.max(0,portTop)&&y<=Math.min(innerHeight,portBottom),centerHit:inside&&Boolean(hit&&(hit===e||e.contains(hit))),hitLabel:hit?.getAttribute?.('aria-label')||hit?.title||hit?.textContent?.trim()||null}});
    const overlaps=[];
    const visibleActionable=actionable.filter(item=>item.intersectsViewport&&(!item.inScrollableContent||item.insideScrollport));
    for(let i=0;i<visibleActionable.length;i++)for(let j=i+1;j<visibleActionable.length;j++){
      const a=visibleActionable[i],b=visibleActionable[j],w=Math.max(0,Math.min(a.right,b.right)-Math.max(a.x,b.x)),h=Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y));
      if(w>=1&&h>=1)overlaps.push({a:a.label,b:b.label,area:Math.round(w*h),intersection:{x:Math.max(a.x,b.x),y:Math.max(a.y,b.y),width:w,height:h}});
    }
    const surface=document.querySelector('.mobile-app');
    return{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,viewport:vv?{width:vv.width,height:vv.height,offsetTop:vv.offsetTop}:null,scrollWidth:document.documentElement.scrollWidth,controls,allButtons,actionable,overlaps,header:document.querySelector('header')?rect(document.querySelector('header')):null,title:document.querySelector('.mobile-app__title')?rect(document.querySelector('.mobile-app__title')):null,inputFonts:[...document.querySelectorAll('input')].map(e=>getComputedStyle(e).fontSize),surfaceBackground:surface?getComputedStyle(surface).backgroundColor:null,surfaceColor:surface?getComputedStyle(surface).color:null,theme:{dataTheme:document.documentElement.dataset.theme||surface?.dataset.theme||null,classes:document.documentElement.className},dialogs:[...document.querySelectorAll('[role="dialog"],[role="menu"],[role="menuitem"]')].filter(e=>e.getClientRects().length).map(e=>({role:e.getAttribute('role'),label:e.getAttribute('aria-label')||e.textContent.trim(),...rect(e)})),expanded:[...document.querySelectorAll('[aria-expanded="true"]')].filter(e=>e.getClientRects().length).map(e=>e.getAttribute('aria-label')||e.title||e.textContent.trim()),text:document.body.innerText,canvas:document.querySelectorAll('canvas').length};
  })()`);
  await writeFile(join(output,`${name}.json`),JSON.stringify(geometry,null,2));
  report.captures.push({name,geometry});
  check(`${name}: sem overflow horizontal`,geometry.scrollWidth<=geometry.width+1,geometry);
  check(`${name}: controles proprios >=44px`,geometry.controls.every(c=>c.width>=44&&c.height>=44),geometry.controls);
  check(`${name}: botoes do editor/canvas >=44px`,geometry.allButtons.every(c=>c.width>=44&&c.height>=44),geometry.allButtons.filter(c=>c.width<44||c.height<44));
  const clipped=geometry.allButtons.filter(c=>(!c.inScrollableContent||c.intersectsViewport&&c.insideScrollport)&&(c.x<0||c.y<0||c.right>geometry.width+1||c.bottom>geometry.height+1));
  check(`${name}: botoes do editor/canvas sem recorte`,clipped.length===0,clipped);
  const unreachable=geometry.actionable.filter(c=>(!c.inScrollableContent||c.intersectsViewport&&c.insideScrollport)&&(c.x<0||c.y<0||c.right>geometry.width+1||c.bottom>geometry.height+1||!c.centerHit));
  check(`${name}: controles acionaveis sem obstrucao no ponto de toque`,unreachable.length===0,unreachable);
  check(`${name}: controles acionaveis sem sobreposicao real`,geometry.overlaps.length===0,geometry.overlaps);
  const headerButtons=geometry.controls.filter(c=>geometry.header&&c.y<geometry.header.bottom);
  check(`${name}: controles do cabecalho dentro da viewport`,headerButtons.every(c=>c.x>=0&&c.right<=geometry.width+1&&c.y>=0&&c.bottom<=geometry.height+1),headerButtons);
  if(geometry.title)check(`${name}: titulo tem espaco legivel`,geometry.title.width>=64,geometry.title);
  if(['01-vaults-375-claro','09-canvas-paisagem','11-canvas-414-escuro'].includes(name)){
    const native=await shell('dumpsys','window','-a');
    const nativeInfo=parseFocusedWindowDiagnostics(native);
    const {focusLine,focusWindowId,focusComponent,appIsFocused,focusedWindow,focusedInsetsControl,vsysui,appearance,legacyFlags,appearanceHex,statusLightBackground,navigationLightBackground,insets:insetMatches,controlsMatch:focusedControlsMatch}=nativeInfo;
    const insetLines=[...focusedWindow.split('\n'),...nativeInfo.insetState.split('\n'),...focusedInsetsControl.split('\n')].filter(line=>/InsetsSource|statusBars|navigationBars|vsysui|\bapr=|statusBarColor|navigationBarColor/i.test(line));
    const statusInset=insetMatches.find(inset=>inset.type.toLowerCase()==='statusbars'&&inset.visible);
    const navigationInset=insetMatches.find(inset=>inset.type.toLowerCase()==='navigationbars'&&inset.visible);
    const headerPhysicalTop=nativeWebView.y+(geometry.header?.y??0)*geometry.dpr;
    const headerPhysicalBottom=nativeWebView.y+(geometry.header?.bottom??0)*geometry.dpr;
    const controlsPhysical=insetMatches.length?geometry.actionable.filter(control=>!control.inScrollableContent||control.insideScrollport).map(control=>({label:control.label,top:nativeWebView.y+control.y*geometry.dpr,bottom:nativeWebView.y+control.bottom*geometry.dpr})):[];
    const presentation={name,focusedPackage:'com.excalisidian.app',focusLine,focusWindowId,focusComponent,appIsFocused,webView:nativeWebView,screenCss:{width:geometry.width,height:geometry.height},dpr:geometry.dpr,surfaceBackground:geometry.surfaceBackground,surfaceColor:geometry.surfaceColor,theme:geometry.theme,vsysui,appearance,legacyFlags:legacyFlags.map(value=>({hex:`0x${value.toString(16)}`,lightStatus:Boolean(value&0x2000),lightNavigation:Boolean(value&0x10)})),appearanceHex:appearanceHex.map(value=>({hex:`0x${value.toString(16)}`,lightStatus:Boolean(value&0x8),lightNavigation:Boolean(value&0x10)})),statusLightBackground,navigationLightBackground,focusedControlsMatch,insets:insetMatches,insetLines,focusedWindow,focusedInsetsControl};
    nativePresentation.push(presentation);
    await writeFile(join(output,`${name}-window.txt`),`${focusedWindow}\n\n${focusedInsetsControl}`);
    await writeFile(join(output,`${name}-presentation.json`),JSON.stringify(presentation,null,2));
    const background=geometry.surfaceBackground?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    const luminance=background?((Number(background[1])*0.2126+Number(background[2])*0.7152+Number(background[3])*0.0722)/255):null;
    const expectedLightIcons=luminance===null?null:luminance>0.5;
    const statusFlagsAvailable=statusLightBackground!==null;
    const navigationFlagsAvailable=navigationLightBackground!==null;
    check(`${name}: janela focada e evidencias nativas do app`,appIsFocused&&Boolean(statusInset&&navigationInset&&focusedControlsMatch.status&&focusedControlsMatch.navigation&&statusFlagsAvailable&&navigationFlagsAvailable),{focusLine,focusWindowId,focusComponent,appIsFocused,insetLines,insets:insetMatches,focusedControlsMatch,statusLightBackground,navigationLightBackground,luminance,expectedLightIcons});
    if(statusInset&&geometry.header)check(`${name}: cabecalho separado da barra de status`,headerPhysicalTop>=statusInset.bottom,{headerPhysicalTop,statusInset,header:geometry.header,webView:nativeWebView,dpr:geometry.dpr});
    if(navigationInset)check(`${name}: controles separados da barra de navegacao`,controlsPhysical.every(control=>control.bottom<=navigationInset.top+1||control.top>=navigationInset.bottom-1),{navigationInset,controlsPhysical});
    if(expectedLightIcons!==null&&statusFlagsAvailable)check(`${name}: appearance de icones de status coerente com tema efetivo`,statusLightBackground===expectedLightIcons,{expectedLightIcons,statusLightBackground,vsysui,appearance,legacyFlags:presentation.legacyFlags,appearanceHex:presentation.appearanceHex,luminance});
    if(expectedLightIcons!==null&&navigationFlagsAvailable)check(`${name}: appearance de icones de navegacao coerente com tema efetivo`,navigationLightBackground===expectedLightIcons,{expectedLightIcons,navigationLightBackground,vsysui,appearance,legacyFlags:presentation.legacyFlags,appearanceHex:presentation.appearanceHex,luminance});
  }
  return geometry;
}

async function canvasControlInventory(state,selected) {
  const inventory=await evaluate(`(()=>{const visible=e=>e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';const label=e=>e.getAttribute('aria-label')||e.title||e.getAttribute('placeholder')||e.textContent.trim();const items=[...document.querySelectorAll('button,[role="button"],input:not([type="radio"]),[role="menuitem"],label:has(input[type="radio"])')].filter(visible).map(e=>({label:label(e),role:e.getAttribute('role'),tag:e.tagName,expanded:e.getAttribute('aria-expanded'),rect:(()=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}})()}));const link=document.querySelector('.excalisidian-canvas__mobile-link-trigger');return{items,linkPresent:Boolean(link),linkExpanded:link?.getAttribute('aria-expanded')==='true',dialogs:[...document.querySelectorAll('[role="dialog"],[role="menu"]')].filter(visible).map(e=>({role:e.getAttribute('role'),label:label(e)}))}})()`);
  await writeFile(join(output,`canvas-controls-${state}.json`),JSON.stringify({...inventory,expectedSelected:selected},null,2));
  check(`canvas ${state}: campo de link ${selected?'disponivel com forma selecionada':'ausente sem selecao'}`,inventory.linkPresent===selected,inventory);
  return inventory;
}

async function tapElement(selector) {
  const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;if(x<0||y<0||x>=innerWidth||y>=innerHeight)return false;const hit=document.elementFromPoint(x,y);if(!hit||!(hit===e||e.contains(hit)))return false;return{x:Math.round(x*devicePixelRatio),y:Math.round(y*devicePixelRatio)}})()`);
  if(!point)throw new Error(`Controle fora da area tocavel ou obstruido: ${selector}`);
  await shell('input','tap',String(point.x+nativeWebView.x),String(point.y+nativeWebView.y));
  await sleep(450);
}

async function tapButtonMatching(pattern) {
  const point=await evaluate(`(()=>{const re=new RegExp(${JSON.stringify(pattern)},'i');const buttons=[...document.querySelectorAll('button,[role="button"],label:has(input[type="radio"])')];const e=buttons.find(item=>{if(!item.getClientRects().length)return false;const label=item.getAttribute('aria-label')||item.title||item.textContent.trim();return re.test(label)});if(!e)return false;const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;if(x<0||y<0||x>=innerWidth||y>=innerHeight)return false;const hit=document.elementFromPoint(x,y);if(!hit||!(hit===e||e.contains(hit)))return false;return{label:e.getAttribute('aria-label')||e.title||e.textContent.trim(),x:Math.round(x*devicePixelRatio),y:Math.round(y*devicePixelRatio)}})()`);
  if(!point)throw new Error(`Botao ausente, fora da area ou obstruido: ${pattern}`);
  await shell('input','tap',String(point.x+nativeWebView.x),String(point.y+nativeWebView.y));
  await sleep(450);
  return point.label;
}

async function tapPanelControl(pattern) {
  const point=await evaluate(`(async()=>{const panel=document.querySelector('.App-mobile-menu');if(!panel)return null;const re=new RegExp(${JSON.stringify(pattern)},'i'),controls=[...panel.querySelectorAll('button,[role="button"],label:has(input[type="radio"])')],e=controls.find(item=>{if(!item.getClientRects().length)return false;return re.test(item.getAttribute('aria-label')||item.title||item.textContent.trim())});if(!e)return null;e.scrollIntoView({block:'center',inline:'nearest'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;if(x<0||y<0||x>=innerWidth||y>=innerHeight)return null;const hit=document.elementFromPoint(x,y);if(!hit||!(hit===e||e.contains(hit)))return null;return{x:Math.round(x*devicePixelRatio),y:Math.round(y*devicePixelRatio),label:e.getAttribute('aria-label')||e.title||e.textContent.trim()}})()`);
  if(!point)return false;
  await shell('input','tap',String(point.x+nativeWebView.x),String(point.y+nativeWebView.y));
  await sleep(400);
  return true;
}

async function propertiesPanelOpen() {
  return evaluate(`(()=>{const panel=document.querySelector('.App-mobile-menu');return Boolean(panel&&panel.getClientRects().length&&getComputedStyle(panel).visibility!=='hidden')})()`);
}

async function colorPopoverState() {
  return evaluate(`(()=>{const swatchSelector='button.color-picker__button--large:not(.color-picker__button--no-focus-visible),.color-picker-swatch:not(.color-picker__button--no-focus-visible):not(.color-picker-input)';const visible=e=>e.getClientRects().length>0&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden'&&Number(getComputedStyle(e).opacity)!==0;const roots=[...document.querySelectorAll('[role="dialog"],[role="menu"]')].filter(visible).filter(e=>!e.closest('.App-mobile-menu,.App-toolbar,.App-toolbar-container')).filter(e=>e.querySelector(swatchSelector));roots.sort((a,b)=>b.getBoundingClientRect().width*b.getBoundingClientRect().height-a.getBoundingClientRect().width*a.getBoundingClientRect().height);const root=roots[0]??null;return{open:Boolean(root),root:root?{role:root.getAttribute('role'),className:typeof root.className==='string'?root.className:'',bounds:(()=>{const r=root.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}})()}:null,swatches:root?[...root.querySelectorAll(swatchSelector)].filter(visible).filter(e=>{const label=e.getAttribute('aria-label')||e.title||e.getAttribute('data-color')||e.getAttribute('data-color-index')||e.getAttribute('data-value');return Boolean(label?.trim())}).map(e=>({label:e.getAttribute('aria-label')||e.title||e.getAttribute('data-color')||e.getAttribute('data-color-index')||e.getAttribute('data-value'),className:typeof e.className==='string'?e.className:'',tag:e.tagName,...(()=>{const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=x>=0&&y>=0&&x<innerWidth&&y<innerHeight?document.elementFromPoint(x,y):null;return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,centerHit:Boolean(hit&&(hit===e||e.contains(hit)))}})()})):[],inputs:root?[...root.querySelectorAll('input[type="color"],.color-picker-input')].filter(visible).map(e=>({type:e.type,className:typeof e.className==='string'?e.className:'',label:e.getAttribute('aria-label')||e.title||e.closest('label')?.textContent.trim()||'',bounds:(()=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()})):[]}})()`);
}

async function pressEscape() {
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
}

async function ensurePropertiesOpen() {
  if(await propertiesPanelOpen())return;
  await tapButtonMatching('^Edit$');
  await until(propertiesPanelOpen,'painel de propriedades abrir');
}

async function closeColorPopover() {
  if(!(await colorPopoverState()).open)return;
  for(let attempt=0;attempt<2&&(await colorPopoverState()).open;attempt++){
    await pressEscape();
    await sleep(250);
  }
  if((await colorPopoverState()).open)throw new Error('Popover real de cores permaneceu aberto apos Escape.');
}

async function closePropertiesPanel() {
  await closeColorPopover();
  if(!(await propertiesPanelOpen()))return;
  await tapButtonMatching('^Edit$');
  await until(async()=>!(await propertiesPanelOpen()),'painel de propriedades fechar');
}

async function exerciseCanvasMenu(state) {
  const before=await evaluate(`(()=>[...document.querySelectorAll('button,[role="button"],label:has(input[type="radio"])')].filter(e=>e.getClientRects().length).map(e=>e.getAttribute('aria-label')||e.title||e.textContent.trim()))()`);
  let label='';
  try {label=await tapButtonMatching('main menu|more tools|menu');}
  catch(error){check(`canvas ${state}: menu acessivel por toque`,false,{message:error.message,buttons:before});return;}
  const after=await evaluate(`(()=>{const visible=e=>e.getClientRects().length>0;const label=e=>e.getAttribute('aria-label')||e.title||e.textContent.trim();const beforeLabels=${JSON.stringify(before)};const candidates=[...document.querySelectorAll('button,[role="button"],[role="menuitem"],label:has(input[type="radio"])')].filter(visible);const actions=candidates.filter(e=>e.getAttribute('role')==='menuitem'||!beforeLabels.includes(label(e))).map(e=>{const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=x>=0&&y>=0&&x<innerWidth&&y<innerHeight?document.elementFromPoint(x,y):null;return{label:label(e),role:e.getAttribute('role'),x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,centerHit:Boolean(hit&&(hit===e||e.contains(hit)))}});const overlaps=[];for(let i=0;i<actions.length;i++)for(let j=i+1;j<actions.length;j++){const a=actions[i],b=actions[j],w=Math.max(0,Math.min(a.right,b.right)-Math.max(a.x,b.x)),h=Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y));if(w>=1&&h>=1)overlaps.push({a:a.label,b:b.label,area:Math.round(w*h)})}return{viewport:{width:innerWidth,height:innerHeight},menus:[...document.querySelectorAll('[role="menu"],[role="dialog"],[role="menuitem"]')].filter(visible).map(e=>({role:e.getAttribute('role'),label:label(e)})),expanded:[...document.querySelectorAll('[aria-expanded="true"]')].filter(visible).map(e=>label(e)),buttons:candidates.map(label),actions,overlaps}})()`);
  const opened=after.menus.length>0||after.expanded.some(value=>/menu|tools/i.test(value))||after.buttons.length>before.length;
  await writeFile(join(output,`canvas-menu-${state}.json`),JSON.stringify({trigger:label,before,after},null,2));
  const actionsAccessible=after.actions.length>0&&after.actions.every(action=>action.width>=44&&action.height>=44&&action.centerHit&&action.x>=0&&action.y>=0&&action.right<=after.viewport.width+1&&action.bottom<=after.viewport.height+1)&&after.overlaps.length===0;
  check(`canvas ${state}: acoes do menu visiveis, tocaveis e sem sobreposicao`,opened&&actionsAccessible,{trigger:label,before,after});
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await sleep(250);
}

async function inspectSelectedProperties() {
  await ensurePropertiesOpen();
  const result=await evaluate(`(()=>{const label=e=>e.getAttribute('aria-label')||e.title||e.getAttribute('placeholder')||e.textContent.trim();const identity=e=>[e.tagName,typeof e.className==='string'?e.className:'',e.type||'',label(e)].join('|');const items=[...document.querySelectorAll('button,[role="button"],input:not([type="radio"]),[role="menuitem"],label:has(input[type="radio"])')].filter(e=>e.getClientRects().length).map(e=>({label:label(e),tag:e.tagName,role:e.getAttribute('role'),className:typeof e.className==='string'?e.className:'',type:e.type||'',signature:identity(e)}));const trigger=[...document.querySelectorAll('button,[role="button"]')].find(e=>e.getClientRects().length&&(/^(edit)$/i.test(label(e))||/propert|propriedad/i.test(label(e))));let triggerGeometry=null;if(trigger){const r=trigger.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=x>=0&&y>=0&&x<innerWidth&&y<innerHeight?document.elementFromPoint(x,y):null;triggerGeometry={label:label(trigger),x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,centerHit:Boolean(hit&&(hit===trigger||trigger.contains(hit)))}}return{items,baselineSignatures:items.map(item=>item.signature),trigger:triggerGeometry}})()`);
  await writeFile(join(output,'canvas-properties-selected.json'),JSON.stringify(result,null,2));
  check('canvas forma selecionada: gatilho Edit tocavel',result.trigger?.label==='Edit'&&result.trigger.centerHit&&result.trigger.width>=44&&result.trigger.height>=44,result.trigger);
  try{const state=await evaluate(`(()=>{const visible=e=>e.getClientRects().length>0;const label=e=>e.getAttribute('aria-label')||e.title||e.getAttribute('placeholder')||e.textContent.trim();const selector='button,[role="button"],input:not([type="radio"]),[role="menuitem"],label:has(input[type="radio"])';const identity=e=>[e.tagName,typeof e.className==='string'?e.className:'',e.type||'',label(e)].join('|');const panel=document.querySelector('.App-mobile-menu');const panelControls=panel?[...panel.querySelectorAll(selector)].filter(visible).map(e=>({label:label(e),tag:e.tagName,className:typeof e.className==='string'?e.className:'',type:e.type||'',signature:identity(e)})):[];const panelRect=panel?.getBoundingClientRect();return{viewport:{width:innerWidth,height:innerHeight},panelFound:Boolean(panel&&visible(panel)),panelBounds:panelRect?{x:panelRect.x,y:panelRect.y,width:panelRect.width,height:panelRect.height,right:panelRect.right,bottom:panelRect.bottom}:null,panelControls,controls:panelControls,newControls:panelControls}})()`);const opened=state.panelFound&&state.panelControls.length>0;await writeFile(join(output,'canvas-properties-open.png'),await command(['exec-out','screencap','-p']));const visual=await cdp('Page.captureScreenshot');await writeFile(join(output,'canvas-properties-open-webview.png'),Buffer.from(visual.data,'base64'));await writeFile(join(output,'canvas-properties-open.json'),JSON.stringify(state,null,2));check('canvas forma selecionada: painel de propriedades aberto por Edit',opened,{trigger:result.trigger,state});const targets=await evaluate(`(async()=>{const panel=document.querySelector('.App-mobile-menu');const visible=e=>e.getClientRects().length>0;const label=e=>e.getAttribute('aria-label')||e.title||e.getAttribute('placeholder')||e.textContent.trim();const identity=e=>[e.tagName,typeof e.className==='string'?e.className:'',e.type||'',label(e)].join('|');const selector='button,[role="button"],input:not([type="radio"]),[role="menuitem"],label:has(input[type="radio"])';const controls=panel?[...panel.querySelectorAll(selector)].filter(visible):[];const targets=[];for(const e of controls){const before=e.getBoundingClientRect();let scroller=e.parentElement;while(scroller&&scroller!==document.body){const style=getComputedStyle(scroller);if(scroller.scrollHeight>scroller.clientHeight+1&&/(auto|scroll)/.test(style.overflowY))break;scroller=scroller.parentElement}if(scroller===document.body)scroller=null;const initialScrollTop=scroller?.scrollTop??null;e.scrollIntoView({block:'center',inline:'nearest'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const r=e.getBoundingClientRect(),range=e.matches('input[type="range"]')?e.closest('.range-wrapper'):null,action=range??e,a=action.getBoundingClientRect(),x=a.x+a.width/2,y=a.y+a.height/2,hit=x>=0&&y>=0&&x<innerWidth&&y<innerHeight?document.elementFromPoint(x,y):null;targets.push({label:label(e)||e.closest('label')?.textContent.trim()||'',tag:e.tagName,className:typeof e.className==='string'?e.className:'',type:e.type||'',signature:identity(e),track:e.matches('input[type="range"]')?{x:r.x,y:r.y,width:r.width,height:r.height}:null,width:a.width,height:a.height,x:a.x,y:a.y,right:a.right,bottom:a.bottom,centerHit:Boolean(hit&&(hit===action||action.contains(hit))),initial:{x:before.x,y:before.y},scrollContainer:scroller?{className:typeof scroller.className==='string'?scroller.className:'',scrollHeight:scroller.scrollHeight,clientHeight:scroller.clientHeight,initialScrollTop,scrollTop:scroller.scrollTop,overflowY:getComputedStyle(scroller).overflowY}:null})}return{viewport:{width:innerWidth,height:innerHeight},targets}})()`);await writeFile(join(output,'canvas-properties-targets.json'),JSON.stringify(targets.targets,null,2));check('canvas propriedades: alvos e centros de ação com area minima 44x44',targets.targets.length>0&&targets.targets.every(target=>target.width>=44&&target.height>=44),targets.targets);check('canvas propriedades: alvos tocaveis apos rolagem do ancestor',targets.targets.length>0&&targets.targets.every(target=>target.centerHit&&target.x>=0&&target.y>=0&&target.right<=targets.viewport.width+1&&target.bottom<=targets.viewport.height+1),targets.targets);check('canvas propriedades: ultimo controle acessivel apos scroll',targets.targets.length>0&&targets.targets.at(-1).centerHit&&targets.targets.at(-1).x>=0&&targets.targets.at(-1).y>=0&&targets.targets.at(-1).right<=targets.viewport.width+1&&targets.targets.at(-1).bottom<=targets.viewport.height+1,targets.targets.at(-1));await writeFile(join(output,'canvas-properties-scrolled-android.png'),await command(['exec-out','screencap','-p']));const scrolledScreenshot=await cdp('Page.captureScreenshot');await writeFile(join(output,'canvas-properties-scrolled-webview.png'),Buffer.from(scrolledScreenshot.data,'base64'));const rangeTarget=targets.targets.find(target=>target.type==='range');check('canvas propriedades: range mede wrapper de acao, com trilho separado',Boolean(rangeTarget?.track&&rangeTarget.width>=44&&rangeTarget.height>=44&&rangeTarget.centerHit),rangeTarget);const bold=targets.targets.find(target=>/^bold$/i.test(target.label));if(!bold)check('canvas propriedades: alvo Bold encontrado',false,targets.targets);else{const activated=await tapPanelControl('^bold$');check('canvas propriedades: Bold recebeu toque nativo',activated,{target:bold});}await closeColorPopover();}
  catch(error){check('canvas forma selecionada: propriedade abre por toque',false,{message:error.message,result});try{await closeColorPopover();}catch(cleanupError){check('canvas propriedades: cleanup do popup apos falha',false,{message:cleanupError.message});}}
}

async function exercisePropertyRangeCenter() {
  try {
    await ensurePropertiesOpen();
    const target=await evaluate(`(async()=>{const input=document.querySelector('.App-mobile-menu .range-input');if(!input)return null;const action=input.closest('.range-wrapper')??input;action.scrollIntoView({block:'center',inline:'nearest'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const r=action.getBoundingClientRect(),track=input.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=x>=0&&y>=0&&x<innerWidth&&y<innerHeight?document.elementFromPoint(x,y):null;return{label:input.closest('label')?.textContent.trim()||'Opacity',viewport:{width:innerWidth,height:innerHeight},width:r.width,height:r.height,x:r.x,y:r.y,right:r.right,bottom:r.bottom,dpr:devicePixelRatio,valueBefore:input.value,centerHit:Boolean(hit&&(hit===action||action.contains(hit))),track:{x:track.x,y:track.y,width:track.width,height:track.height},scroll:{height:action.parentElement?.scrollHeight,clientHeight:action.parentElement?.clientHeight,overflowY:getComputedStyle(action.parentElement).overflowY}}})()`);
    check('canvas propriedades: centro de ação do range >=44x44 e tocável',Boolean(target&&target.width>=44&&target.height>=44&&target.centerHit&&target.x>=0&&target.y>=0&&target.right<=target.viewport.width+1&&target.bottom<=target.viewport.height+1),target);
    if(target){
      await shell('input','tap',String(Math.round((target.x+target.width/2)*target.dpr+nativeWebView.x)),String(Math.round((target.y+target.height/2)*target.dpr+nativeWebView.y)));
      await sleep(400);
      const valueAfter=await evaluate('document.querySelector(".App-mobile-menu .range-input")?.value??null');
      await writeFile(join(output,'canvas-range-action-center.json'),JSON.stringify({target,valueAfter},null,2));
      check('canvas propriedades: range recebeu toque no centro da área',valueAfter!==null&&(valueAfter!==target.valueBefore||await evaluate('document.activeElement===document.querySelector(".App-mobile-menu .range-input")')),{target,valueAfter});
      await writeFile(join(output,'canvas-range-action-center-android.png'),await command(['exec-out','screencap','-p']));
    }
  } catch(error) {
    check('canvas propriedades: centro de ação do range >=44x44 e tocável',false,{message:error.message});
  }
  await closeColorPopover();
}

async function inspectActiveColorPopover() {
  let opened=false;
  try {
    await ensurePropertiesOpen();
    await closeColorPopover();
    const before=await colorPopoverState();
    const strokePoint=await evaluate(`(async()=>{const panel=document.querySelector('.App-mobile-menu');if(!panel)return null;const trigger=panel.querySelector('button.properties-trigger[aria-label="Stroke"]');if(!trigger)return null;const scrollable=[...panel.querySelectorAll('*')].filter(e=>e.scrollHeight>e.clientHeight+1&&/(auto|scroll)/.test(getComputedStyle(e).overflowY)).sort((a,b)=>a.clientHeight-b.clientHeight)[0];if(scrollable)scrollable.scrollTop=0;panel.scrollTop=0;trigger.scrollIntoView({block:'center',inline:'nearest'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const r=trigger.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=x>=0&&y>=0&&x<innerWidth&&y<innerHeight?document.elementFromPoint(x,y):null;return{label:trigger.getAttribute('aria-label'),className:trigger.className,x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,dpr:devicePixelRatio,centerHit:Boolean(hit&&(hit===trigger||trigger.contains(hit))),hitLabel:hit?.getAttribute('aria-label')||hit?.textContent?.trim()||null,scroller:scrollable?{className:typeof scrollable.className==='string'?scrollable.className:'',scrollTop:scrollable.scrollTop,scrollHeight:scrollable.scrollHeight,clientHeight:scrollable.clientHeight}:null}})()`);
    await writeFile(join(output,'canvas-stroke-trigger.json'),JSON.stringify(strokePoint,null,2));
    await writeFile(join(output,'canvas-stroke-before-tap-android.png'),await command(['exec-out','screencap','-p']));
    if(!strokePoint?.centerHit)throw new Error(`Botão Stroke sem hit-test após estabilizar: ${JSON.stringify(strokePoint)}`);
    await shell('input','tap',String(Math.round((strokePoint.x+strokePoint.width/2)*strokePoint.dpr+nativeWebView.x)),String(Math.round((strokePoint.y+strokePoint.height/2)*strokePoint.dpr+nativeWebView.y)));
    await sleep(400);
    await writeFile(join(output,'canvas-stroke-after-tap-android.png'),await command(['exec-out','screencap','-p']));
    await until(async()=>(await colorPopoverState()).open,'popover real de cores abrir');
    opened=true;
    const openState=await colorPopoverState();
    await writeFile(join(output,'canvas-color-popover-open.png'),await command(['exec-out','screencap','-p']));
    const screenshot=await cdp('Page.captureScreenshot');
    await writeFile(join(output,'canvas-color-popover-open-webview.png'),Buffer.from(screenshot.data,'base64'));
    const state=await evaluate(`(async()=>{const selector='button.color-picker__button--large:not(.color-picker__button--no-focus-visible),.color-picker-swatch:not(.color-picker__button--no-focus-visible)';const visible=e=>e.getClientRects().length>0&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden'&&Number(getComputedStyle(e).opacity)!==0;const dialogs=[...document.querySelectorAll('[role="dialog"],[role="menu"]')].filter(visible).filter(e=>!e.closest('.App-mobile-menu,.App-toolbar,.App-toolbar-container')).filter(e=>e.querySelector(selector));dialogs.sort((a,b)=>b.getBoundingClientRect().width*b.getBoundingClientRect().height-a.getBoundingClientRect().width*a.getBoundingClientRect().height);const root=dialogs[0];if(!root)return{open:false,viewport:{width:innerWidth,height:innerHeight},targets:[]};const controls=[...root.querySelectorAll(selector)].filter(visible).filter(e=>{const label=e.getAttribute('aria-label')||e.title||e.getAttribute('data-color')||e.getAttribute('data-color-index')||e.getAttribute('data-value');return Boolean(label?.trim())});const targets=[];for(const e of controls){const before=e.getBoundingClientRect();let scroller=e.parentElement;while(scroller&&scroller!==root&&scroller!==document.body){const style=getComputedStyle(scroller);if(scroller.scrollHeight>scroller.clientHeight+1&&/(auto|scroll)/.test(style.overflowY))break;scroller=scroller.parentElement}if(scroller===document.body)scroller=null;const initialScrollTop=scroller?.scrollTop??null;e.scrollIntoView({block:'nearest',inline:'nearest'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=x>=0&&y>=0&&x<innerWidth&&y<innerHeight?document.elementFromPoint(x,y):null;targets.push({label:e.getAttribute('aria-label')||e.title||e.getAttribute('data-color')||e.getAttribute('data-color-index')||e.getAttribute('data-value'),className:typeof e.className==='string'?e.className:'',tag:e.tagName,width:r.width,height:r.height,x:r.x,y:r.y,right:r.right,bottom:r.bottom,centerHit:Boolean(hit&&(hit===e||e.contains(hit))),initial:{x:before.x,y:before.y},scrollContainer:scroller?{className:typeof scroller.className==='string'?scroller.className:'',scrollHeight:scroller.scrollHeight,clientHeight:scroller.clientHeight,initialScrollTop,scrollTop:scroller.scrollTop,overflowY:getComputedStyle(scroller).overflowY}:null})}const rect=root.getBoundingClientRect();return{open:true,viewport:{width:innerWidth,height:innerHeight},root:{role:root.getAttribute('role'),className:typeof root.className==='string'?root.className:'',x:rect.x,y:rect.y,width:rect.width,height:rect.height,right:rect.right,bottom:rect.bottom},targets,inputs:[...root.querySelectorAll('input[type="color"],.color-picker-input')].filter(visible).map(e=>{const r=e.getBoundingClientRect();return{className:typeof e.className==='string'?e.className:'',label:e.getAttribute('aria-label')||e.title||e.closest('label')?.textContent.trim()||'',x:r.x,y:r.y,width:r.width,height:r.height}})}})()`);
    await writeFile(join(output,'canvas-color-popover-open.json'),JSON.stringify({before,openState,state},null,2));
    check('canvas propriedades: Stroke abriu popover real de cores',opened&&state.open,{before,openState,state});
    check('canvas paleta: swatches reais >=44x44',state.targets.length>0&&state.targets.every(target=>target.width>=44&&target.height>=44),state.targets);
    check('canvas paleta: swatches alcancaveis apos rolagem no ancestor real',state.targets.length>0&&state.targets.every(target=>target.centerHit&&target.x>=0&&target.y>=0&&target.right<=state.viewport.width+1&&target.bottom<=state.viewport.height+1),state.targets);
    const last=state.targets.at(-1);
    check('canvas paleta: ultimo swatch de cor (sem eyedropper) acessivel',Boolean(last&&last.centerHit&&last.x>=0&&last.y>=0&&last.right<=state.viewport.width+1&&last.bottom<=state.viewport.height+1),last);
    await writeFile(join(output,'canvas-color-popover-scrolled-android.png'),await command(['exec-out','screencap','-p']));
    const scrolled=await cdp('Page.captureScreenshot');
    await writeFile(join(output,'canvas-color-popover-scrolled-webview.png'),Buffer.from(scrolled.data,'base64'));
    if(last){
      try {
        const point=await evaluate(`(()=>{const selector='button.color-picker__button--large:not(.color-picker__button--no-focus-visible),.color-picker-swatch:not(.color-picker__button--no-focus-visible)';const visible=e=>e.getClientRects().length>0&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden'&&Number(getComputedStyle(e).opacity)!==0;const roots=[...document.querySelectorAll('[role="dialog"],[role="menu"]')].filter(visible).filter(e=>!e.closest('.App-mobile-menu,.App-toolbar,.App-toolbar-container')).filter(e=>e.querySelector(selector));roots.sort((a,b)=>b.getBoundingClientRect().width*b.getBoundingClientRect().height-a.getBoundingClientRect().width*a.getBoundingClientRect().height);const root=roots[0],items=root?[...root.querySelectorAll(selector)].filter(visible).filter(e=>{const label=e.getAttribute('aria-label')||e.title||e.getAttribute('data-color')||e.getAttribute('data-color-index')||e.getAttribute('data-value');return Boolean(label?.trim())}):[],e=items.at(-1);if(!e)return null;e.scrollIntoView({block:'nearest',inline:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=x>=0&&y>=0&&x<innerWidth&&y<innerHeight?document.elementFromPoint(x,y):null;return{label:e.getAttribute('aria-label')||e.title||e.getAttribute('data-color')||e.getAttribute('data-color-index')||e.getAttribute('data-value'),x,y,dpr:devicePixelRatio,centerHit:Boolean(h&&(h===e||e.contains(h)))}})()`);
        if(!point?.centerHit)throw new Error(`Ultimo swatch de cor sem hit-test: ${JSON.stringify(point)}`);
        await shell('input','tap',String(Math.round(point.x*point.dpr+nativeWebView.x)),String(Math.round(point.y*point.dpr+nativeWebView.y)));
        await sleep(350);
        check('canvas paleta: ultimo swatch recebeu toque nativo',true,point);
        await writeFile(join(output,'canvas-color-popover-last-swatch-android.png'),await command(['exec-out','screencap','-p']));
      } catch(error) {
        check('canvas paleta: ultimo swatch recebeu toque nativo',false,{message:error.message,last});
      }
    }
  } catch(error) {
    check('canvas propriedades: Stroke abriu popover real de cores',false,{message:error.message,opened});
  } finally {
    try{await closeColorPopover();}catch(error){check('canvas paleta: popup fechado para seguir cenarios',false,{message:error.message});}
    try{await closePropertiesPanel();}catch(error){check('canvas propriedades: painel fechado para seguir cenarios',false,{message:error.message});}
  }
}

async function inspectSelectedLink() {
  let panel=null;
  try {
    if(await evaluate('Boolean(document.querySelector(".excalisidian-canvas__mobile-link-popover"))'))await pressEscape();
    if(await evaluate('Boolean(document.querySelector(".excalisidian-canvas__mobile-link-popover"))')){
      await tapElement('.excalisidian-canvas__mobile-link-trigger');
    }
    await until(async()=>!await evaluate('Boolean(document.querySelector(".excalisidian-canvas__mobile-link-popover"))'),'popover de link fechar');
    await closePropertiesPanel();
    await tapElement('.excalisidian-canvas__mobile-link-trigger');
    panel=await evaluate(`(()=>{const panel=document.querySelector('.excalisidian-canvas__mobile-link-popover');if(!panel)return null;const r=panel.getBoundingClientRect(),input=panel.querySelector('input,textarea'),buttons=[...panel.querySelectorAll('button')].map(e=>{const b=e.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return{label:e.getAttribute('aria-label')||e.title||e.textContent.trim(),x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom,centerHit:Boolean(hit&&(hit===e||e.contains(hit)))} });const i=input?.getBoundingClientRect();return{viewport:{width:innerWidth,height:innerHeight},label:panel.getAttribute('aria-label'),x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,scrollHeight:panel.scrollHeight,clientHeight:panel.clientHeight,overflowY:getComputedStyle(panel).overflowY,input:input?{placeholder:input.getAttribute('placeholder'),x:i.x,y:i.y,width:i.width,height:i.height,right:i.right,bottom:i.bottom,centerHit:(()=>{const h=document.elementFromPoint(i.x+i.width/2,i.y+i.height/2);return Boolean(h&&(h===input||input.contains(h)))})()}:null,buttons}})()`);
    await writeFile(join(output,'canvas-link-selected.json'),JSON.stringify(panel,null,2));
    check('canvas forma selecionada: campo de link abriu por toque',Boolean(panel?.input),panel);
    check('canvas forma selecionada: popover e acoes do link alcancaveis',Boolean(panel&&panel.x>=0&&panel.y>=0&&panel.right<=panel.viewport.width+1&&panel.bottom<=panel.viewport.height+1&&panel.input?.centerHit&&panel.buttons.every(button=>button.centerHit)),panel);
  } catch(error) {
    check('canvas forma selecionada: campo de link abriu por toque',false,{message:error.message,panel});
    check('canvas forma selecionada: popover e acoes do link alcancaveis',false,{message:error.message,panel});
  } finally {
    try{
      if(await evaluate('Boolean(document.querySelector(".excalisidian-canvas__mobile-link-popover"))'))await pressEscape();
      if(await evaluate('Boolean(document.querySelector(".excalisidian-canvas__mobile-link-popover"))'))await tapElement('.excalisidian-canvas__mobile-link-trigger');
      await until(async()=>!await evaluate('Boolean(document.querySelector(".excalisidian-canvas__mobile-link-popover"))'),'popover de link fechar');
      check('canvas link: popover fechado e estado verificavel',true,{closed:true});
    }catch(error){check('canvas link: popover fechado e estado verificavel',false,{message:error.message});}
    await closePropertiesPanel();
  }
}

async function captureLifecycleEvidence(name) {
  const pid=await shell('pidof','com.excalisidian.app');
  const geometry=await evaluate(`(()=>{const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};const controls=[...document.querySelectorAll('button,[role="button"],input:not([type="radio"]),textarea,[role="menuitem"],label:has(input[type="radio"])')].filter(e=>e.getClientRects().length).filter(e=>{const s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0}).filter(e=>!e.parentElement?.closest('button,[role="button"],[role="menuitem"]')).map(e=>{const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=x>=0&&y>=0&&x<innerWidth&&y<innerHeight?document.elementFromPoint(x,y):null;return{label:e.getAttribute('aria-label')||e.title||e.getAttribute('placeholder')||e.textContent.trim(),...rect(e),centerHit:Boolean(hit&&(hit===e||e.contains(hit)))}});const blockHandles=[...document.querySelectorAll('.cm-alca-bloco')].map(e=>{const button=e.querySelector('button,[role="button"]')||e,r=e.getBoundingClientRect(),b=button.getBoundingClientRect(),s=getComputedStyle(e),x=b.x+b.width/2,y=b.y+b.height/2,hit=x>=0&&y>=0&&x<innerWidth&&y<innerHeight?document.elementFromPoint(x,y):null;return{visible:s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0,container:rect(e),target:rect(button),centerHit:Boolean(hit&&(hit===button||button.contains(hit))),className:typeof button.className==='string'?button.className:''}});const surface=document.querySelector('.mobile-app');return{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scrollWidth:document.documentElement.scrollWidth,controls,blockHandles,background:surface?getComputedStyle(surface).backgroundColor:null,header:(()=>{const e=document.querySelector('header');return e?rect(e):null})(),text:document.body.innerText}})()`);
  geometry.formattingToolbar=await evaluate(`(()=>{const popup=document.querySelector('.cm-tooltip:has([role="toolbar"][aria-label="Formatação do texto"])');if(!popup)return[];const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};return[...popup.querySelectorAll('[role="toolbar"] button,[role="toolbar"] [role="button"]')].filter(e=>e.getClientRects().length).filter(e=>{const s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0}).map(e=>{const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=x>=0&&y>=0&&x<innerWidth&&y<innerHeight?document.elementFromPoint(x,y):null;return{label:e.getAttribute('aria-label')||e.title||e.textContent.trim(),...rect(e),centerHit:Boolean(hit&&(hit===e||e.contains(hit)))}})})()`);
  const native=await shell('dumpsys','window','-a');
  const nativeInfo=parseFocusedWindowDiagnostics(native);
  const screenshot=await command(['exec-out','screencap','-p']);
  const webviewScreenshot=await cdp('Page.captureScreenshot');
  await writeFile(join(output,`${name}-android.png`),screenshot);
  await writeFile(join(output,`${name}-webview.png`),Buffer.from(webviewScreenshot.data,'base64'));
  await writeFile(join(output,`${name}-window.txt`),`${nativeInfo.focusedWindow}\n\n${nativeInfo.focusedInsetsControl}`);
  const evidence={name,pid,geometry,focused:{line:nativeInfo.focusLine,windowId:nativeInfo.focusWindowId,component:nativeInfo.focusComponent,isAppFocused:nativeInfo.appIsFocused,vsysui:nativeInfo.vsysui,appearance:nativeInfo.appearance,statusLightBackground:nativeInfo.statusLightBackground,navigationLightBackground:nativeInfo.navigationLightBackground,insets:nativeInfo.insets,controlsMatch:nativeInfo.controlsMatch}};
  lifecycleEvidence.push(evidence);
  await writeFile(join(output,`${name}.json`),JSON.stringify(evidence,null,2));
  const hidden=geometry.controls.filter(control=>control.x<0||control.y<0||control.right>geometry.width+1||control.bottom>geometry.height+1||!control.centerHit);
  check(`${name}: app focado com status/nav controlados apos retorno`,nativeInfo.appIsFocused&&nativeInfo.controlsMatch.status&&nativeInfo.controlsMatch.navigation,evidence.focused);
  check(`${name}: controles tocaveis apos retorno`,hidden.length===0,hidden);
  if(name==='home-return-03-keyboard-dark')check(`${name}: acoes visiveis da barra de formatacao >=44x44 e tocaveis`,geometry.formattingToolbar.length>0&&geometry.formattingToolbar.every(control=>control.width>=44&&control.height>=44&&control.x>=0&&control.y>=0&&control.right<=geometry.width+1&&control.bottom<=geometry.height+1&&control.centerHit),geometry.formattingToolbar);
  const visibleBlockHandles=geometry.blockHandles.filter(handle=>handle.visible);
  check(`${name}: alça CodeMirror após toque não fica fora/obstruída`,visibleBlockHandles.every(handle=>handle.centerHit&&handle.target.x>=0&&handle.target.y>=0&&handle.target.right<=geometry.width+1&&handle.target.bottom<=geometry.height+1),visibleBlockHandles);
  check(`${name}: alvo real da alça CodeMirror >=44x44 quando visível`,visibleBlockHandles.every(handle=>handle.target.width>=44&&handle.target.height>=44),visibleBlockHandles);
  return evidence;
}

async function exerciseHomeReturnDark() {
  const pidBefore=await shell('pidof','com.excalisidian.app');
  const before=await captureLifecycleEvidence('home-return-00-before');
  await shell('input','keyevent','3');
  await sleep(1500);
  const pidHome=await shell('pidof','com.excalisidian.app');
  const homeDump=await shell('dumpsys','window','-a');
  const homeFocus=homeDump.split('\n').filter(line=>/mCurrentFocus=|mFocusedApp=/.test(line));
  await writeFile(join(output,'home-return-01-home-android.png'),await command(['exec-out','screencap','-p']));
  await writeFile(join(output,'home-return-01-home-focus.txt'),homeFocus.join('\n'));
  await shell('am','start','-n','com.excalisidian.app/.MainActivity');
  await until(async()=>evaluate('Boolean(document.querySelector(".mobile-app"))'),'interface mobile apos Home',45000);
  await connect();
  const pidAfter=await shell('pidof','com.excalisidian.app');
  const returned=await captureLifecycleEvidence('home-return-02-return-dark');
  const background=returned.geometry.background?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  const luminance=background?((Number(background[1])*0.2126+Number(background[2])*0.7152+Number(background[3])*0.0722)/255):null;
  const darkBars=returned.focused.statusLightBackground===false&&returned.focused.navigationLightBackground===false&&luminance!==null&&luminance<0.5;
  check('Home/retorno escuro preserva o mesmo processo',Boolean(pidBefore&&pidBefore===pidHome&&pidHome===pidAfter),{pidBefore,pidHome,pidAfter});
  check('Home/retorno escuro preserva appearance nativa escura sem restart',darkBars,{background:returned.geometry.background,luminance,focused:returned.focused,before:before.focused});
  await click(['Voltar','Back']);await openNote();await click(['Editar','Edit']);await evaluate('document.querySelector(".cm-content")?.focus()');
  const editor=await evaluate(`(()=>{const r=document.querySelector('.cm-content').getBoundingClientRect();return{x:(r.x+Math.min(r.width/2,80))*devicePixelRatio,y:(r.y+Math.min(r.height/2,70))*devicePixelRatio}})()`);
  await shell('input','tap',String(Math.round(editor.x+nativeWebView.x)),String(Math.round(editor.y+nativeWebView.y)));
  await sleep(3500);
  const ime=await shell('dumpsys','input_method');
  await writeFile(join(output,'home-return-03-keyboard-dumpsys.txt'),ime);
  const keyboardShown=/mInputShown=true/.test(ime)&&/mWindowVisible=true|mIsWindowVisible=true|mDecorViewVisible=true/.test(ime);
  check('teclado volta a abrir apos Home/retorno no tema escuro',keyboardShown,ime.split('\n').filter(line=>/Shown|WindowVisible|DecorViewVisible/.test(line)));
  await captureLifecycleEvidence('home-return-03-keyboard-dark');
  await shell('input','keyevent','111');
}

const vaultName=`QA visual ${runId}`;
const noteName='Nota com titulo longo para validar controles no telefone';
const content='\n\nQA visual: edição com acentos — ação, coração e seleção.\nSegunda linha persistida offline.';
async function openVault() {
  await evaluate(`(()=>{const row=[...document.querySelectorAll('.mobile-app__row')].find(e=>e.querySelector('strong')?.textContent===${JSON.stringify(vaultName)});if(!row)throw Error('Vault de teste ausente');row.querySelector('button').click()})()`);
  await until(async()=>evaluate(`Boolean([...document.querySelectorAll('button')].find(b=>['Nova nota','New note'].includes(b.textContent.trim())))`),'vault aberto');
}
async function openNote() {
  await click([`${noteName}.md`],'.mobile-app__row');
  await until(async()=>evaluate('Boolean(document.querySelector(".cm-editor"))'),'editor de nota');
}

try {
  console.log(`Resultados: ${output}`);
  await until(async()=>await shell('getprop','sys.boot_completed')==='1','boot do emulador QA',600000);
  console.log('Android pronto; configurando somente o AVD de QA.');
  if(await shell('getprop','ro.kernel.qemu')!=='1')throw new Error('Teste recusado fora de emulador.');
  report.device={serial,android:await shell('getprop','ro.build.version.release'),abis:await shell('getprop','ro.product.cpu.abilist'),fingerprint:await shell('getprop','ro.build.fingerprint')};
  await shell('settings','put','secure','show_ime_with_hard_keyboard','1');
  await shell('wm','size','750x1624');await shell('wm','density','320');
  await shell('settings','put','system','accelerometer_rotation','0');
  await shell('settings','put','system','user_rotation','0');
  await shell('wm','dismiss-keyguard');
  await shell('cmd','uimode','night','no');
  console.log('Instalando a copia imutavel do APK.');
  let sameApk=false;
  try {
    const installed=(await shell('pm','path','com.excalisidian.app')).split('\n').find(p=>p.startsWith('package:'))?.slice(8);
    if(installed)sameApk=(await shell('sha256sum',installed)).split(/\s/)[0]===report.sha256;
  } catch { /* Sem app instalado, a instalacao abaixo e obrigatoria. */ }
  if(!sameApk)await command(['install','-r',apkSnapshot],240000);
  else console.log('APK instalado possui o mesmo SHA-256; preservando a instalacao.');
  console.log('APK instalado; abrindo a WebView real.');
  await shell('svc','wifi','enable');await shell('svc','data','enable');
  await shell('am','force-stop','com.excalisidian.app');
  await shell('am','start','-n','com.excalisidian.app/.MainActivity');
  await sleep(2500);await connect();
  await capture('01-vaults-375-claro');
  await inspectVaultCreateAfterNativeScroll();
  await fillInput(vaultName);await click(['Criar vault','Create vault']);
  await until(async()=>evaluate(`Boolean([...document.querySelectorAll('button')].find(b=>['Nova nota','New note'].includes(b.textContent.trim())))`),'criacao real do vault');
  await capture('02-arquivos-375');
  await click(['Nova nota','New note']);await fillInput(noteName);await click(['Criar','Create']);
  await until(async()=>evaluate('Boolean(document.querySelector(".cm-editor"))'),'nota criada');
  await capture('03-nota-leitura-375');
  await click(['Editar','Edit']);
  await evaluate(`document.querySelector('.cm-content').focus()`);
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'End',code:'End',modifiers:2,windowsVirtualKeyCode:35});
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'End',code:'End',modifiers:2,windowsVirtualKeyCode:35});
  await cdp('Input.insertText',{text:content});
  await capture('04-nota-edicao-375');
  // Toque pelo Android (nao apenas foco JS) para abrir o teclado real do emulador.
  const editor=await evaluate(`(()=>{const r=document.querySelector('.cm-content').getBoundingClientRect();return{x:(r.x+Math.min(r.width/2,80))*devicePixelRatio,y:(r.y+Math.min(r.height/2,70))*devicePixelRatio}})()`);
  await shell('input','tap',String(Math.round(editor.x+nativeWebView.x)),String(Math.round(editor.y+nativeWebView.y)));
  await sleep(5000);
  const ime=await shell('dumpsys','input_method');
  await writeFile(join(output,'keyboard-dumpsys.txt'),ime);
  check('teclado real foi exibido',/mInputShown=true/.test(ime)&&/mWindowVisible=true|mIsWindowVisible=true|mDecorViewVisible=true/.test(ime),ime.split('\n').filter(line=>/Shown|WindowVisible|DecorViewVisible/.test(line)));
  const keyboardGeometry=await capture('05-nota-teclado-375');
  check('editor acompanha altura visivel do teclado',keyboardGeometry.viewport===null||keyboardGeometry.height<=keyboardGeometry.viewport.height+1,keyboardGeometry.viewport);
  await click(['Salvar agora','Save now']);
  await shell('input','keyevent','111');
  await click(['Voltar','Back']);
  await openNote();
  check('nota salva e reaberta com acentos',await evaluate(`document.querySelector('.cm-content').textContent.includes('coração')`),await evaluate('document.querySelector(".cm-content").textContent'));
  await click(['Voltar','Back']);
  await click(['Novo desenho','New drawing']);await fillInput('Desenho QA visual');await click(['Criar','Create']);
  await until(async()=>evaluate('document.querySelectorAll("canvas").length>0'),'canvas real');
  await capture('06-canvas-leitura-375');await click(['Editar','Edit']);
  await sleep(1000);await capture('07-canvas-edicao-375');
  await canvasControlInventory('07-sem-selecao',false);
  await exerciseCanvasMenu('07-sem-selecao');
  // Seleciona a ferramenta existente e desenha por toque Android, nao por mouse desktop.
  await evaluate('document.activeElement?.blur()');
  const rectangleControl=await evaluate(`(()=>{const label=[...document.querySelectorAll('label')].find(e=>/^Rectangle|^Retângulo/.test(e.title));if(!label)return false;const r=label.getBoundingClientRect();return{x:(r.x+r.width/2)*devicePixelRatio,y:(r.y+r.height/2)*devicePixelRatio}})()`);
  check('ferramenta retangulo disponivel no canvas',rectangleControl,{});
  if(rectangleControl)await shell('input','tap',String(Math.round(rectangleControl.x+nativeWebView.x)),String(Math.round(rectangleControl.y+nativeWebView.y)));
  const drawDpr=await evaluate('devicePixelRatio');
  await shell('input','swipe',String(Math.round(90*drawDpr+nativeWebView.x)),String(Math.round(410*drawDpr+nativeWebView.y)),String(Math.round(230*drawDpr+nativeWebView.x)),String(Math.round(550*drawDpr+nativeWebView.y)),'500');
  await sleep(1200);await click(['Salvar agora','Save now']);
  await capture('08-canvas-com-forma-375');
  await canvasControlInventory('08-forma-selecionada',true);
  await inspectSelectedProperties();
  await exercisePropertyRangeCenter();
  await inspectActiveColorPopover();
  await inspectSelectedLink();
  await exerciseCanvasMenu('08-forma-selecionada');
  await shell('settings','put','system','user_rotation','1');await sleep(2000);
  await capture('09-canvas-paisagem');
  await shell('settings','put','system','user_rotation','0');
  await shell('wm','size','828x1792');await sleep(1500);await capture('10-canvas-414');
  await shell('cmd','uimode','night','yes');await sleep(1500);await capture('11-canvas-414-escuro');
  await click(['Voltar','Back']);
  await shell('svc','wifi','disable');await shell('svc','data','disable');
  await shell('am','force-stop','com.excalisidian.app');
  await shell('am','start','-n','com.excalisidian.app/.MainActivity');
  await sleep(2000);await connect();await openVault();await openNote();
  check('nota persiste apos restart offline',await evaluate(`document.querySelector('.cm-content').textContent.includes('coração')`),await evaluate('document.body.innerText'));
  await capture('12-nota-reaberta-offline');
  await click(['Voltar','Back']);await click(['Desenho QA visual.draw.md'],'.mobile-app__row');
  await until(async()=>evaluate('document.querySelectorAll("canvas").length>0'),'desenho reaberto offline');
  await capture('13-canvas-reaberto-offline');
  const registryPaths=await shell('run-as','com.excalisidian.app','find','.','-name','mobile-vaults.json');
  const registryPath=registryPaths.split('\n').find(p=>p.startsWith('./'));
  if(!registryPath)throw new Error('Registro nativo de vaults ausente.');
  const registry=JSON.parse(await shell('run-as','com.excalisidian.app','cat',registryPath)).registro;
  const testedVault=registry.vaults.find(v=>v.nome===vaultName);
  if(!testedVault)throw new Error('Vault desta execucao ausente no registro nativo.');
  const paths=await shell('run-as','com.excalisidian.app','find','.','-name','Desenho QA visual.draw.md');
  const drawingPath=paths.split('\n').find(p=>p.includes(`/vaults/${testedVault.id}/`));
  if(drawingPath){const drawing=await shell('run-as','com.excalisidian.app','cat',drawingPath);await writeFile(join(output,'desenho-salvo.draw.md'),drawing);check('desenho salvo contem forma',/"type"\s*:\s*"rectangle"/.test(drawing),{drawingPath});}
  else check('arquivo nativo do desenho localizado',false,paths);
  await exerciseHomeReturnDark();
  await writeFile(join(output,'logcat.txt'),await command(['logcat','-d','-t','1200']));
  check('sem excecoes JavaScript',report.errors.length===0,report.errors);
} catch(error) {
  check('execucao completa dos cenarios',false,{message:error.message,stack:error.stack,code:error.code,signal:error.signal,killed:error.killed,stderr:error.stderr?.toString(),stdout:error.stdout?.toString()});
  try {await writeFile(join(output,'falha-android.png'),await command(['exec-out','screencap','-p']));await writeFile(join(output,'logcat.txt'),await command(['logcat','-d','-t','1200']));}catch{}
} finally {
  if(socket)socket.close();
  check('todos os 13 cenarios visuais foram executados',report.captures.length===13,{expected:13,actual:report.captures.length});
  report.finishedAt=new Date().toISOString();
  report.summary={passed:report.checks.filter(c=>c.passed).length,failed:report.checks.filter(c=>!c.passed).length};
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
  await writeFile(join(output,'index.html'),`<!doctype html><meta charset="utf-8"><title>QA Android</title><h1>QA visual Android</h1><p>${report.summary.passed} verificações passaram; ${report.summary.failed} falharam.</p>${report.captures.map(c=>`<section><h2>${c.name}</h2><a href="${c.name}.json">Geometria</a><br><img style="max-width:420px" src="${c.name}-android.png"></section>`).join('')}`);
  console.log(JSON.stringify(report.summary));console.log(`Relatorio: ${join(output,'index.html')}`);
  process.exitCode=report.summary.failed?1:0;
}
