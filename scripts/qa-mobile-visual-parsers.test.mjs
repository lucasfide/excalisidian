import {describe,expect,it} from 'vitest';
import {parseFocusedWindowDiagnostics,parseNativeWebViewBounds} from './qa-mobile-visual-parsers.mjs';

const WEBVIEW_XML=`<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0"><node NAF="true" index="0" text="" class="android.webkit.WebView" package="com.excalisidian.app" bounds="[0,0][750,1624]" /></hierarchy>`;
const ANR_XML=`<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0"><node class="android.widget.FrameLayout" package="android" bounds="[19,639][731,1031]"><node text="System UI isn't responding" class="android.widget.TextView" package="android" /></node></hierarchy>`;
const APP_WINDOW='fdc0b90 u0 com.excalisidian.app/com.excalisidian.app.MainActivity';

function windowDump({appVsysui='LIGHT_STATUS_BAR LIGHT_NAVIGATION_BAR',appAppearance='LIGHT_STATUS_BARS LIGHT_NAVIGATION_BARS'}={}) {
  return [
    `  mCurrentFocus=Window{${APP_WINDOW}}`,
    'WindowInsetsStateController',
    '  InsetsState',
    '    InsetsSource id=61d80000 type=statusBars frame=[0,0][750,94] visible=true flags=',
    '    InsetsSource id=95060001 type=navigationBars frame=[0,1576][750,1624] visible=true flags=',
    '  Control map:',
    `      Window{${APP_WINDOW}}:`,
    '        InsetsSourceControl: {95060001 mType=navigationBars initiallyVisible}',
    '        InsetsSourceControl: {61d80000 mType=statusBars initiallyVisible}',
    '      Window{b1b23e1 u0 Taskbar}:',
    '        InsetsSourceControl: {95060001 mType=navigationBars initiallyVisible}',
    '  InsetsPolicy',
    `  Window #8 Window{${APP_WINDOW}}:`,
    `      vsysui=${appVsysui}`,
    `      apr=${appAppearance}`,
    '  Window #9 Window{7fd951c u0 com.android.systemui/com.android.systemui.StatusBar}:',
    '      vsysui=LAYOUT_STABLE',
    '      apr=',
  ].join('\n');
}

describe('parsers do QA visual Android',()=>{
  it('le os limites reais da WebView em pixels do emulador',()=>{
    expect(parseNativeWebViewBounds(WEBVIEW_XML)).toEqual({x:0,y:0,width:750,height:1624});
  });

  it('nao inventa bounds quando a hierarquia contem somente o dialogo de ANR',()=>{
    expect(parseNativeWebViewBounds(ANR_XML)).toBeNull();
  });

  it('le appearance da janela focada sem herdar flags opostas da System UI',()=>{
    const parsed=parseFocusedWindowDiagnostics(windowDump());
    expect(parsed.appIsFocused).toBe(true);
    expect(parsed.statusLightBackground).toBe(true);
    expect(parsed.navigationLightBackground).toBe(true);
    expect(parsed.focusedWindow).toContain('Window #8 Window{fdc0b90');
    expect(parsed.focusedWindow).not.toMatch(/com\.android\.systemui|Taskbar/);
  });

  it('interpreta flags vazias da janela focada como modo escuro',()=>{
    const parsed=parseFocusedWindowDiagnostics(windowDump({appVsysui:'',appAppearance:''}));
    expect(parsed.appIsFocused).toBe(true);
    expect(parsed.statusLightBackground).toBe(false);
    expect(parsed.navigationLightBackground).toBe(false);
  });

  it('interpreta mAttrs sem appearance omitida no dump Android como flags escuras',()=>{
    const dump=windowDump().replace('      vsysui=LIGHT_STATUS_BAR LIGHT_NAVIGATION_BAR\n      apr=LIGHT_STATUS_BARS LIGHT_NAVIGATION_BARS','      mAttrs={(0,0)(fillxfill) sim={adjust=pan} layoutInDisplayCutoutMode=always ty=BASE_APPLICATION');
    const parsed=parseFocusedWindowDiagnostics(dump);
    expect(parsed.appIsFocused).toBe(true);
    expect(parsed.nativeAttributesPresent).toBe(true);
    expect(parsed.statusLightBackground).toBe(false);
    expect(parsed.navigationLightBackground).toBe(false);
  });

  it('associa os insets aos controles da mesma janela focada',()=>{
    const parsed=parseFocusedWindowDiagnostics(windowDump());
    expect(parsed.controlsMatch).toEqual({status:true,navigation:true});
    expect(parsed.insets).toEqual([
      {type:'statusBars',left:0,top:0,right:750,bottom:94,visible:true},
      {type:'navigationBars',left:0,top:1576,right:750,bottom:1624,visible:true},
    ]);
    expect(parsed.focusedInsetsControl).toContain(APP_WINDOW);
    expect(parsed.focusedInsetsControl).not.toContain('Taskbar');
  });
});
