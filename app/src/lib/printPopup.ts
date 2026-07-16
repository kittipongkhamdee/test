// Opens a standalone popup window with self-contained HTML/CSS and triggers
// window.print() once fonts are ready, then closes itself after printing.
// This bypasses the app's own layout (sidebar, flex containers, responsive
// breakpoints) entirely, which is what caused blank print pages on Android
// Chrome when printing the app's own routes directly via window.print().

export function escHtml(val: string | number): string {
  return String(val)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function openPrintPopup(css: string, bodyHTML: string) {
  const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>${css}</style>
</head>
<body>
${bodyHTML}
<script>
(function(){
  var done=false;
  function doPrint(){
    if(done)return;done=true;
    window.addEventListener('afterprint',function(){window.close();},{once:true});
    window.print();
  }
  if(document.fonts&&document.fonts.ready){
    document.fonts.ready.then(function(){setTimeout(doPrint,100);});
  } else {
    window.addEventListener('load',function(){setTimeout(doPrint,400);});
  }
})();
</` + `script>
</body>
</html>`;
  const win = window.open("", "_blank");
  if (!win) { window.print(); return; }
  win.document.write(html);
  win.document.close();
}
