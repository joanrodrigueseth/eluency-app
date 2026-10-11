/** Self-contained renderer: neither document bytes nor signed URLs leave this WebView. */
export function createPdfViewerHtml(pdfBase64: string, library: string, worker: string, resources: Record<string, string> = {}): string {
  const literal = (value: string) => JSON.stringify(value).replace(/</g, "\\u003c");
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' blob:; worker-src blob:; connect-src blob:; font-src blob: data:; img-src blob: data:; style-src 'unsafe-inline'">
<style>body{margin:0;background:#eef1f5;font:16px system-ui;color:#10253f}nav{position:sticky;top:0;display:flex;justify-content:center;align-items:center;gap:16px;padding:8px;background:white;z-index:1}button{padding:12px;border:1px solid #c5d2df;border-radius:8px;background:white}canvas{display:block;margin:12px auto;max-width:100%;height:auto;background:white}#error{padding:20px}.sr{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}</style></head>
<body><nav><button id="prev" aria-label="Previous page">Previous</button><span id="page" aria-live="polite">Loading…</span><button id="next" aria-label="Next page">Next</button></nav><canvas id="canvas" aria-hidden="true"></canvas><div id="text" class="sr"></div><div id="error" role="alert"></div>
<script type="module">
const notify=(type,message)=>window.ReactNativeWebView?.postMessage(JSON.stringify({type,message}));
try {
 const libraryUrl=URL.createObjectURL(new Blob([${literal(library)}],{type:'text/javascript'}));
 const workerUrl=URL.createObjectURL(new Blob([${literal(worker)}],{type:'text/javascript'}));
 const pdfjs=await import(libraryUrl); pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
 const data=Uint8Array.from(atob(${literal(pdfBase64)}),c=>c.charCodeAt(0));
 const resources=${JSON.stringify(resources).replace(/</g, "\\u003c")};
 class BundledBinaryDataFactory {async fetch({filename}){
   if(!resources[filename])throw new Error('Missing bundled PDF resource');
   return Uint8Array.from(atob(resources[filename]),c=>c.charCodeAt(0));
 }}
 const task=pdfjs.getDocument({data,useSystemFonts:true,disableAutoFetch:true,useWorkerFetch:false,
   BinaryDataFactory:BundledBinaryDataFactory,cMapUrl:'bundled:cmaps/',standardFontDataUrl:'bundled:fonts/',wasmUrl:'bundled:wasm/'});
 task.onPassword=()=>{notify('error','This PDF is password protected. Ask your teacher for an unlocked copy.');task.destroy();};
 const doc=await task.promise; let pageNumber=1, rendering=false;
 const canvas=document.getElementById('canvas'),ctx=canvas.getContext('2d');
 async function render(){if(rendering)return;rendering=true;
  document.getElementById('prev').disabled=true;document.getElementById('next').disabled=true;
  try{const page=await doc.getPage(pageNumber),base=page.getViewport({scale:1});
   const scale=Math.min((window.innerWidth-16)/base.width*window.devicePixelRatio,2);
   const viewport=page.getViewport({scale});canvas.width=viewport.width;canvas.height=viewport.height;
   await page.render({canvasContext:ctx,viewport}).promise;
   const text=await page.getTextContent();document.getElementById('text').textContent=text.items.map(item=>item.str||'').join(' ');
   document.getElementById('page').textContent=pageNumber+' / '+doc.numPages;
   notify('ready');page.cleanup();
  }finally{rendering=false;document.getElementById('prev').disabled=pageNumber<=1;document.getElementById('next').disabled=pageNumber>=doc.numPages;}
 }
 document.getElementById('prev').onclick=()=>{if(pageNumber>1&&!rendering){pageNumber--;render().catch(fail);}};
 document.getElementById('next').onclick=()=>{if(pageNumber<doc.numPages&&!rendering){pageNumber++;render().catch(fail);}};
 function fail(){document.getElementById('error').textContent='This PDF could not be displayed.';notify('error','This PDF could not be displayed.');}
 await render();
}catch(error){notify('error','This PDF could not be displayed. Check your connection and try again.');}
</script></body></html>`;
}
