export function parseNativeWebViewBounds(hierarchy) {
  if (!hierarchy.includes('</hierarchy>')) return null;
  const node = hierarchy.match(/<node\b(?=[^>]*\bclass="android\.webkit\.WebView")(?=[^>]*\bbounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]")[^>]*>/);
  const values = node?.slice(1).map(Number);
  if (!values || values.length !== 4 || values.some(value => !Number.isFinite(value))) return null;
  const [left, top, right, bottom] = values;
  if (right <= left || bottom <= top) return null;
  return {x:left,y:top,width:right-left,height:bottom-top};
}

export function parseFocusedWindowDiagnostics(dump) {
  const focusLine=dump.split('\n').find(line=>/mCurrentFocus=.*com\.excalisidian\.app/i.test(line))??'';
  const focusComponent=focusLine.match(/com\.excalisidian\.app[^\s}]*/i)?.[0]??'';
  const focusWindowId=focusLine.match(/mCurrentFocus=Window\{([^\s}]+)/i)?.[1]??'';
  const headers=[...dump.matchAll(/^\s*Window #\d+\s+Window\{([^}\n]+)\}:/gm)];
  const header=headers.find(match=>match[1].startsWith(`${focusWindowId} `)&&match[1].includes(focusComponent));
  const focusedWindow=header?dump.slice(header.index,headers.find(match=>match.index>header.index)?.index??dump.length):'';
  const appIsFocused=Boolean(focusLine&&focusWindowId&&focusComponent&&focusedWindow&&focusedWindow.includes(`Window{${focusWindowId} u0 ${focusComponent}}`));
  const vsysui=focusedWindow.match(/^\s*vsysui=(.*)$/mi)?.[1]??null;
  const appearance=focusedWindow.match(/^\s*apr=(.*)$/mi)?.[1]??null;
  const legacyFlags=[...focusedWindow.matchAll(/(?:mSystemUiVisibility|systemUiVisibility|systemUiVisibilityFlags)=0x([0-9a-f]+)/gi)].map(match=>Number.parseInt(match[1],16));
  const appearanceHex=[...focusedWindow.matchAll(/(?:mAppearance|appearance)\s*[=:]\s*0x([0-9a-f]+)/gi)].map(match=>Number.parseInt(match[1],16));
  const nativeAttributesPresent=/^\s*mAttrs=\{/mi.test(focusedWindow);
  const statusLightBackground=vsysui!==null?/\bLIGHT_STATUS_BAR\b/i.test(vsysui):appearance!==null?/\bLIGHT_STATUS_BARS\b/i.test(appearance):legacyFlags.length?Boolean(legacyFlags.at(-1)&0x2000):appearanceHex.length?Boolean(appearanceHex.at(-1)&0x8):nativeAttributesPresent?false:null;
  const navigationLightBackground=vsysui!==null?/\bLIGHT_NAVIGATION_BAR\b/i.test(vsysui):appearance!==null?/\bLIGHT_NAVIGATION_BARS\b/i.test(appearance):legacyFlags.length?Boolean(legacyFlags.at(-1)&0x10):appearanceHex.length?Boolean(appearanceHex.at(-1)&0x10):nativeAttributesPresent?false:null;
  const insetsStart=dump.indexOf('WindowInsetsStateController');
  const policyStart=insetsStart>=0?dump.indexOf('\n  InsetsPolicy',insetsStart):-1;
  const insetsSection=insetsStart>=0?dump.slice(insetsStart,policyStart>=0?policyStart:dump.length):'';
  const controlMapStart=insetsSection.indexOf('Control map:');
  const controlHeader=`Window{${focusWindowId} u0 ${focusComponent}}:`;
  const focusedControlStart=controlMapStart>=0?insetsSection.indexOf(controlHeader,controlMapStart):-1;
  const focusedInsetsControl=focusedControlStart>=0?insetsSection.slice(focusedControlStart,insetsSection.indexOf('\n      Window{',focusedControlStart+controlHeader.length)>=0?insetsSection.indexOf('\n      Window{',focusedControlStart+controlHeader.length):insetsSection.length):'';
  const insetState=insetsSection.slice(0,controlMapStart>=0?controlMapStart:insetsSection.length);
  const insets=[...insetState.matchAll(/InsetsSource id=[^\n]*type=(statusBars|navigationBars) frame=\[(\d+),(\d+)\]\[(\d+),(\d+)\] visible=(true|false)/gi)].map(match=>({type:match[1],left:Number(match[2]),top:Number(match[3]),right:Number(match[4]),bottom:Number(match[5]),visible:match[6].toLowerCase()==='true'}));
  return {
    focusLine,focusWindowId,focusComponent,appIsFocused,focusedWindow,focusedInsetsControl,insetState,vsysui,appearance,nativeAttributesPresent,
    legacyFlags,appearanceHex,statusLightBackground,navigationLightBackground,insets,
    controlsMatch:{status:focusedInsetsControl.includes('mType=statusBars'),navigation:focusedInsetsControl.includes('mType=navigationBars')},
  };
}
