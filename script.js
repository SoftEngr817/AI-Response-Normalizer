
const SETTINGS_KEY='simpleTextToolSettings';
const defaultMap={'✅':'-'};
const qs=id=>document.getElementById(id);
const saveSettings=obj=>localStorage.setItem(SETTINGS_KEY,JSON.stringify({...loadSettings(),...obj}));
const loadSettings=()=>JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');

/* filters */
const filters={
 trimBlanks:t=>t.replace(/^(?:\s*[\r\n])+|(?:\s*[\r\n])+$/g,''),
 collapseBlanks:t=>t.replace(/(\r?\n){2,}/g,'\n\n'),
 bold:t=>t.replace(/(^|[\s\W])(\*\*|__)(?=\S)([\s\S]*?\S)\2(?!\w)/g,'$1$3'),
 italic:t=>t.replace(/(^|[\s\W])(\*|_)(?=\S)([^\r]*?\S)\2(?!\w)/g,'$1$3'),
 code:t=>t.replace(/`{1,3}([^`]*)`{1,3}/g,'$1'),
 linkText:t=>t.replace(/\[([^\]]+)]\([^)]*\)/g,'$1'),
 linkURL:t=>t.replace(/\[[^\]]+]\((https?:\/\/[^\)]+)\)/gi, (m, url) => 
   url.replace(/\/$/, '') // strip trailing slash
 )
};

const normalizeAlways=raw=>raw.split(/\r?\n/).map(l=>l.replace(/\s+$/g,'')).join('\n')
                               .replace(/[‘’‛‹›]/g,"'").replace(/[“”«»„″]/g,'\"');

function processText(raw){
 let out=normalizeAlways(raw);
 const active=[...document.querySelectorAll('#filter-group input:checked')].map(cb=>cb.value);
 active.forEach(k=>out=filters[k](out));
 const map=loadSettings().customMap||defaultMap;
 for(const [k,v] of Object.entries(map)){out=out.split(k).join(v);}
 return out;
}

function toast(msg,d=2000){const t=qs('toast');t.textContent=msg;t.style.opacity='1';setTimeout(()=>t.style.opacity='0',d);}

/* mapping table helpers */
const addRow=(k='',v='')=>{
 const tr=document.createElement('tr');
 tr.innerHTML=`<td><input value="${k.replace(/"/g,'&quot;')}"></td><td><input value="${v.replace(/"/g,'&quot;')}"></td><td><button class="del">×</button></td>`;
 qs('mapping-table').querySelector('tbody').appendChild(tr);
};
const mapToTable=map=>{qs('mapping-table').querySelector('tbody').innerHTML=''; Object.entries(map).forEach(([k,v])=>addRow(k,v));};
const tableToMap=()=>{const obj={};[...qs('mapping-table').querySelectorAll('tbody tr')].forEach(r=>{const [a,b]=r.querySelectorAll('input'); if(a.value) obj[a.value]=b.value;});return obj;};

/* L1/L2 dependency management */
function updateL2State() {
 const l1Checkbox = document.querySelector('input[value="linkText"]');
 const l2Checkbox = document.querySelector('input[value="linkURL"]');
 
 if (l1Checkbox && l2Checkbox) {
   l2Checkbox.disabled = l1Checkbox.checked;
 }
}

document.addEventListener('DOMContentLoaded',()=>{
 const input=qs('input'),output=qs('output'),clearFocusBtn=qs('clear-focus'),copyBtn=qs('copy-btn');
 const filterGroup=qs('filter-group');
 const settingsBtn=qs('open-settings'),mappingBtn=qs('open-mapping');
 const settingsDlg=qs('settings-modal'),mappingDlg=qs('mapping-modal');
 const fontSizeIn=qs('font-size'),fontFamilyIn=qs('font-family');
 const addRowBtn=qs('add-row'),saveMapBtn=qs('save-mapping'),exportBtn=qs('export-json'),importBtn=qs('import-json'),fileInput=qs('file-import');
 
 // Help modal
  const helpBtn   = document.getElementById('open-help');
  const helpModal = document.getElementById('help-modal');
  const helpClose = document.getElementById('help-close');

  helpBtn.addEventListener('click', () => helpModal.showModal());
  helpClose.addEventListener('click', () => helpModal.close());

 /* apply saved */
 const saved=loadSettings();
 if(saved.fontSize) document.documentElement.style.setProperty('--font-size',saved.fontSize+'px');
 if(saved.fontFamily) document.documentElement.style.setProperty('--font-family',saved.fontFamily);
 if(saved.filters){[...filterGroup.querySelectorAll('input')].forEach(cb=>cb.checked=saved.filters.includes(cb.value));}
 mapToTable(saved.customMap||defaultMap);

 /* Apply L1/L2 dependency on load */
 updateL2State();

 const render=()=>output.textContent=processText(input.value);
 input.addEventListener('input',render);
 filterGroup.addEventListener('change',(e)=>{
   /* Update L2 state when L1 changes */
   if (e.target.value === 'linkText') {
     updateL2State();
   }
   saveSettings({filters:[...filterGroup.querySelectorAll('input:checked')].map(cb=>cb.value)});
   render();
 });

 clearFocusBtn.addEventListener('click',()=>{
    input.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
 });
 
 copyBtn.addEventListener('click',()=>navigator.clipboard.writeText(output.textContent).then(()=>toast('Copied')));
 settingsBtn.addEventListener('click',()=>{const saved=loadSettings(); fontSizeIn.value=saved.fontSize||16;fontFamilyIn.value=saved.fontFamily||''; settingsDlg.showModal();});
 qs('save-settings').addEventListener('click',e=>{e.preventDefault();const sz=parseInt(fontSizeIn.value,10);const fam=fontFamilyIn.value.trim(); if(sz){saveSettings({fontSize:sz}); document.documentElement.style.setProperty('--font-size',sz+'px');} if(fam||true){saveSettings({fontFamily:fam}); document.documentElement.style.setProperty('--font-family',fam);} settingsDlg.close();});
 mappingBtn.addEventListener('click',()=>mappingDlg.showModal());
 addRowBtn.addEventListener('click',()=>addRow());
 qs('mapping-table').addEventListener('click',e=>{if(e.target.classList.contains('del')) e.target.closest('tr').remove();});
 saveMapBtn.addEventListener('click',()=>{saveSettings({customMap:tableToMap()});mappingDlg.close();render();});
 exportBtn.addEventListener('click',()=>{const data=JSON.stringify(tableToMap(),null,2);const blob=new Blob([data],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='mapping.json';a.click();URL.revokeObjectURL(url);});
 importBtn.addEventListener('click',()=>fileInput.click());
 fileInput.addEventListener('change',()=>{const f=fileInput.files[0];if(!f)return;const fr=new FileReader();fr.onload=e=>{try{const obj=JSON.parse(e.target.result);mapToTable(obj);toast('Loaded JSON');}catch{toast('Invalid JSON',3000);} };fr.readAsText(f); fileInput.value='';});
 render();
});
